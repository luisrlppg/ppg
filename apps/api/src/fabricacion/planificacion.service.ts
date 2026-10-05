import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@ppg/db";
import { dec } from "../common/util";
import { ProductosService } from "../productos/productos.service";

export interface PlanItem {
  variantId: number;
  sku: string;
  nombre: string;
  producto: string;
  cantidad: number;
  tipo?: "fabricacion" | "ensamble";
}

export interface DesgloseLinea {
  variantId: number;
  sku: string;
  nombre: string;
  producto: string;
  uom: string;
  requerido: number;
  stockActual: number;
  faltante: number;
  suficiente: boolean;
  fabricable: boolean;
  comprable: boolean;
  tipo?: "fabricacion" | "ensamble";
  raiz: boolean;
  salesOrderLineId: number | null;
}

export interface Desglose {
  lineas: DesgloseLinea[];
  fabricar: PlanItem[];
  comprar: PlanItem[];
}

interface VarianteCtx {
  id: number;
  productId: number;
  sku: string;
  nombre: string;
  variantAttributes: { attributeId: number; valueId: number }[];
  stockLevels: { qty: unknown }[];
  product: {
    id: number;
    nombre: string;
    uom: string;
    fabricable: boolean;
    comprable: boolean;
    components: { componentId: number; cantidad: unknown; tipo: string; component: { id: number; nombre: string } }[];
  };
}

@Injectable()
export class PlanificacionService {
  constructor(private readonly productos: ProductosService) {}

  private async load(
    tx: Prisma.TransactionClient,
    variantId: number,
    cache: Map<number, VarianteCtx>,
  ): Promise<VarianteCtx> {
    let v = cache.get(variantId);
    if (!v) {
      const found = (await tx.productVariant.findUnique({
        where: { id: variantId },
        include: {
          product: {
            include: {
              components: {
                where: { tipo: "exacto" },
                include: { component: { select: { id: true, nombre: true } } },
              },
            },
          },
          variantAttributes: true,
          stockLevels: true,
        },
      })) as unknown as VarianteCtx | null;
      if (!found) throw new NotFoundException(`Variante ${variantId} no encontrada`);
      v = found;
      cache.set(variantId, v);
    }
    return v;
  }

  /**
   * Explosión neta multi-nivel (no escribe). Lleva un pool compartido de stock
   * que se consume al asignar demanda, de modo que `requerido = cubierto + faltante`
   * por variante. La usan el desglose de ventas y el panel de necesidades.
   */
  async desglosar(
    tx: Prisma.TransactionClient,
    demandas: { variantId: number; cantidad: number; salesOrderLineId?: number | null }[],
  ): Promise<Desglose> {
    const cache = new Map<number, VarianteCtx>();
    const requerido = new Map<number, number>();
    const faltante = new Map<number, number>();
    const raiz = new Set<number>();
    const lineaOrigen = new Map<number, number | null>();
    const disponible = new Map<number, number>();

    const stockDisponible = (v: VarianteCtx) => {
      if (!disponible.has(v.id)) {
        disponible.set(v.id, v.stockLevels.reduce((a, l) => a + dec(l.qty), 0));
      }
      return disponible.get(v.id)!;
    };

    const explotar = async (
      variantId: number,
      cantidad: number,
      path: number[],
      salesOrderLineId: number | null,
      esRaiz: boolean,
    ): Promise<void> => {
      if (path.includes(variantId)) throw new BadRequestException("BOM con dependencia circular");
      const v = await this.load(tx, variantId, cache);
      requerido.set(variantId, (requerido.get(variantId) ?? 0) + cantidad);
      if (esRaiz) raiz.add(variantId);
      if (salesOrderLineId != null && (esRaiz || !lineaOrigen.has(variantId))) {
        lineaOrigen.set(variantId, salesOrderLineId);
      }

      const disp = stockDisponible(v);
      const cubierto = Math.min(disp, cantidad);
      disponible.set(variantId, disp - cubierto);
      const falta = cantidad - cubierto;
      if (falta <= 0) return;
      faltante.set(variantId, (faltante.get(variantId) ?? 0) + falta);
      if (!v.product.fabricable || v.product.components.length === 0) return;
      for (const c of v.product.components) {
        const compVariant = await this.productos.resolveComponentVariant(c.component.id, {
          productId: v.productId,
          variantAttributes: v.variantAttributes,
        });
        if (!compVariant) {
          throw new BadRequestException(`No hay variante de "${c.component.nombre}" compatible con "${v.nombre}"`);
        }
        await explotar(compVariant.id, falta * dec(c.cantidad), [...path, variantId], salesOrderLineId, false);
      }
    };

    for (const d of demandas) {
      await explotar(d.variantId, d.cantidad, [], d.salesOrderLineId ?? null, true);
    }

    const lineas: DesgloseLinea[] = [];
    const fabricar: PlanItem[] = [];
    const comprar: PlanItem[] = [];
    for (const variantId of [...requerido.keys()].sort((a, b) => a - b)) {
      const v = await this.load(tx, variantId, cache);
      const req = requerido.get(variantId) ?? 0;
      const stockActual = v.stockLevels.reduce((a, l) => a + dec(l.qty), 0);
      const falt = faltante.get(variantId) ?? 0;
      const tipo = v.product.fabricable
        ? v.product.components.length > 1
          ? "ensamble"
          : "fabricacion"
        : undefined;
      lineas.push({
        variantId,
        sku: v.sku,
        nombre: v.nombre,
        producto: v.product.nombre,
        uom: v.product.uom,
        requerido: req,
        stockActual,
        faltante: falt,
        suficiente: falt <= 0,
        fabricable: v.product.fabricable,
        comprable: v.product.comprable,
        tipo,
        raiz: raiz.has(variantId),
        salesOrderLineId: lineaOrigen.get(variantId) ?? null,
      });
      if (falt <= 0) continue;
      const item: PlanItem = { variantId, sku: v.sku, nombre: v.nombre, producto: v.product.nombre, cantidad: falt, tipo };
      if (v.product.fabricable) fabricar.push(item);
      else comprar.push(item);
    }
    lineas.sort(
      (a, b) =>
        Number(b.raiz) - Number(a.raiz) ||
        a.producto.localeCompare(b.producto) ||
        a.nombre.localeCompare(b.nombre),
    );
    return { lineas, fabricar, comprar };
  }

