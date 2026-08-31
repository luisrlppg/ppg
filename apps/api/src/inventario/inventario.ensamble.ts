import { BadRequestException, NotFoundException } from "@nestjs/common";
import { dec } from "../common/util";
import { PrismaService } from "../prisma/prisma.service";

export interface EnsambleParams {
  variantId: number;
  cantidad: number;
  locationId: number;
  ref?: string;
  userId?: number;
}

export interface EnsambleDeps {
  prisma: PrismaService;
  resolveComponentVariant: (componentProductId: number, combo: { productId: number; variantAttributes: { attributeId: number; valueId: number }[] }) => Promise<{
    id: number;
    sku: string;
    nombre: string;
  } | null>;
  afterStockChange: (variantId: number) => Promise<{ notificado: boolean; canales: string[] }>;
}

export interface EnsambleDetalle {
  variantId: number;
  sku: string;
  nombre: string;
  requerido: number;
  disponible: number;
}

/**
 * Registra un ensamble de un combo (producto con BOM). Consume los componentes
 * EXACTOS resolviendo la variante correcta por atributos (multi-nivel) y suma
 * el producto terminado a la ubicación indicada.
 */
export async function ensamblar(deps: EnsambleDeps, params: EnsambleParams) {
  const { prisma } = deps;
  const { variantId, cantidad } = params;
  if (cantidad <= 0) throw new BadRequestException("La cantidad debe ser mayor a 0");

  const combo = await prisma.productVariant.findUnique({
    where: { id: variantId },
    include: {
      product: { include: { components: { include: { component: true } } } },
      variantAttributes: true,
    },
  });
  if (!combo) throw new NotFoundException("Variante no encontrada");

  const componentes = combo.product.components.filter((c) => c.tipo === "exacto");
  if (componentes.length === 0) {
    throw new BadRequestException(
      `${combo.product.nombre} no tiene componentes "exacto" en su BOM; no se puede ensamblar.`,
    );
  }

  // Expande el BOM a hojas exactas (multi-nivel).
  const leaves: { variantId: number; sku: string; nombre: string; cantidad: number }[] = [];
  const visite = new Set<string>();
  const expandir = async (productId: number, attr: { attributeId: number; valueId: number }[], factor: number) => {
    const key = `${productId}:${attr.map((a) => a.valueId).join(",")}`;
    if (visite.has(key)) throw new BadRequestException("BOM con dependencia circular");
    visite.add(key);
    try {
      const product = await deps.prisma.product.findUnique({
        where: { id: productId },
        include: {
          components: { include: { component: true } },
          variants: { include: { variantAttributes: true } },
        },
      });
      if (!product) return;

      if (product.components.length === 0 || product.components.every((c) => c.tipo === "consumible")) {
        // Hoja: consumir una variante.
        const comboOf = {
          productId: combo.productId,
          variantAttributes: combo.variantAttributes,
        };
        if (productId === combo.productId) {
          throw new BadRequestException("BOM circular: el producto se usa a sí mismo");
        }
        const resolved = await deps.resolveComponentVariant(productId, comboOf);
        if (resolved) {
          leaves.push({ variantId: resolved.id, sku: resolved.sku, nombre: resolved.nombre, cantidad: factor });
        } else {
          throw new BadRequestException(
            `No se encontró variante del componente "${product.nombre}" compatible con este combo`,
          );
        }
        return;
      }

      for (const c of product.components) {
        if (c.tipo !== "exacto") continue;
        await expandir(c.componentId, attr, factor * dec(c.cantidad));
      }
    } finally {
      // Solo se detecta ciclo si el nodo reaparece en la MISMA ruta.
      visite.delete(key);
    }
  };

  const comboAttrs = combo.variantAttributes.map((a) => ({ attributeId: a.attributeId, valueId: a.valueId }));
  await expandir(combo.productId, comboAttrs, cantidad);

  // Hojas duplicadas (misma variante en varias ramas) se suman.
  const totals = new Map<number, { sku: string; nombre: string; cantidad: number }>();
  for (const l of leaves) {
    const t = totals.get(l.variantId);
    if (t) t.cantidad += l.cantidad;
    else totals.set(l.variantId, { sku: l.sku, nombre: l.nombre, cantidad: l.cantidad });
  }

  const location = await prisma.location.findUnique({ where: { id: params.locationId } });
  if (!location) throw new NotFoundException("Ubicación no encontrada");

  const movimiento = await prisma.$transaction(async (tx) => {
    // 1) Verificar y consumir cada hoja.
    const detalle: EnsambleDetalle[] = [];
    for (const [variantId, t] of totals) {
      const levels = await tx.stockLevel.findMany({ where: { variantId } });
      const disponible = levels.reduce((a, l) => a + dec(l.qty), 0);
      if (disponible < t.cantidad) {
        throw new BadRequestException(
          `Stock insuficiente de "${t.nombre}" (${t.sku}): se requieren ${t.cantidad} y hay ${disponible}`,
        );
      }
      detalle.push({ variantId, sku: t.sku, nombre: t.nombre, requerido: t.cantidad, disponible });
      // Consume de las ubicaciones disponibles.
      let restante = t.cantidad;
      for (const level of levels) {
        if (restante <= 0) break;
        const usar = Math.min(restante, dec(level.qty));
        await tx.stockLevel.update({
          where: { variantId_locationId: { variantId, locationId: level.locationId } },
          data: { qty: { decrement: usar } },
        });
        await tx.stockMove.create({
          data: {
            variantId,
            locationId: level.locationId,
            qty: -usar,
            motivo: "ensamble",
            ref: params.ref ?? `ensamble de ${combo.sku}`,
            userId: params.userId ?? null,
          },
        });
        restante -= usar;
      }
    }

    // 2) Sumar el producto terminado.
    await tx.stockLevel.upsert({
      where: { variantId_locationId: { variantId, locationId: params.locationId } },
      update: { qty: { increment: cantidad } },
      create: { variantId, locationId: params.locationId, qty: cantidad },
    });
    await tx.stockMove.create({
      data: {
        variantId,
        locationId: params.locationId,
        qty: cantidad,
        motivo: "ensamble",
        ref: params.ref ?? null,
        userId: params.userId ?? null,
      },
    });
    return { detalle };
  });

  const notificados: string[] = [];
  for (const d of totals.keys()) {
    const r = await deps.afterStockChange(d);
    if (r.notificado) notificados.push(...r.canales);
  }
  const fi = await deps.afterStockChange(variantId);
  if (fi.notificado) notificados.push(...fi.canales);

  return { detalle: movimiento.detalle, notificado: [...new Set(notificados)] };
}
