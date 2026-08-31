import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@ppg/db";
import { dec } from "../common/util";
import { PrismaService } from "../prisma/prisma.service";
import { ProductosService } from "../productos/productos.service";
import { MonitorService } from "../monitor/monitor.service";

export interface ResumenItem {
  variantId: number;
  sku: string;
  nombre: string;
  producto: string;
  cantidad: number;
  tipo?: "fabricacion" | "ensamble";
}

export interface ResumenNeteo {
  fabricar: ResumenItem[];
  comprar: ResumenItem[];
}

export interface ConfiguracionLinea {
  pasos?: { pregunta: string; opciones: string[]; seleccion: string }[];
  resultado?: Record<string, { variantId: number; sku: string; nombre: string }>;
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
    basePrice: unknown;
    components: { componentId: number; cantidad: unknown; tipo: string; component: { id: number; nombre: string } }[];
  };
}

function placeholderNumero(): string {
  return `PEND-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

@Injectable()
export class VentasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly productos: ProductosService,
    private readonly monitor: MonitorService,
  ) {}

  private async efectivo(variant: { price: Prisma.Decimal | null; product: { basePrice: Prisma.Decimal } }): Promise<number> {
    return variant.price === null ? dec(variant.product.basePrice) : dec(variant.price);
  }

  // ---------------------------------------------------------------- Lista
  async list(query: { search?: string; estado?: string; origen?: string }) {
    const estados: ("abierta" | "despachada" | "cancelada")[] = ["abierta", "despachada", "cancelada"];
    const origenes: ("interno" | "web")[] = ["interno", "web"];
    const estadoOk = query.estado && estados.includes(query.estado as (typeof estados)[number]);
    const origenOk = query.origen && origenes.includes(query.origen as (typeof origenes)[number]);
    const where: Prisma.SalesOrderWhereInput = {
      ...(estadoOk ? { estado: query.estado as (typeof estados)[number] } : {}),
      ...(origenOk ? { origen: query.origen as (typeof origenes)[number] } : {}),
      ...(query.search
        ? {
            OR: [
              { numero: { contains: query.search, mode: "insensitive" } },
              { partner: { nombre: { contains: query.search, mode: "insensitive" } } },
              { nombreEnvio: { contains: query.search, mode: "insensitive" } },
            ],
          }
        : {}),
    };
    const rows = await this.prisma.salesOrder.findMany({
      where,
      orderBy: { fecha: "desc" },
      include: {
        partner: true,
        lines: true,
      },
    });
    return rows.map((o) => ({
      id: o.id,
      numero: o.numero,
      fecha: o.fecha,
      fechaEntregaDeseada: o.fechaEntregaDeseada,
      estado: o.estado,
      origen: o.origen,
      confirmadaAt: o.confirmadaAt,
      cliente: o.partner?.nombre ?? o.nombreEnvio ?? "—",
      lineas: o.lines.length,
      total: o.lines.reduce((a, l) => a + dec(l.cantidad) * dec(l.precioUnitario), 0),
    }));
  }

  // ----------------------------------------------------------------- Devuelve una venta con su detalle
  async get(id: number) {
    const o = await this.prisma.salesOrder.findUnique({
      where: { id },
      include: {
        partner: true,
        lines: {
          include: { variant: { include: { product: true } } },
          orderBy: { id: "asc" },
        },
      },
    });
    if (!o) throw new NotFoundException("Venta no encontrada");
    const ofs = await this.prisma.manufacturingOrder.findMany({
      where: { generatedFrom: o.numero },
      orderBy: { id: "asc" },
      include: { variant: { include: { product: true } }, lines: { include: { componentVariant: { include: { product: true } } } } },
    });
    return {
      id: o.id,
      numero: o.numero,
      fecha: o.fecha,
      fechaEntregaDeseada: o.fechaEntregaDeseada,
      estado: o.estado,
      origen: o.origen,
      confirmadaAt: o.confirmadaAt,
      notas: o.notas,
      nombreEnvio: o.nombreEnvio,
      telefonoEnvio: o.telefonoEnvio,
      emailEnvio: o.emailEnvio,
      paymentMethod: o.paymentMethod,
      partnerId: o.partnerId,
      partner: o.partner
        ? { id: o.partner.id, nombre: o.partner.nombre, telefono: o.partner.telefono, direccion: o.partner.direccion, email: o.partner.email }
        : null,
      resumen: o.resumen as ResumenNeteo | null,
      lines: o.lines.map((l) => ({
        id: l.id,
        variantId: l.variantId,
        sku: l.variant.sku,
        nombre: l.variant.nombre,
        producto: l.variant.product.nombre,
        uom: l.variant.product.uom,
        cantidad: dec(l.cantidad),
        precioUnitario: dec(l.precioUnitario),
        subtotal: dec(l.cantidad) * dec(l.precioUnitario),
        qtyDelivered: dec(l.qtyDelivered),
        estadoEntrega: l.estadoEntrega,
        configuracion: l.configuracion as ConfiguracionLinea | null,
      })),
      ordenesFabricacion: ofs.map((mo) => ({
        id: mo.id,
        numero: mo.numero,
        sku: mo.variant.sku,
        nombre: mo.variant.nombre,
        producto: mo.variant.product.nombre,
        cantidad: dec(mo.cantidad),
        tipo: mo.tipo,
        estado: mo.estado,
        salesOrderLineId: mo.salesOrderLineId,
        configuracion: mo.configuracion as ConfiguracionLinea | null,
        lineas: mo.lines.map((ml) => ({
          id: ml.id,
          variantId: ml.componentVariantId,
          sku: ml.componentVariant.sku,
          nombre: ml.componentVariant.nombre,
          producto: ml.componentVariant.product.nombre,
          cantidadRequerida: dec(ml.cantidadRequerida),
          cantidadReservada: dec(ml.cantidadReservada),
        })),
      })),
    };
  }

  // --------------------------------------------------------------- Crear
  async create(
    data: {
      partnerId?: number;
      fecha?: string;
      fechaEntregaDeseada?: string;
      notas?: string;
      origen?: string;
      nombreEnvio?: string;
      telefonoEnvio?: string;
      emailEnvio?: string;
      lines: { variantId: number; cantidad: number; precioUnitario?: number; configuracion?: ConfiguracionLinea }[];
    },
    userId?: number,
  ) {
    if (!data.lines || data.lines.length === 0) {
      throw new BadRequestException("La venta necesita al menos una línea");
    }
    const origen = data.origen === "web" ? "web" : "interno";
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.salesOrder.create({
        data: {
          numero: placeholderNumero(),
          partnerId: data.partnerId ?? null,
          fecha: data.fecha ? new Date(data.fecha) : new Date(),
          fechaEntregaDeseada: data.fechaEntregaDeseada ? new Date(data.fechaEntregaDeseada) : null,
          notas: data.notas ?? null,
          origen,
          nombreEnvio: data.nombreEnvio ?? null,
          telefonoEnvio: data.telefonoEnvio ?? null,
          emailEnvio: data.emailEnvio ?? null,
          userId: userId ?? null,
        },
      });
      await tx.salesOrder.update({
        where: { id: order.id },
        data: { numero: `PED-${String(order.id).padStart(4, "0")}` },
      });
      for (const line of data.lines) {
        const v = await tx.productVariant.findUnique({
          where: { id: line.variantId },
          include: { product: true },
        });
        if (!v) throw new NotFoundException(`Variante ${line.variantId} no encontrada`);
        if (!(line.cantidad > 0)) throw new BadRequestException("La cantidad debe ser mayor a 0");
        if (v.product.uom === "pieza" && !Number.isInteger(line.cantidad)) {
          throw new BadRequestException("La cantidad para productos en piezas debe ser un número entero");
        }
        const precio = line.precioUnitario === undefined ? await this.efectivo(v) : line.precioUnitario;
        await tx.salesOrderLine.create({
          data: {
            orderId: order.id,
            variantId: line.variantId,
            cantidad: line.cantidad,
            precioUnitario: precio,
            configuracion: (line.configuracion as unknown as Prisma.InputJsonValue) ?? undefined,
          },
        });
      }
      return tx.salesOrder.findUniqueOrThrow({ where: { id: order.id } });
    });
  }

  // ------------------------------------------------------ Editar (abierta)
  async update(
    id: number,
    data: {
      partnerId?: number;
      fecha?: string;
      fechaEntregaDeseada?: string | null;
      notas?: string;
      lines?: { variantId: number; cantidad: number; precioUnitario?: number; configuracion?: ConfiguracionLinea }[];
    },
    userId?: number,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.salesOrder.findUnique({ where: { id } });
      if (!order) throw new NotFoundException("Venta no encontrada");
      if (order.estado !== "abierta") throw new BadRequestException("Solo se edita una venta abierta");
      if (order.confirmadaAt) throw new BadRequestException("Esta venta ya fue confirmada (neteada)");

      await tx.salesOrder.update({
        where: { id },
        data: {
          ...(data.partnerId !== undefined ? { partnerId: data.partnerId ?? null } : {}),
          ...(data.fecha ? { fecha: new Date(data.fecha) } : {}),
          ...(data.fechaEntregaDeseada !== undefined
            ? { fechaEntregaDeseada: data.fechaEntregaDeseada ? new Date(data.fechaEntregaDeseada) : null }
            : {}),
          ...(data.notas !== undefined ? { notas: data.notas } : {}),
        },
      });

      if (data.lines && data.lines.length > 0) {
        await tx.salesOrderLine.deleteMany({ where: { orderId: id } });
        for (const line of data.lines) {
          const v = await tx.productVariant.findUnique({ where: { id: line.variantId }, include: { product: true } });
          if (!v) throw new NotFoundException(`Variante ${line.variantId} no encontrada`);
          if (!(line.cantidad > 0)) throw new BadRequestException("La cantidad debe ser mayor a 0");
          if (v.product.uom === "pieza" && !Number.isInteger(line.cantidad)) {
            throw new BadRequestException("La cantidad para productos en piezas debe ser un número entero");
          }
          const precio = line.precioUnitario === undefined ? await this.efectivo(v) : line.precioUnitario;
          await tx.salesOrderLine.create({
            data: {
              orderId: id,
              variantId: line.variantId,
              cantidad: line.cantidad,
              precioUnitario: precio,
              configuracion: (line.configuracion as unknown as Prisma.InputJsonValue) ?? undefined,
            },
          });
        }
      }
      return { ok: true };
    });
  }

  // ------------------------------------------------- Confirmar (neteo/cascada)
  /**
   * Desglosa cada línea por su BOM (solo `exacto`, multi-nivel), netea contra
   * el stock y genera órdenes de fabricación/ensamble en cascada. Los faltantes
   * sin BOM quedan como pendientes de compra. El resultado se guarda en `resumen`.
   */
  async confirmar(id: number, userId?: number): Promise<{ resumen: ResumenNeteo; modelo: { numero: string; estado: string } }> {
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.salesOrder.findUnique({
        where: { id },
        include: { lines: true },
      });
      if (!order) throw new NotFoundException("Venta no encontrada");
      if (order.estado !== "abierta") throw new BadRequestException("Solo se confirma una venta abierta");
      if (order.confirmadaAt) throw new BadRequestException("Esta venta ya fue confirmada");

      const cache = new Map<number, VarianteCtx>();
      const load = async (variantId: number) => {
        let v = cache.get(variantId);
        if (!v) {
          v = (await tx.productVariant.findUnique({
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
          })) as unknown as VarianteCtx;
          if (!v) throw new NotFoundException(`Variante ${variantId} no encontrada`);
          cache.set(variantId, v);
        }
        return v;
      };
      const stockOf = (v: { stockLevels: { qty: unknown }[] }) => v.stockLevels.reduce((a, l) => a + dec(l.qty), 0);

      // 1) Demanda neta por variante (después de restar su propio stock).
      const demand = new Map<number, number>();
      const netear = async (variantId: number, cantidad: number, path: number[]) => {
        if (path.includes(variantId)) throw new BadRequestException("BOM con dependencia circular en la venta");
        const v = await load(variantId);
        const falta = cantidad - stockOf(v);
        if (falta <= 0) return;
        demand.set(variantId, (demand.get(variantId) ?? 0) + falta);
        if (v.product.components.length === 0) return; // hoja → compra
        for (const c of v.product.components) {
          const compVariant = await this.productos.resolveComponentVariant(c.component.id, {
            productId: v.productId,
            variantAttributes: v.variantAttributes,
          });
          if (!compVariant) {
            throw new BadRequestException(
              `No hay variante de "${c.component.nombre}" compatible con "${v.nombre}"`,
            );
          }
          await netear(compVariant.id, falta * dec(c.cantidad), [...path, variantId]);
        }
      };
      for (const line of order.lines) {
        await netear(line.variantId, dec(line.cantidad), []);
      }

      // 2) Por cada demanda: OF recursiva (con configuracion + ensamble) o simple ( resto) o pendiente compra (hoja).
      const fabricar: ResumenItem[] = [];
      const comprar: ResumenItem[] = [];
      for (const [variantId, cantidad] of [...demand.entries()].sort((a, b) => a[0] - b[0])) {
        const v = await load(variantId);
        if (v.product.components.length === 0) {
          comprar.push({ variantId, sku: v.sku, nombre: v.nombre, producto: v.product.nombre, cantidad });
          continue;
        }
        const tipo = v.product.components.length === 1 ? "fabricacion" : "ensamble";
        fabricar.push({ variantId, sku: v.sku, nombre: v.nombre, producto: v.product.nombre, cantidad, tipo });
        const mo = await tx.manufacturingOrder.create({
          data: {
            numero: `OF-PEND-${Date.now()}-${variantId}`,
            variantId,
            cantidad,
            tipo,
            estado: "confirmada",
            generatedFrom: order.numero,
            userId: userId ?? null,
          },
        });
        await tx.manufacturingOrder.update({
          where: { id: mo.id },
          data: { numero: `OF-${String(mo.id).padStart(4, "0")}` },
        });
        for (const c of v.product.components) {
          const compVariant = await this.productos.resolveComponentVariant(c.component.id, {
            productId: v.productId,
            variantAttributes: v.variantAttributes,
          });
          if (!compVariant)
            throw new BadRequestException(`No hay variante de "${c.component.nombre}" compatible con "${v.nombre}"`);
          await tx.manufacturingOrderLine.create({
            data: {
              orderId: mo.id,
              componentVariantId: compVariant.id,
              cantidadRequerida: cantidad * dec(c.cantidad),
              cantidadReservada: 0,
            },
          });
        }
      }

      const resumen: ResumenNeteo = { fabricar, comprar };
      await tx.salesOrder.update({
        where: { id },
        data: { confirmadaAt: new Date(), resumen: resumen as unknown as Prisma.InputJsonValue },
      });
for (const line of order.lines) {
        const v = await load(line.variantId);
        if (v.product.components.length > 1 && line.configuracion) {
          const falta = dec(line.cantidad) - stockOf(v);
          if (falta > 0) {
            await this.crearOFS(tx, line.id, line.variantId, falta, line.configuracion as ConfiguracionLinea, userId ?? null, []);
          }
        }
      }

      return { resumen, modelo: { numero: order.numero, estado: order.estado } };
    });
  }

  // -------------------------------------------------- Despachar una línea
  async despacharLinea(
    orderId: number,
    lineaId: number,
    params: { cantidad: number; locationId?: number; userId?: number },
  ) {
    const cantidad = params.cantidad;
    if (!(cantidad > 0)) throw new BadRequestException("La cantidad a despachar debe ser mayor a 0");

    const notificar: number[] = [];
    this.prisma.$transaction(async (tx) => {
      const line = await tx.salesOrderLine.findUnique({
        where: { id: lineaId },
        include: { order: true },
      });
      if (!line) throw new NotFoundException("Línea no encontrada");
      if (line.orderId !== orderId) throw new BadRequestException("La línea no pertenece a esta venta");
      if (line.order.estado !== "abierta") throw new BadRequestException("La venta no está abierta");

      const pendiente = dec(line.cantidad) - dec(line.qtyDelivered);
      if (cantidad > pendiente) {
        throw new BadRequestException(`Solo faltan ${pendiente} por despachar de esta línea`);
      }

      let levels = await tx.stockLevel.findMany({ where: { variantId: line.variantId } });
      const preferido =
        params.locationId ??
        ((await tx.location.findFirst({ where: { nombre: "Almacén principal" } }))?.id ?? null);
      levels.sort((a, b) => Number(a.locationId === preferido ? 0 : 1) - Number(b.locationId === preferido ? 0 : 1));
      const total = levels.reduce((a, l) => a + dec(l.qty), 0);
      if (total < cantidad) {
        throw new BadRequestException(`Stock insuficiente de la variante: hay ${total} y se quieren despachar ${cantidad}`);
      }

      let restante = cantidad;
      for (const level of levels) {
        if (restante <= 0) break;
        const usar = Math.min(restante, dec(level.qty));
        await tx.stockLevel.update({
          where: { variantId_locationId: { variantId: line.variantId, locationId: level.locationId } },
          data: { qty: { decrement: usar } },
        });
        await tx.stockMove.create({
          data: {
            variantId: line.variantId,
            locationId: level.locationId,
            qty: -usar,
            motivo: "despacho",
            ref: line.order.numero,
            userId: params.userId ?? null,
          },
        });
        restante -= usar;
      }
      notificar.push(line.variantId);

      const nuevo = dec(line.qtyDelivered) + cantidad;
      const estadoEntrega: "pendiente" | "parcial" | "entregado" = nuevo >= dec(line.cantidad) ? "entregado" : "parcial";
      await tx.salesOrderLine.update({
        where: { id: lineaId },
        data: { qtyDelivered: nuevo, estadoEntrega },
      });

      if (estadoEntrega === "entregado") {
        const todas = await tx.salesOrderLine.findMany({ where: { orderId } });
        if (todas.every((l) => dec(l.qtyDelivered) >= dec(l.cantidad))) {
          await tx.salesOrder.update({ where: { id: orderId }, data: { estado: "despachada" } });
        }
      }
    });

    // Fuera de la transacción se dispara el monitor (una vez por variante).
    const notificado: string[] = [];
    for (const vid of [...new Set(notificar)]) {
      const r = await this.monitor.afterStockChange(vid);
      if (r.notificado) notificado.push(...r.canales);
    }
    return { ok: true, notificado: [...new Set(notificado)] };
  }

  // ------------------------------------------------------------ Cancelar
  async cancelar(id: number, userId?: number) {
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.salesOrder.findUnique({ where: { id } });
      if (!order) throw new NotFoundException("Venta no encontrada");
      if (order.estado === "despachada") throw new BadRequestException("Una venta despachada no se puede cancelar");
      await tx.salesOrder.update({ where: { id }, data: { estado: "cancelada" } });
      await tx.manufacturingOrder.updateMany({
        where: { generatedFrom: order.numero, estado: { in: ["confirmada", "en_progreso"] } },
        data: { estado: "cancelada" },
      });
      void userId;
      return { ok: true };
    });
  }

  private async crearOFS(
    tx: Parameters<Parameters<typeof this.prisma.$transaction>[0]>[0],
    ordenId: number,
    variantId: number,
    cantidad: number,
    configuracion: ConfiguracionLinea,
    userId: number | null,
    path: number[],
  ): Promise<void> {
    if (path.includes(variantId)) {
      throw new BadRequestException(`Dependencia circular detectada en OF para variantId=${variantId}`);
    }

    const v = await tx.productVariant.findUnique({
      where: { id: variantId },
      include: {
        product: {
          include: {
            components: {
              where: { tipo: "exacto" },
              include: { component: true },
            },
          },
        },
        stockLevels: true,
      },
    });
    if (!v) throw new NotFoundException(`Variante ${variantId} no encontrada`);

    const stockActual = v.stockLevels.reduce((a, l) => a + dec(l.qty), 0);
    const falta = cantidad - stockActual;
    if (falta <= 0) return;

    const comps = v.product.components;
    if (comps.length === 0) return;

    if (comps.length === 1) {
      const mo = await tx.manufacturingOrder.create({
        data: {
          numero: placeholderNumero(),
          variantId,
          cantidad: falta,
          tipo: "fabricacion",
          estado: "confirmada",
          generatedFrom: `venta:${ordenId}`,
          userId,
          salesOrderLineId: ordenId,
          configuracion: configuracion as unknown as Prisma.InputJsonValue,
        },
      });
      await tx.manufacturingOrder.update({
        where: { id: mo.id },
        data: { numero: `OF-${String(mo.id).padStart(4, "0")}` },
      });
      return;
    }

    const mo = await tx.manufacturingOrder.create({
      data: {
        numero: placeholderNumero(),
        variantId,
        cantidad: falta,
        tipo: "ensamble",
        estado: "confirmada",
        generatedFrom: `venta:${ordenId}`,
        userId,
        salesOrderLineId: ordenId,
        configuracion: configuracion as unknown as Prisma.InputJsonValue,
      },
    });
    await tx.manufacturingOrder.update({
      where: { id: mo.id },
      data: { numero: `OF-${String(mo.id).padStart(4, "0")}` },
    });

    for (const c of comps) {
      const compVariant = await this.productos.resolveComponentVariant(c.component.id, {
        productId: v.productId,
        variantAttributes: [],
      });
      if (!compVariant) {
        throw new BadRequestException(
          `No hay variante de "${c.component.nombre}" compatible con "${v.nombre}"`,
        );
      }
      const reqCantidad = falta * dec(c.cantidad);
      const compStock = (await tx.stockLevel.findMany({ where: { variantId: compVariant.id } })).reduce(
        (a, l) => a + dec(l.qty),
        0,
      );
      if (compStock >= reqCantidad) continue;

      const compComps = (
        await tx.product.findUnique({
          where: { id: c.component.id },
          include: { components: { where: { tipo: "exacto" } } },
        })
      )?.components ?? [];
      if (compComps.length === 0) continue;

      await this.crearOFS(tx, ordenId, compVariant.id, reqCantidad - compStock, {}, userId, [
        ...path,
        variantId,
      ]);
    }
  }
}