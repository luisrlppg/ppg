import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@ppg/db";
import { dec } from "../common/util";
import { valoresPermitidosLote } from "../common/valores-permitidos";
import { PrismaService } from "../prisma/prisma.service";

export interface PassoOption {
  valueId: number;
  valor: string;
  variantId: number;
  sku: string;
  enStock: boolean;
  uom: string;
}

export interface Passo {
  sortOrder: number;
  pregunta: string;
  attributeId: number | null;
  variantProductId: number;
  isQtyStep: boolean;
  opciones: PassoOption[];
}

@Injectable()
export class PublicService {
  constructor(private readonly prisma: PrismaService) {}

  /** Alta de pedido web (invitado). Los precios se recalculan en servidor:
   *  nunca se confía en el precio del cliente (§7.7). */
  async crearPedido(data: {
    nombre?: string;
    telefono?: string;
    email?: string;
    lines: { variantId: number; cantidad: number; configuracion?: string }[];
  }): Promise<{ numero: string; estado: string }> {
    if (!data.lines || data.lines.length === 0) {
      throw new BadRequestException("El pedido necesita al menos una línea");
    }
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.salesOrder.create({
        data: {
          numero: `PEND-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`,
          fecha: new Date(),
          origen: "web",
          nombreEnvio: data.nombre?.trim() || null,
          telefonoEnvio: data.telefono?.trim() || null,
          emailEnvio: data.email?.trim() || null,
        },
      });
      await tx.salesOrder.update({
        where: { id: order.id },
        data: { numero: `PED-${String(order.id).padStart(4, "0")}` },
      });
      for (const line of data.lines) {
        const v = await tx.productVariant.findUnique({ where: { id: line.variantId }, include: { product: true } });
        if (!v) throw new BadRequestException(`Variante ${line.variantId} no disponible`);
        if (!(line.cantidad > 0)) throw new BadRequestException("La cantidad debe ser mayor a 0");
        if (v.product.uom === "pieza" && !Number.isInteger(line.cantidad)) {
          throw new BadRequestException("La cantidad para productos en piezas debe ser un número entero");
        }
        const precio = v.price === null ? dec(v.product.basePrice) : dec(v.price);
        const cfg = line.configuracion ? (JSON.parse(line.configuracion) as Prisma.InputJsonValue) : undefined;
        await tx.salesOrderLine.create({
          data: { orderId: order.id, variantId: line.variantId, cantidad: line.cantidad, precioUnitario: precio, configuracion: cfg },
        });
      }
      return { numero: `PED-${String(order.id).padStart(4, "0")}`, estado: "abierta" };
    });
  }

  /** Consulta pública del estado de un pedido por su número. */
  async consultarPedido(numero: string) {
    const o = await this.prisma.salesOrder.findUnique({
      where: { numero: numero.trim().toUpperCase() },
      include: { lines: { include: { variant: { include: { product: true } } } } },
    });
    if (!o) throw new NotFoundException("Pedido no encontrado");
    return {
      numero: o.numero,
      estado: o.estado,
      fecha: o.fecha,
      fechaEntregaDeseada: o.fechaEntregaDeseada,
      origen: o.origen,
      total: o.lines.reduce((a, l) => a + dec(l.cantidad) * dec(l.precioUnitario), 0),
      lines: o.lines.map((l) => ({
        sku: l.variant.sku,
        nombre: l.variant.nombre,
        producto: l.variant.product.nombre,
        cantidad: dec(l.cantidad),
        precioUnitario: dec(l.precioUnitario),
        estadoEntrega: l.estadoEntrega,
      })),
    };
  }

  // Para consumidores externos futuros (catálogo público) — E5/tienda.
  async productosPublicos() {
    const rows = await this.prisma.product.findMany({
      where: {
        activo: true,
        variants: { some: { activo: true, published: true } },
      },
      include: {
        variants: {
          where: { activo: true, published: true },
          orderBy: { nombre: "asc" },
        },
      },
      orderBy: { nombre: "asc" },
    });
    return rows.map((p) => ({
      productId: p.id,
      nombre: p.nombre,
      skuBase: p.skuBase,
      uom: p.uom,
      basePrice: dec(p.basePrice),
      hasVariants: p.hasVariants,
      variantesPublicadas: p.variants.map((v) => ({
        id: v.id,
        nombre: v.nombre,
        sku: v.sku,
        precio: v.price === null ? dec(p.basePrice) : dec(v.price),
      })),
    }));
  }

  async catalogo() {
    const rows = await this.prisma.productVariant.findMany({
      where: { activo: true, published: true },
      include: { product: true, packagings: { include: { packaging: true } } },
      orderBy: { nombre: "asc" },
    });
    return rows.map((v) => ({
      variantId: v.id,
      sku: v.sku,
      nombre: v.nombre,
      producto: v.product.nombre,
      uom: v.product.uom,
      precio: v.price === null ? dec(v.product.basePrice) : dec(v.price),
      publicado: v.published,
      empaques: v.packagings.map((p) => ({ nombre: p.packaging.nombre, cantidad: dec(p.cantidad) })),
    }));
  }

  async getPasos(productId: number): Promise<Passo[]> {
    const product = await this.prisma.product.findUnique({ where: { id: productId } });
    if (!product) throw new NotFoundException(`Producto ${productId} no encontrado`);

    const passos = await this.prisma.productPasso.findMany({
      where: { productId },
      orderBy: { sortOrder: "asc" },
    });

    // Carga "en lote" para evitar el N+1: 1 query de valores + 1 de variantes,
    // y se agrupa en memoria por (atributo, valor).
    const attrIds = [...new Set(passos.filter((p) => p.attributeId != null).map((p) => p.attributeId!))];
    const permitidos = await valoresPermitidosLote(this.prisma, product.id, attrIds);
    const values = await this.prisma.attributeValue.findMany({
      where: { attributeId: { in: attrIds } },
      orderBy: { valor: "asc" },
    });

    const variantesPublicadas = await this.prisma.productVariant.findMany({
      where: { productId: product.id, published: true },
      include: { variantAttributes: true, stockLevels: true, product: { select: { uom: true } } },
    });
    const porValor = new Map<number, { variantId: number; sku: string; enStock: boolean; uom: string }[]>();
    for (const variant of variantesPublicadas) {
      const enStock = variant.stockLevels.reduce((a, l) => a + dec(l.qty), 0) > 0;
      const uom = variant.product.uom as string;
      for (const va of variant.variantAttributes) {
        const arr = porValor.get(va.valueId) ?? [];
        arr.push({ variantId: variant.id, sku: variant.sku, enStock, uom });
        porValor.set(va.valueId, arr);
      }
    }

    const result: Passo[] = [];
    for (const passo of passos) {
      const vpId = passo.variantProductId ?? passo.productId;
      if (passo.isQtyStep || !passo.attributeId) {
        result.push({ sortOrder: passo.sortOrder, pregunta: passo.pregunta, attributeId: null, variantProductId: vpId, isQtyStep: passo.isQtyStep, opciones: [] });
        continue;
      }
      const permitidosSet = new Set(permitidos.get(passo.attributeId) ?? []);
      const opciones: PassoOption[] = [];
      for (const v of values) {
        if (v.attributeId !== passo.attributeId) continue;
        if (!permitidosSet.has(v.id)) continue;
        for (const variant of porValor.get(v.id) ?? []) {
          opciones.push({ valueId: v.id, valor: v.valor, variantId: variant.variantId, sku: variant.sku, enStock: variant.enStock, uom: variant.uom });
        }
      }
      const seen = new Map<string, PassoOption>();
      for (const o of opciones) {
        const key = `${o.valueId}-${o.variantId}`;
        if (!seen.has(key)) seen.set(key, o);
      }
      result.push({
        sortOrder: passo.sortOrder,
        pregunta: passo.pregunta,
        attributeId: passo.attributeId,
        variantProductId: vpId,
        isQtyStep: false,
        opciones: [...seen.values()].sort((a, b) => a.valor.localeCompare(b.valor)),
      });
    }
    return result;
  }
}