import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { OrigenOF, Prisma } from "@ppg/db";
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

export interface Plan {
  fabricar: PlanItem[];
  comprar: PlanItem[];
}

export interface OFCreada {
  id: number;
  numero: string;
  variantId: number;
  sku: string;
  nombre: string;
  producto: string;
  cantidad: number;
  tipo: "fabricacion" | "ensamble";
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
   * Netea la demanda contra el stock y devuelve el plan de fabricación/compra.
   * `netearRaiz`: true → la cantidad raíz se netea contra el stock del propio
   * producto (ventas). false → la cantidad dada se fabrica tal cual y solo los
   * componentes hijos se netean (alta manual / reposición).
   */
  async planificar(
    tx: Prisma.TransactionClient,
    demandas: { variantId: number; cantidad: number }[],
    opts: { netearRaiz: boolean },
  ): Promise<Plan> {
    const cache = new Map<number, VarianteCtx>();
    const stockOf = (v: VarianteCtx) => v.stockLevels.reduce((a, l) => a + dec(l.qty), 0);
    const demand = new Map<number, number>();

    const netear = async (
      variantId: number,
      cantidad: number,
      path: number[],
      netearEsteNivel: boolean,
    ): Promise<void> => {
      if (path.includes(variantId)) throw new BadRequestException("BOM con dependencia circular");
      const v = await this.load(tx, variantId, cache);
      const falta = netearEsteNivel ? cantidad - stockOf(v) : cantidad;
      if (falta <= 0) return;
      demand.set(variantId, (demand.get(variantId) ?? 0) + falta);
      if (!v.product.fabricable || v.product.components.length === 0) return; // hoja → compra o fabricación sin BOM
      for (const c of v.product.components) {
        const compVariant = await this.productos.resolveComponentVariant(c.component.id, {
          productId: v.productId,
          variantAttributes: v.variantAttributes,
        });
        if (!compVariant) {
          throw new BadRequestException(`No hay variante de "${c.component.nombre}" compatible con "${v.nombre}"`);
        }
        await netear(compVariant.id, falta * dec(c.cantidad), [...path, variantId], true);
      }
    };

    for (const d of demandas) {
      await netear(d.variantId, d.cantidad, [], opts.netearRaiz);
    }

    const fabricar: PlanItem[] = [];
    const comprar: PlanItem[] = [];
    for (const [variantId, cantidad] of [...demand.entries()].sort((a, b) => a[0] - b[0])) {
      const v = await this.load(tx, variantId, cache);
      if (v.product.fabricable) {
        const tipo = v.product.components.length > 1 ? "ensamble" : "fabricacion";
        fabricar.push({ variantId, sku: v.sku, nombre: v.nombre, producto: v.product.nombre, cantidad, tipo });
        continue;
      }
      comprar.push({ variantId, sku: v.sku, nombre: v.nombre, producto: v.product.nombre, cantidad });
    }
    return { fabricar, comprar };
  }

  /**
   * Explosión neta multi-nivel para mostrar al vendedor (no escribe). A diferencia
   * de `planificar`, lleva un pool compartido de stock que se consume al asignar
   * demanda, de modo que `requerido = cubierto + faltante` por variante.
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

  /** Crea una sola OF (con sus líneas de componentes exactos) sin cascada a hijos. */
  async crearOFUnica(
    tx: Prisma.TransactionClient,
    item: PlanItem,
    opts: {
      origen: OrigenOF;
      generatedFrom?: string | null;
      userId?: number | null;
      notas?: string | null;
      configuracion?: unknown;
      salesOrderLineId?: number | null;
    },
  ): Promise<OFCreada> {
    const configuracionPorVariant = new Map<number, unknown>();
    if (opts.configuracion !== undefined) configuracionPorVariant.set(item.variantId, opts.configuracion);
    const salesOrderLineIdPorVariant = new Map<number, number>();
    if (opts.salesOrderLineId != null) salesOrderLineIdPorVariant.set(item.variantId, opts.salesOrderLineId);
    const [creada] = await this.crearOFs(
      tx,
      { fabricar: [item], comprar: [] },
      {
        origen: opts.origen,
        generatedFrom: opts.generatedFrom ?? null,
        userId: opts.userId ?? null,
        notas: opts.notas ?? null,
        configuracionPorVariant,
        salesOrderLineIdPorVariant,
      },
    );
    return creada;
  }

  /** Crea las OFs (tipo + líneas de componentes exactos) del plan. */
  async crearOFs(
    tx: Prisma.TransactionClient,
    plan: Plan,
    opts: {
      origen: OrigenOF;
      generatedFrom?: string | null;
      userId?: number | null;
      notas?: string | null;
      configuracionPorVariant?: Map<number, unknown>;
      salesOrderLineIdPorVariant?: Map<number, number>;
    },
  ): Promise<OFCreada[]> {
    const creadas: OFCreada[] = [];
    for (const item of plan.fabricar) {
      const v = await this.load(tx, item.variantId, new Map());
      const mo = await tx.manufacturingOrder.create({
        data: {
          numero: `OF-PEND-${Date.now()}-${item.variantId}`,
          variantId: item.variantId,
          cantidad: item.cantidad,
          tipo: item.tipo ?? "fabricacion",
          origen: opts.origen,
          estado: "confirmada",
          generatedFrom: opts.generatedFrom ?? null,
          notas: opts.notas ?? null,
          userId: opts.userId ?? null,
          configuracion:
            (opts.configuracionPorVariant?.get(item.variantId) as Prisma.InputJsonValue | undefined) ?? undefined,
          salesOrderLineId: opts.salesOrderLineIdPorVariant?.get(item.variantId) ?? null,
        },
      });
      const numero = `OF-${String(mo.id).padStart(4, "0")}`;
      await tx.manufacturingOrder.update({ where: { id: mo.id }, data: { numero } });

      for (const c of v.product.components) {
        const compVariant = await this.productos.resolveComponentVariant(c.component.id, {
          productId: v.productId,
          variantAttributes: v.variantAttributes,
        });
        if (!compVariant) {
          throw new BadRequestException(`No hay variante de "${c.component.nombre}" compatible con "${v.nombre}"`);
        }
        await tx.manufacturingOrderLine.create({
          data: {
            orderId: mo.id,
            componentVariantId: compVariant.id,
            cantidadRequerida: item.cantidad * dec(c.cantidad),
            cantidadReservada: 0,
          },
        });
      }

      creadas.push({
        id: mo.id,
        numero,
        variantId: item.variantId,
        sku: v.sku,
        nombre: v.nombre,
        producto: v.product.nombre,
        cantidad: item.cantidad,
        tipo: (item.tipo ?? "fabricacion") as "fabricacion" | "ensamble",
      });
    }
    return creadas;
  }
}
