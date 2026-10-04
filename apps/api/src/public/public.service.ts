import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@ppg/db";
import { dec } from "../common/util";
import { valoresPermitidosLote } from "../common/valores-permitidos";
import { PrismaService } from "../prisma/prisma.service";
import { ProductosService } from "../productos/productos.service";

export interface PassoOption {
  valueId: number;
  valor: string;
  enStock: boolean;
}

export interface Passo {
  sortOrder: number;
  panel: number;
  pregunta: string;
  attributeId: number;
  variantProductId: number;
  opciones: PassoOption[];
}

export interface SeleccionPaso {
  attributeId: number;
  valueId: number;
}

export interface ResolucionVariante {
  variantId: number | null;
  sku: string | null;
  nombre: string | null;
  existe: boolean;
  creada?: boolean;
}

@Injectable()
export class PublicService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly productos: ProductosService,
  ) {}

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

  // Productos marcados como vendibles: alimentan el selector del modal de Ventas.
  async productosPublicos() {
    const rows = await this.prisma.product.findMany({
      where: { activo: true, vendible: true },
      include: {
        variants: {
          where: { activo: true },
          orderBy: { nombre: "asc" },
        },
        _count: { select: { passos: true } },
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
      tienePasos: p._count.passos > 0,
      variantes: p.variants.map((v) => ({
        id: v.id,
        nombre: v.nombre,
        sku: v.sku,
        precio: v.price === null ? dec(p.basePrice) : dec(v.price),
      })),
    }));
  }

  // Para consumidores externos futuros (catálogo público) — E5/tienda.
  async catalogo() {
    const rows = await this.prisma.productVariant.findMany({
      where: { activo: true, product: { activo: true, vendible: true } },
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
      empaques: v.packagings.map((p) => ({ nombre: p.packaging.nombre, cantidad: dec(p.cantidad) })),
    }));
  }

  /**
   * Arma los pasos guiados del storefront. Las opciones de cada paso salen de las
   * variantes ACTIVAS del componente (`variantProductId`) que tengan ese atributo,
   * filtradas por los valores permitidos del producto. Si se pasa `seleccion`, se
   * filtran además por compatibilidad con lo elegido (ejes compartidos, p. ej. rosca).
   */
  async getPasos(productId: number, seleccion: SeleccionPaso[] = []): Promise<Passo[]> {
    const product = await this.prisma.product.findUnique({ where: { id: productId } });
    if (!product) throw new NotFoundException(`Producto ${productId} no encontrado`);

    const passos = await this.prisma.productPasso.findMany({
      where: { productId },
      orderBy: { sortOrder: "asc" },
    });
    if (passos.length === 0) return [];

    const attrIds = [...new Set(passos.filter((p) => p.attributeId != null).map((p) => p.attributeId!))];
    const permitidos = await valoresPermitidosLote(this.prisma, product.id, attrIds);
    // Para la regla BTVPE se necesitan también las alturas (no siempre son pasos).
    const attrsAltura = await this.prisma.attribute.findMany({
      where: { nombre: { in: ["Altura de Botella", "Altura de Vastago"] } },
      select: { id: true, nombre: true },
    });
    const attrIdPorNombre = new Map(attrsAltura.map((a) => [a.nombre, a.id]));
    const valueAttrIds = [...new Set([...attrIds, ...attrsAltura.map((a) => a.id)])];
    const values = await this.prisma.attributeValue.findMany({
      where: { attributeId: { in: valueAttrIds } },
      orderBy: { valor: "asc" },
    });
    const valorPorId = new Map(values.map((v) => [v.id, v.valor]));

    // Variantes activas de los componentes referenciados por los pasos.
    const componentIds = [...new Set(passos.map((p) => p.variantProductId ?? p.productId))];
    const variantes = await this.prisma.productVariant.findMany({
      where: { productId: { in: componentIds }, activo: true },
      include: { variantAttributes: true, stockLevels: true },
    });
    const porProducto = new Map<number, typeof variantes>();
    for (const v of variantes) {
      const arr = porProducto.get(v.productId) ?? [];
      arr.push(v);
      porProducto.set(v.productId, arr);
    }
    type Variante = (typeof variantes)[number];
    const attrsDe = (v: Variante) => new Map(v.variantAttributes.map((va) => [va.attributeId, va.valueId]));
    const enStockDe = (v: Variante) => v.stockLevels.reduce((a, l) => a + dec(l.qty), 0) > 0;

    const componentePorAtributo = new Map<number, number>();
    for (const p of passos) if (p.attributeId != null) componentePorAtributo.set(p.attributeId, p.variantProductId ?? p.productId);

    // Regla BTVPE: la altura del vástago no excede la altura de la botella + 2mm.
    const esBtvpe = product.skuBase.startsWith("BTVPE-");
    const alturaBotellaAttr = attrIdPorNombre.get("Altura de Botella");
    const alturaVastagoAttr = attrIdPorNombre.get("Altura de Vastago");
    const valorDe = (valueId: number | undefined) => (valueId === undefined ? undefined : valorPorId.get(valueId));
    const numMm = (s: string | undefined) => {
      if (!s) return undefined;
      const m = s.match(/([\d.]+)\s*mm/i);
      return m ? Number(m[1]) : undefined;
    };
    // La botella elegida determina la altura máxima del vástago. Se toma la
    // selección de los pasos cuyo componente es el mismo que el de Altura de Vastago
    // (la Botella) y se busca la variante que coincida con TODA esa selección.
    const botellaMax = (() => {
      if (!esBtvpe || alturaBotellaAttr === undefined) return undefined;
      const pasosBotella = seleccion.filter((s) =>
        (porProducto.get(componentePorAtributo.get(s.attributeId) ?? -1) ?? []).some((v) => attrsDe(v).has(alturaBotellaAttr)),
      );
      if (pasosBotella.length === 0) return undefined;
      const compId = componentePorAtributo.get(pasosBotella[0].attributeId);
      if (compId === undefined) return undefined;
      const match = (porProducto.get(compId) ?? []).find((v) =>
        pasosBotella.every((s) => attrsDe(v).get(s.attributeId) === s.valueId),
      );
      const h = numMm(match ? valorDe(attrsDe(match).get(alturaBotellaAttr)) : undefined);
      return h === undefined ? undefined : h + 2;
    })();

    const dentroAlturaVastago = (cand: Variante): boolean => {
      if (botellaMax === undefined || alturaVastagoAttr === undefined) return true;
      const h = numMm(valorDe(attrsDe(cand).get(alturaVastagoAttr)));
      return h === undefined || h <= botellaMax;
    };

    // Una variante candidata es compatible si, para cada selección previa, coincide
    // con las variantes del componente elegido en todos los ejes que comparten.
    const esCompatible = (cand: Variante): boolean => {
      const ca = attrsDe(cand);
      for (const s of seleccion) {
        const compSel = componentePorAtributo.get(s.attributeId);
        if (compSel === undefined) continue;
        const matchSel = (porProducto.get(compSel) ?? []).filter((v) => attrsDe(v).get(s.attributeId) === s.valueId);
        if (matchSel.length === 0) return false;
        for (const [attrId, valId] of ca) {
          if (!matchSel.some((m) => attrsDe(m).has(attrId))) continue;
          if (!matchSel.some((m) => attrsDe(m).get(attrId) === valId)) return false;
        }
      }
      return true;
    };

    return passos
      .filter((p) => p.attributeId != null)
      .map((passo) => {
        const attrId = passo.attributeId!;
        const componenteId = passo.variantProductId ?? passo.productId;
        const permitidosSet = new Set(permitidos.get(attrId) ?? []);
        const compatibles = (porProducto.get(componenteId) ?? []).filter((v) => {
          const val = attrsDe(v).get(attrId);
          return val !== undefined && permitidosSet.has(val) && esCompatible(v) && dentroAlturaVastago(v);
        });
        const porValor = new Map<number, boolean>();
        for (const v of compatibles) {
          const valueId = attrsDe(v).get(attrId)!;
          porValor.set(valueId, (porValor.get(valueId) ?? false) || enStockDe(v));
        }
        const opciones: PassoOption[] = [...porValor.entries()]
          .map(([valueId, enStock]) => ({ valueId, valor: valorPorId.get(valueId) ?? String(valueId), enStock }))
          .sort((a, b) => a.valor.localeCompare(b.valor));
        return {
          sortOrder: passo.sortOrder,
          panel: passo.panel,
          pregunta: passo.pregunta,
          attributeId: attrId,
          variantProductId: componenteId,
          opciones,
        };
      });
  }

  /**
   * Resuelve (y opcionalmente materializa) la variante vendible del producto a partir
   * de la selección de componentes. Deduce los ejes que no son paso (p. ej.
   * `Tamaño rosca`) desde las variantes del componente elegido.
   */
  async resolverConfiguracion(
    productId: number,
    seleccion: SeleccionPaso[],
    opts: { crear?: boolean } = {},
  ): Promise<ResolucionVariante> {
    const product = await this.prisma.product.findUnique({ where: { id: productId } });
    if (!product) throw new NotFoundException(`Producto ${productId} no encontrado`);

    const axes = await this.prisma.productAttributeLine.findMany({
      where: { productId },
      orderBy: { sortOrder: "asc" },
      include: { attribute: true },
    });
    if (axes.length === 0) throw new BadRequestException("El producto no tiene ejes configurados");

    const passos = await this.prisma.productPasso.findMany({ where: { productId } });
    const componentePorAtributo = new Map<number, number>();
    for (const p of passos) if (p.attributeId != null) componentePorAtributo.set(p.attributeId, p.variantProductId ?? p.productId);

    const combo = new Map<number, number>();
    for (const s of seleccion) {
      const componenteId = componentePorAtributo.get(s.attributeId);
      if (componenteId === undefined) continue;
      combo.set(s.attributeId, s.valueId);
      const variantes = await this.prisma.productVariant.findMany({
        where: { productId: componenteId, activo: true },
        include: { variantAttributes: true },
      });
      const match = variantes.filter((v) => v.variantAttributes.some((va) => va.attributeId === s.attributeId && va.valueId === s.valueId));
      if (match.length === 0) continue;
      for (const axe of axes) {
        if (combo.has(axe.attributeId)) continue;
        const vals = new Set<number>();
        for (const m of match) {
          const va = m.variantAttributes.find((x) => x.attributeId === axe.attributeId);
          if (va) vals.add(va.valueId);
        }
        if (vals.size === 1) combo.set(axe.attributeId, [...vals][0]);
      }
    }

    const faltantes = axes.filter((a) => !combo.has(a.attributeId)).map((a) => a.attribute.nombre);
    if (faltantes.length > 0) {
      throw new BadRequestException(`Selección incompleta: falta ${faltantes.join(", ")}`);
    }

    // Regla BTVPE: la altura del vástago no excede la altura de la botella + 2mm.
    // La altura de la botella se lee de la variante de Botella que coincide con la
    // selección (aunque "Altura de Botella" no sea un paso).
    if (product.skuBase.startsWith("BTVPE-")) {
      const numMm = (s: string | undefined) => {
        const m = s?.match(/([\d.]+)\s*mm/i);
        return m ? Number(m[1]) : undefined;
      };
      const attrsAltura = await this.prisma.attribute.findMany({
        where: { nombre: { in: ["Altura de Botella", "Altura de Vastago"] } },
        select: { id: true, nombre: true },
      });
      const aB = attrsAltura.find((a) => a.nombre === "Altura de Botella")?.id;
      const aV = attrsAltura.find((a) => a.nombre === "Altura de Vastago")?.id;
      if (aB !== undefined && aV !== undefined) {
        let alturaBotella: number | undefined;
        for (const s of seleccion) {
          const componenteId = componentePorAtributo.get(s.attributeId);
          if (componenteId === undefined) continue;
          const variantes = await this.prisma.productVariant.findMany({
            where: { productId: componenteId, activo: true },
            include: { variantAttributes: true },
          });
          const match = variantes.find((v) => v.variantAttributes.some((va) => va.attributeId === s.attributeId && va.valueId === s.valueId));
          const vaB = match?.variantAttributes.find((x) => x.attributeId === aB);
          if (vaB) {
            const val = await this.prisma.attributeValue.findUnique({ where: { id: vaB.valueId } });
            const h = numMm(val?.valor);
            if (h !== undefined) { alturaBotella = h; break; }
          }
        }
        const vaV = combo.get(aV);
        if (alturaBotella !== undefined && vaV !== undefined) {
          const valV = await this.prisma.attributeValue.findUnique({ where: { id: vaV } });
          const hv = numMm(valV?.valor);
          if (hv !== undefined && hv > alturaBotella + 2) {
            throw new BadRequestException(`La altura del vástago (${hv}mm) excede la de la botella (${alturaBotella}mm) + 2mm`);
          }
        }
      }
    }

    const valueIds = axes.map((a) => combo.get(a.attributeId)!);
    const candidatas = await this.prisma.productVariant.findMany({
      where: { productId, activo: true },
      include: { variantAttributes: true },
    });
    const existente = candidatas.find((v) =>
      valueIds.every((vid, i) => v.variantAttributes.some((va) => va.attributeId === axes[i].attributeId && va.valueId === vid)),
    );
    if (existente) {
      return { variantId: existente.id, sku: existente.sku, nombre: existente.nombre, existe: true };
    }
    if (!opts.crear) {
      return { variantId: null, sku: null, nombre: null, existe: false };
    }

    const variantId = await this.productos.materializar(productId, valueIds);
    const creada = await this.prisma.productVariant.findUnique({ where: { id: variantId } });
    return { variantId, sku: creada?.sku ?? null, nombre: creada?.nombre ?? null, existe: true, creada: true };
  }
}