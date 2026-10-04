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
