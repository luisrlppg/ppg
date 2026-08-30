import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { dec } from "../common/util";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class PublicService {
  constructor(private readonly prisma: PrismaService) {}

  /** Alta de pedido web (invitado). Los precios se recalculan en servidor:
   *  nunca se confía en el precio del cliente (§7.7). */
  async crearPedido(data: {
    nombre?: string;
    telefono?: string;
    email?: string;
    lines: { variantId: number; cantidad: number }[];
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
        const precio = v.price === null ? dec(v.product.basePrice) : dec(v.price);
        await tx.salesOrderLine.create({
          data: { orderId: order.id, variantId: line.variantId, cantidad: line.cantidad, precioUnitario: precio },
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
}