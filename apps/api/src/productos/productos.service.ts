import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@ppg/db";
import { PrismaService } from "../prisma/prisma.service";
import { dec, toTipoComponente, toUom } from "../common/util";
import {
  gridProducto,
  Grid,
  ejesProducto,
  variantesExistentes,
  comboKey,
  slugify,
} from "./productos.grid";

export type { Grid } from "./productos.grid";

@Injectable()
export class ProductosService {
  constructor(private readonly prisma: PrismaService) {}

  private static stockTotals(
    levels: { locationId: number; qty: Prisma.Decimal }[],
  ): { total: number; porUbicacion: Record<number, number> } {
    const porUbicacion: Record<number, number> = {};
    let total = 0;
    for (const l of levels) {
      const q = dec(l.qty);
      porUbicacion[l.locationId] = q;
      total += q;
    }
    return { total, porUbicacion };
  }

  // ------------------------------------------------------------- Productos
  async list(query: { search?: string; categoria?: number }) {
    const where: Prisma.ProductWhereInput = {
      activo: true,
      ...(query.categoria ? { categoryId: query.categoria } : {}),
      ...(query.search
        ? {
            OR: [
              { nombre: { contains: query.search, mode: "insensitive" } },
              { skuBase: { contains: query.search, mode: "insensitive" } },
            ],
          }
        : {}),
    };
    const rows = await this.prisma.product.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      include: {
        category: true,
        variants: {
          include: { stockLevels: true },
          orderBy: { nombre: "asc" },
        },
      },
    });
    return rows.map((p) => ({
      id: p.id,
      nombre: p.nombre,
      skuBase: p.skuBase,
      uom: p.uom,
      basePrice: dec(p.basePrice),
      hasVariants: p.hasVariants,
      activo: p.activo,
      imagen: p.imagen,
      categoria: p.category?.nombre ?? null,
      variantes: p.variants.length,
      stockTotal: p.variants.reduce((acc, v) => acc + ProductosService.stockTotals(v.stockLevels).total, 0),
    }));
  }

  async get(id: number) {
    const p = await this.prisma.product.findUnique({
      where: { id },
      include: {
        category: true,
        attributeLines: { include: { attribute: true }, orderBy: { sortOrder: "asc" } },
        components: { include: { component: { select: { id: true, nombre: true } } } },
        variants: {
          include: {
            stockLevels: true,
            packagings: { include: { packaging: true } },
            variantAttributes: { include: { attribute: true, value: true } },
          },
          orderBy: { nombre: "asc" },
        },
      },
    });
    if (!p) throw new NotFoundException("Producto no encontrado");
    const { total, porUbicacion } = ProductosService.stockTotals(
      p.variants.flatMap((v) => v.stockLevels),
    );
    void total;
    return {
      ...p,
      basePrice: dec(p.basePrice),
      variantes: p.variants.map((v) => ({
        ...v,
        price: v.price === null ? null : dec(v.price),
        stockMin: dec(v.stockMin),
        stockMax: dec(v.stockMax),
        stockActual: ProductosService.stockTotals(v.stockLevels).total,
        packagings: v.packagings.map((vp) => ({ packagingId: vp.packagingId, nombre: vp.packaging.nombre, cantidad: dec(vp.cantidad) })),
        valoracion: v.variantAttributes.map((va) => ({
          attributeId: va.attributeId,
          attribute: va.attribute.nombre,
          valueId: va.valueId,
          valor: va.value.valor,
        })),
      })),
      componentes: p.components.map((c) => ({
        componentId: c.componentId,
        nombre: c.component.nombre,
        cantidad: dec(c.cantidad),
        tipo: c.tipo,
      })),
      porUbicacion: undefined,
    };
  }

  async create(data: {
    nombre: string;
    skuBase: string;
    categoryId?: number;
    uom?: string;
    basePrice?: number;
    hasVariants?: boolean;
    imagen?: string;
  }) {
    const skuBase = data.skuBase.trim();
    if (!skuBase) throw new BadRequestException("skuBase es obligatorio");
    const existing = await this.prisma.product.findUnique({ where: { skuBase } });
    if (existing) throw new BadRequestException(`Ya existe un producto con skuBase "${skuBase}"`);

    const product = await this.prisma.product.create({
      data: {
        nombre: data.nombre,
        skuBase,
        categoryId: data.categoryId ?? null,
        uom: toUom(data.uom),
        basePrice: data.basePrice ?? 0,
        hasVariants: data.hasVariants ?? false,
        imagen: data.imagen ?? null,
      },
    });

    // Producto sin familias: se crea automáticamente su variante única.
    if (!product.hasVariants) {
      await this.prisma.productVariant.create({
        data: { productId: product.id, nombre: product.nombre, sku: skuBase },
      });
    }
    return product;
  }

  async update(
    id: number,
    data: Partial<{
      nombre: string;
      categoryId: number | null;
      uom?: string;
      basePrice?: number;
      hasVariants?: boolean;
      imagen?: string | null;
      activo?: boolean;
    }>,
    userId?: number,
  ) {
    const current = await this.prisma.product.findUnique({ where: { id } });
    if (!current) throw new NotFoundException("Producto no encontrado");

    const baseChanged = data.basePrice !== undefined && dec(current.basePrice) !== data.basePrice;
    const res = await this.prisma.product.update({
      where: { id },
      data: {
        ...(data.nombre !== undefined ? { nombre: data.nombre } : {}),
        ...(data.categoryId !== undefined ? { categoryId: data.categoryId } : {}),
        ...(data.uom !== undefined ? { uom: toUom(data.uom) } : {}),
        ...(data.basePrice !== undefined ? { basePrice: data.basePrice } : {}),
        ...(data.hasVariants !== undefined ? { hasVariants: data.hasVariants } : {}),
        ...(data.imagen !== undefined ? { imagen: data.imagen } : {}),
        ...(data.activo !== undefined ? { activo: data.activo } : {}),
      },
    });

    if (baseChanged) {
      await this.prisma.priceChange.create({
        data: {
          variantId: null,
          campo: "base",
          precioAnterior: current.basePrice,
          precioNuevo: data.basePrice as number,
          source: userId ? "manual" : "api",
          userId,
        },
      });
    }
    return res;
  }

  async deactivate(id: number) {
    await this.prisma.product.update({ where: { id }, data: { activo: false } });
    await this.prisma.productVariant.updateMany({ where: { productId: id }, data: { activo: false } });
    return { ok: true };
  }

  // --------------------------------------- Ejes del grid y BOM (producto)
  async setEjes(productId: number, ejes: { attributeId: number; sortOrder?: number }[]) {
    await this.prisma.$transaction(async (tx) => {
      await tx.productAttributeLine.deleteMany({ where: { productId } });
      for (const [i, e] of ejes.entries()) {
        await tx.productAttributeLine.create({
          data: { productId, attributeId: e.attributeId, sortOrder: e.sortOrder ?? i },
        });
      }
      // Limpia valores permitidos de atributos que ya no son ejes del producto.
      await tx.productAttributeValue.deleteMany({
        where: { productId, attributeId: { notIn: ejes.map((e) => e.attributeId) } },
      });
    });
    return { ok: true };
  }

  /** Restringe los ejes: subconjunto de valores del atributo válidos para el producto. */
  async setValoresPermitidos(productId: number, attributeId: number, valueIds: number[]) {
    const product = await this.prisma.product.findUnique({ where: { id: productId } });
    if (!product) throw new NotFoundException("Producto no encontrado");

    const eje = await this.prisma.productAttributeLine.findUnique({
      where: { productId_attributeId: { productId, attributeId } },
    });
    if (!eje) {
      throw new BadRequestException("El atributo no está asignado como eje de este producto");
    }

    const validas = await this.prisma.attributeValue.count({
      where: { attributeId, id: { in: valueIds } },
    });
    if (validas !== valueIds.length) {
      throw new BadRequestException("Algunos valores no pertenecen al atributo");
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.productAttributeValue.deleteMany({ where: { productId, attributeId } });
      if (valueIds.length > 0) {
        await tx.productAttributeValue.createMany({
          data: valueIds.map((valueId) => ({ productId, attributeId, valueId })),
        });
      }
    });
    return { ok: true, permitidos: valueIds };
  }

  async setComponentes(
    productId: number,
    componentes: { componentId: number; cantidad: number; tipo: string }[],
  ) {
    await this.prisma.$transaction(async (tx) => {
      await tx.productComponent.deleteMany({ where: { productId } });
      for (const c of componentes) {
        await tx.productComponent.create({
          data: {
            productId,
            componentId: c.componentId,
            cantidad: c.cantidad,
            tipo: toTipoComponente(c.tipo),
          },
        });
      }
    });
    return { ok: true };
  }

  // -------------------------------------------- Variantes del producto
  async variantesDeProducto(productId: number) {
    const v = await this.prisma.productVariant.findMany({
      where: { productId },
      include: { stockLevels: true, variantAttributes: { include: { value: true } } },
      orderBy: { nombre: "asc" },
    });
    return v.map((r) => ({
      ...r,
      price: r.price === null ? null : dec(r.price),
      stockMin: dec(r.stockMin),
      stockMax: dec(r.stockMax),
      stockActual: ProductosService.stockTotals(r.stockLevels).total,
      valoracion: r.variantAttributes.map((va) => va.value.valor),
    }));
  }

  async buscarVariantes(query: { search?: string; incluirInactivas?: boolean }) {
    const where: Prisma.ProductVariantWhereInput = {
      ...(query.incluirInactivas ? {} : { activo: true }),
      ...(query.search
        ? {
            OR: [
              { sku: { contains: query.search, mode: "insensitive" } },
              { nombre: { contains: query.search, mode: "insensitive" } },
              { product: { nombre: { contains: query.search, mode: "insensitive" } } },
            ],
          }
        : {}),
    };
    const rows = await this.prisma.productVariant.findMany({
      where,
      take: 30,
      orderBy: { nombre: "asc" },
      include: { product: { select: { id: true, nombre: true, skuBase: true, uom: true, basePrice: true } }, stockLevels: true },
    });
    return rows.map((r) => ({
      id: r.id,
      sku: r.sku,
      nombre: r.nombre,
      productId: r.productId,
      producto: r.product.nombre,
      uom: r.product.uom,
      activo: r.activo,
      stockActual: ProductosService.stockTotals(r.stockLevels).total,
      precio: r.price === null ? dec(r.product.basePrice) : dec(r.price),
    }));
  }

  async createVariant(productId: number, data: { nombre: string; sku: string; price?: number | null }) {
    const sku = data.sku.trim();
    if (!sku) throw new BadRequestException("sku es obligatorio");
    const dup = await this.prisma.productVariant.findUnique({ where: { sku } });
    if (dup) throw new BadRequestException(`Ya existe la variante "${sku}"`);
    const variant = await this.prisma.productVariant.create({
      data: {
        productId,
        nombre: data.nombre,
        sku,
        price: data.price === undefined || data.price === null ? null : data.price,
      },
    });
    await this.inheritPackagingsToVariant(productId, variant.id);
    return variant;
  }

  async updateVariant(variantId: number, data: Partial<{ nombre: string; stockMin: number; stockMax: number; longLead: boolean; published: boolean; activo: boolean; imagen: string | null }>) {
    return this.prisma.productVariant.update({
      where: { id: variantId },
      data: { ...data },
    });
  }

  async setVariantPrice(variantId: number, price: number | null, userId?: number) {
    const current = await this.prisma.productVariant.findUnique({ where: { id: variantId } });
    if (!current) throw new NotFoundException("Variante no encontrada");
    const old = current.price === null ? null : dec(current.price);
    const res = await this.prisma.productVariant.update({
      where: { id: variantId },
      data: { price: price === null ? null : price },
    });
    if (old !== price) {
      await this.prisma.priceChange.create({
        data: {
          variantId,
          campo: "variante",
          precioAnterior: current.price ?? 0,
          precioNuevo: price ?? 0,
          source: userId ? "manual" : "api",
          userId,
        },
      });
    }
    return res;
  }

  async setPackagings(variantId: number, packagings: { packagingId: number; cantidad: number }[]) {
    await this.prisma.$transaction(async (tx) => {
      await tx.variantPackaging.deleteMany({ where: { variantId } });
      for (const p of packagings) {
        await tx.variantPackaging.create({
          data: { variantId, packagingId: p.packagingId, cantidad: p.cantidad },
        });
      }
    });
    return { ok: true };
  }

  private async inheritPackagingsToVariant(productId: number, newVariantId: number) {
    const source = await this.prisma.productVariant.findFirst({
      where: { productId, packagings: { some: {} } },
      include: { packagings: true },
      orderBy: { id: "asc" },
    });
    if (!source) return;
    await this.prisma.$transaction(async (tx) => {
      for (const p of source.packagings) {
        await tx.variantPackaging.create({
          data: { variantId: newVariantId, packagingId: p.packagingId, cantidad: p.cantidad },
        });
      }
    });
  }

  // -------------------------------------------------------------- Grid
  async grid(productId: number): Promise<Grid> {
    return gridProducto(this.prisma, productId);
  }

  async materializar(productId: number, valueIds: number[]) {
    const p = await this.prisma.product.findUnique({ where: { id: productId } });
    if (!p) throw new NotFoundException("Producto no encontrado");

    const ejes = await ejesProducto(this.prisma, productId);
    if (valueIds.length !== ejes.length) {
      throw new BadRequestException(`Se requieren ${ejes.length} valores de atributo`);
    }
    // Toda combinación de valores permitidos es válida (no hay reglas de compatibilidad).
    for (let i = 0; i < ejes.length; i++) {
      if (!ejes[i].valores.some((v) => v.id === valueIds[i])) {
        throw new BadRequestException("Combinación no válida para este producto");
      }
    }

    const existentes = await variantesExistentes(this.prisma, productId, ejes);
    const key = comboKey(valueIds);
    const ya = existentes.find((e) => comboKey(e.valueIds) === key);
    if (ya) return ya.varianteId;

    const valoracion = valueIds.map((id, i) => ejes[i].valores.find((v) => v.id === id)?.valor ?? String(id));
    const variant = await this.prisma.productVariant.create({
      data: {
        productId,
        nombre: valoracion.join(" "),
        sku: `${p.skuBase}-${slugify(valoracion)}`,
        variantAttributes: {
          create: valueIds.map((valueId, i) => ({ attributeId: ejes[i].attributeId, valueId })),
        },
      },
    });
    await this.inheritPackagingsToVariant(productId, variant.id);
    return variant.id;
  }

  // ------------------------------------------------------ Eliminar
  /** Bloqueos de negocio que impiden borrar una variante. */
  private async bloqueosVariante(variantId: number): Promise<string[]> {
    const [stock, movimientos, cambiosPrecio, lineasVenta, ofs, lineasOF, reportes] = await Promise.all([
      this.prisma.stockLevel.count({ where: { variantId } }),
      this.prisma.stockMove.count({ where: { variantId } }),
      this.prisma.priceChange.count({ where: { variantId } }),
      this.prisma.salesOrderLine.count({ where: { variantId } }),
      this.prisma.manufacturingOrder.count({ where: { variantId } }),
      this.prisma.manufacturingOrderLine.count({ where: { componentVariantId: variantId } }),
      this.prisma.productionReportLine.count({ where: { variantId } }),
    ]);
    const motivos: string[] = [];
    if (stock) motivos.push(`${stock} registro(s) de stock`);
    if (movimientos) motivos.push(`${movimientos} movimiento(s) de stock`);
    if (cambiosPrecio) motivos.push(`${cambiosPrecio} cambio(s) de precio`);
    if (lineasVenta) motivos.push(`${lineasVenta} línea(s) de venta`);
    if (ofs) motivos.push(`${ofs} orden(es) de fabricación`);
    if (lineasOF) motivos.push(`${lineasOF} uso(s) como componente en OF`);
    if (reportes) motivos.push(`${reportes} línea(s) de reporte de producción`);
    return motivos;
  }

  /** Elimina una variante si no tiene historial. Lanza 409 con los motivos si lo tiene. */
  async eliminarVariante(variantId: number) {
    const variant = await this.prisma.productVariant.findUnique({ where: { id: variantId } });
    if (!variant) throw new NotFoundException("Variante no encontrada");

    const motivos = await this.bloqueosVariante(variantId);
    if (motivos.length > 0) {
      throw new ConflictException(
        `No se puede eliminar "${variant.nombre}": tiene ${motivos.join(", ")}. Puedes desactivarla en su lugar.`,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.variantAttribute.deleteMany({ where: { variantId } });
      await tx.variantPackaging.deleteMany({ where: { variantId } });
      await tx.productVariant.delete({ where: { id: variantId } });
    });
    return { ok: true };
  }

  /** Elimina (hard delete) un producto sin historial. Lanza 409 con los motivos si lo tiene. */
  async eliminarProducto(productId: number) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      include: { variants: { select: { id: true, nombre: true } } },
    });
    if (!product) throw new NotFoundException("Producto no encontrado");

    const motivos: string[] = [];

    const usadoComoComponente = await this.prisma.productComponent.count({ where: { componentId: productId } });
    if (usadoComoComponente) {
      motivos.push(`se usa como componente en ${usadoComoComponente} BOM(s) de otros productos`);
    }

    const bloqueosVariantes: string[] = [];
    for (const v of product.variants) {
      const b = await this.bloqueosVariante(v.id);
      if (b.length > 0) bloqueosVariantes.push(`${v.nombre}: ${b.join(", ")}`);
    }
    if (bloqueosVariantes.length > 0) {
      motivos.push(`variantes con historial → ${bloqueosVariantes.join(" | ")}`);
    }

    if (motivos.length > 0) {
      throw new ConflictException(
        `No se puede eliminar el producto "${product.nombre}": ${motivos.join("; ")}. Puedes desactivarlo en su lugar.`,
      );
    }

    const variantIds = product.variants.map((v) => v.id);
    await this.prisma.$transaction(async (tx) => {
      if (variantIds.length > 0) {
        await tx.variantAttribute.deleteMany({ where: { variantId: { in: variantIds } } });
        await tx.variantPackaging.deleteMany({ where: { variantId: { in: variantIds } } });
        await tx.productVariant.deleteMany({ where: { id: { in: variantIds } } });
      }
      await tx.productAttributeValue.deleteMany({ where: { productId } });
      await tx.productAttributeLine.deleteMany({ where: { productId } });
      await tx.productPasso.deleteMany({ where: { productId } });
      await tx.productComponent.deleteMany({ where: { productId } });
      await tx.product.delete({ where: { id: productId } });
    });
    return { ok: true };
  }

  // --------------------------------------------------- Resolver BOM (E1)
  /**
   * Para netear/resolver un combo: encuentra qué variante del producto componente
   * consumir, igualando los valores de atributo que comparten ambos.
   */
  async resolveComponentVariant(componentProductId: number, combo: { productId: number; variantAttributes: { attributeId: number; valueId: number }[] }): Promise<{ id: number; sku: string; nombre: string } | null> {
    const axes = await this.prisma.productAttributeLine.findMany({
      where: { productId: componentProductId },
      select: { attributeId: true },
    });
    const axisIds = new Set(axes.map((a) => a.attributeId));

    const comboValues = combo.variantAttributes.filter((v) => axisIds.has(v.attributeId));
    if (comboValues.length === 0) {
      // Sin ejes en común: se busca la variante única del componente.
      const unique = await this.prisma.productVariant.findFirst({
        where: { productId: componentProductId, activo: true },
        select: { id: true, sku: true, nombre: true },
      });
      return unique;
    }

    const candidates = await this.prisma.productVariant.findMany({
      where: { productId: componentProductId, activo: true },
      include: { variantAttributes: true },
    });
    for (const c of candidates) {
      const cAttrs = c.variantAttributes.filter((v) => axisIds.has(v.attributeId));
      if (cAttrs.length !== comboValues.length) continue;
      const match = comboValues.every((cv) =>
        cAttrs.some((ca) => ca.attributeId === cv.attributeId && ca.valueId === cv.valueId),
      );
      if (match) return { id: c.id, sku: c.sku, nombre: c.nombre };
    }
    return null;
  }
}