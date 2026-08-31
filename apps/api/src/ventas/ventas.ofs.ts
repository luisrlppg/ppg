import { BadRequestException, NotFoundException } from "@nestjs/common";
import { Prisma } from "@ppg/db";
import { dec } from "../common/util";
import { PrismaService } from "../prisma/prisma.service";
import { ConfiguracionLinea } from "./ventas.types";

type Tx = Parameters<Parameters<PrismaService["$transaction"]>[0]>[0];

export interface CrearOFSContext {
  tx: Tx;
  resolveComponentVariant: ProductosServiceResolve;
}

type ProductosServiceResolve = (componentProductId: number, ctx: { productId: number; variantAttributes: { attributeId: number; valueId: number }[] }) => Promise<{
  id: number;
  sku: string;
  nombre: string;
} | null>;

function placeholderNumero(): string {
  return `PEND-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

export async function crearOFS(
  ctx: CrearOFSContext,
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

  const v = await ctx.tx.productVariant.findUnique({
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
    const mo = await ctx.tx.manufacturingOrder.create({
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
    await ctx.tx.manufacturingOrder.update({
      where: { id: mo.id },
      data: { numero: `OF-${String(mo.id).padStart(4, "0")}` },
    });
    return;
  }

  const mo = await ctx.tx.manufacturingOrder.create({
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
  await ctx.tx.manufacturingOrder.update({
    where: { id: mo.id },
    data: { numero: `OF-${String(mo.id).padStart(4, "0")}` },
  });

  for (const c of comps) {
    const compVariant = await ctx.resolveComponentVariant(c.component.id, {
      productId: v.productId,
      variantAttributes: [],
    });
    if (!compVariant) {
      throw new BadRequestException(
        `No hay variante de "${c.component.nombre}" compatible con "${v.nombre}"`,
      );
    }
    const reqCantidad = falta * dec(c.cantidad);
    const compStock = (await ctx.tx.stockLevel.findMany({ where: { variantId: compVariant.id } })).reduce(
      (a, l) => a + dec(l.qty),
      0,
    );
    if (compStock >= reqCantidad) continue;

    const compComps = (
      await ctx.tx.product.findUnique({
        where: { id: c.component.id },
        include: { components: { where: { tipo: "exacto" } } },
      })
    )?.components ?? [];
    if (compComps.length === 0) continue;

    await crearOFS(ctx, ordenId, compVariant.id, reqCantidad - compStock, {}, userId, [
      ...path,
      variantId,
    ]);
  }
}