  /** Descuenta una variante de sus ubicaciones (prefiere "Almacén principal"). */
  private async consumir(
    tx: Prisma.TransactionClient,
    variantId: number,
    cantidad: number,
    ref: string,
    userId?: number,
  ) {
    const levels = await tx.stockLevel.findMany({ where: { variantId } });
    const preferido = await tx.location.findFirst({ where: { nombre: "Almacén principal" } });
    levels.sort(
      (a, b) =>
        Number(a.locationId === (preferido?.id ?? null) ? 0 : 1) -
        Number(b.locationId === (preferido?.id ?? null) ? 0 : 1),
    );
    const total = levels.reduce((a, l) => a + dec(l.qty), 0);
    if (total < cantidad) {
      throw new BadRequestException(`Stock insuficiente de un componente (hay ${total} y se consumen ${cantidad})`);
    }
    let restante = cantidad;
    for (const level of levels) {
      if (restante <= 0) break;
      const usar = Math.min(restante, dec(level.qty));
      await tx.stockLevel.update({ where: { id: level.id }, data: { qty: { decrement: usar } } });
      await tx.stockMove.create({
        data: { variantId, locationId: level.locationId, qty: -usar, motivo: "consumo", ref, userId },
      });
      restante -= usar;
    }
  }

  /**
   * Consume los componentes de un ensamble (2+ componentes exactos) para armar
   * `cantidad` unidades contra pedido. Devuelve las variantes de componente
   * afectadas (para el monitor).
   */
  async consumirEnsamble(
    tx: Prisma.TransactionClient,
    variantId: number,
    cantidad: number,
    ref: string,
    userId?: number,
  ): Promise<number[]> {
    const v = await this.load(tx, variantId, new Map());
    if (!v.product.fabricable || v.product.components.length < 2) {
      throw new BadRequestException(`"${v.nombre}" no es un ensamble`);
    }
    const notificar: number[] = [];
    for (const c of v.product.components) {
      const compVariant = await this.productos.resolveComponentVariant(c.componentId, {
        productId: v.productId,
        variantAttributes: v.variantAttributes,
      });
      if (!compVariant) {
        throw new BadRequestException(`No hay variante de "${c.component.nombre}" compatible con "${v.nombre}"`);
      }
      await this.consumir(tx, compVariant.id, cantidad * dec(c.cantidad), ref, userId);
      notificar.push(compVariant.id);
    }
    return notificar;
  }
}
