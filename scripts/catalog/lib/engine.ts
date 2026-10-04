import type { Prisma } from "@prisma/client";
import type { Op } from "./ops";

type Tx = Prisma.TransactionClient;

export interface EngineResult {
  logs: string[];
  warns: string[];
}

const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
const cap = (s: string) => (s.trim() ? s.trim().charAt(0).toUpperCase() + s.trim().slice(1) : s.trim());

async function attrBy(tx: Tx, nombre: string) {
  return tx.attribute.findUnique({ where: { nombre } });
}
async function ensureAttr(tx: Tx, nombre: string) {
  return (await attrBy(tx, nombre)) ?? (await tx.attribute.create({ data: { nombre } }));
}
async function findValue(tx: Tx, attributeId: number, valor: string) {
  const vals = await tx.attributeValue.findMany({ where: { attributeId } });
  return vals.find((v) => norm(v.valor) === norm(valor));
}
async function ensureValue(tx: Tx, attributeId: number, valor: string) {
  return (await findValue(tx, attributeId, valor)) ?? (await tx.attributeValue.create({ data: { attributeId, valor: cap(valor) } }));
}
async function productByName(tx: Tx, nombre: string) {
  return tx.product.findFirst({ where: { nombre } });
}
async function variantBySku(tx: Tx, sku: string) {
  return tx.productVariant.findUnique({ where: { sku } });
}
async function ensureCategory(tx: Tx, nombre: string) {
  return (await tx.category.findUnique({ where: { nombre } })) ?? (await tx.category.create({ data: { nombre } }));
}
async function ensureLocation(tx: Tx, nombre: string, tipo: "almacen" | "temporal" = "almacen") {
  return (await tx.location.findUnique({ where: { nombre } })) ?? (await tx.location.create({ data: { nombre, tipo } }));
}
async function ensurePackaging(tx: Tx, nombre: string) {
  return (await tx.packaging.findUnique({ where: { nombre } })) ?? (await tx.packaging.create({ data: { nombre } }));
}
async function setAttr(tx: Tx, variantId: number, attributeId: number, valueId: number) {
  return tx.variantAttribute.upsert({
    where: { variantId_attributeId: { variantId, attributeId } },
    update: { valueId },
    create: { variantId, attributeId, valueId },
  });
}

/** Mueve los VariantAttribute de un producto desde originAttr hacia targetAttr. */
async function moveVariants(tx: Tx, originAttrId: number, productId: number, targetAttrId: number) {
  const vas = await tx.variantAttribute.findMany({
    where: { attributeId: originAttrId, variant: { productId } },
    include: { value: true },
  });
  let n = 0;
  for (const va of vas) {
    const tv = await ensureValue(tx, targetAttrId, va.value.valor);
    const existing = await tx.variantAttribute.findUnique({
      where: { variantId_attributeId: { variantId: va.variantId, attributeId: targetAttrId } },
    });
    if (existing) {
      await tx.variantAttribute.delete({ where: { id: va.id } });
      await tx.variantAttribute.update({ where: { id: existing.id }, data: { valueId: tv.id } });
    } else {
      await tx.variantAttribute.update({ where: { id: va.id }, data: { attributeId: targetAttrId, valueId: tv.id } });
    }
    n++;
  }
  return n;
}

async function moveLine(tx: Tx, originAttrId: number, productId: number, targetAttrId: number) {
  const originLine = await tx.productAttributeLine.findUnique({
    where: { productId_attributeId: { productId, attributeId: originAttrId } },
  });
  if (!originLine) return false;
  const targetLine = await tx.productAttributeLine.findUnique({
    where: { productId_attributeId: { productId, attributeId: targetAttrId } },
  });
  if (targetLine) await tx.productAttributeLine.delete({ where: { id: originLine.id } });
  else await tx.productAttributeLine.update({ where: { id: originLine.id }, data: { attributeId: targetAttrId } });

  const pavs = await tx.productAttributeValue.findMany({ where: { productId, attributeId: originAttrId } });
  for (const pav of pavs) {
    const val = await tx.attributeValue.findUnique({ where: { id: pav.valueId } });
    if (!val) continue;
    const tv = await ensureValue(tx, targetAttrId, val.valor);
    const dup = await tx.productAttributeValue.findFirst({ where: { productId, attributeId: targetAttrId, valueId: tv.id } });
    if (dup) await tx.productAttributeValue.delete({ where: { id: pav.id } });
    else await tx.productAttributeValue.update({ where: { id: pav.id }, data: { attributeId: targetAttrId, valueId: tv.id } });
  }
  return true;
}

async function bloqueos(tx: Tx, variantId: number) {
  const [stock, movs, precios, ventas, ofs, ofLineas, reportes] = await Promise.all([
    tx.stockLevel.count({ where: { variantId } }),
    tx.stockMove.count({ where: { variantId } }),
    tx.priceChange.count({ where: { variantId } }),
    tx.salesOrderLine.count({ where: { variantId } }),
    tx.manufacturingOrder.count({ where: { variantId } }),
    tx.manufacturingOrderLine.count({ where: { componentVariantId: variantId } }),
    tx.productionReportLine.count({ where: { variantId } }),
  ]);
  return { stock, movs, precios, ventas, ofs, ofLineas, reportes };
}

async function runOp(tx: Tx, o: Op, log: (s: string) => void, warn: (s: string) => void): Promise<void> {
  switch (o.op) {
    case "attr.ensure": {
      const a = await attrBy(tx, o.name);
      if (!a) {
        const creado = await tx.attribute.create({ data: { nombre: o.name } });
        for (const v of o.values ?? []) await ensureValue(tx, creado.id, v);
        log(`attr.ensure: ${o.name} creado${o.values?.length ? ` (+${o.values.length} valores)` : ""}`);
        return;
      }
      let added = 0;
      for (const v of o.values ?? []) {
        if (!(await findValue(tx, a.id, v))) { await ensureValue(tx, a.id, v); added++; }
      }
      log(added ? `attr.ensure: ${o.name} +${added} valores` : `attr.ensure ya estaba: ${o.name}`);
      return;
    }
    case "attr.rename": {
      const a = await attrBy(tx, o.from);
      if (!a) {
        if (await attrBy(tx, o.to)) log(`attr.rename ya aplicado: ${o.from} -> ${o.to}`);
        else warn(`attr.rename: no existe "${o.from}"`);
        return;
      }
      const conflict = await attrBy(tx, o.to);
      if (conflict && conflict.id !== a.id) throw new Error(`attr.rename: "${o.to}" ya existe`);
      await tx.attribute.update({ where: { id: a.id }, data: { nombre: o.to } });
      log(`attr.rename: ${o.from} -> ${o.to}`);
      return;
    }
    case "attr.delete": {
      const a = await attrBy(tx, o.name);
      if (!a) { log(`attr.delete ya aplicado: ${o.name}`); return; }
      const va = await tx.variantAttribute.count({ where: { attributeId: a.id } });
      if (va > 0 && !o.cascade) throw new Error(`attr.delete: "${o.name}" tiene ${va} variantes; usa remap o cascade:true`);
      const passos = await tx.productPasso.count({ where: { attributeId: a.id } });
      if (passos > 0) throw new Error(`attr.delete: "${o.name}" está en ${passos} ProductPasso`);
      if (va > 0) await tx.variantAttribute.deleteMany({ where: { attributeId: a.id } });
      await tx.productAttributeValue.deleteMany({ where: { attributeId: a.id } });
      await tx.productAttributeLine.deleteMany({ where: { attributeId: a.id } });
      await tx.attributeValue.deleteMany({ where: { attributeId: a.id } });
      await tx.attribute.delete({ where: { id: a.id } });
      log(`attr.delete: ${o.name}${va ? ` (${va} variantes)` : ""}`);
      return;
    }
    case "attr.merge": {
      const origin = await attrBy(tx, o.from);
      if (!origin) { log(`attr.merge ya aplicado: ${o.from}`); return; }
      const target = await ensureAttr(tx, o.into);
      if (target.id === origin.id) return;
      const vas = await tx.variantAttribute.findMany({ where: { attributeId: origin.id }, include: { value: true } });
      const prefer = o.prefer ?? "target";
      for (const va of vas) {
        const tv = await ensureValue(tx, target.id, va.value.valor);
        const existing = await tx.variantAttribute.findUnique({
          where: { variantId_attributeId: { variantId: va.variantId, attributeId: target.id } },
        });
        if (existing) {
          if (prefer === "origin") await tx.variantAttribute.update({ where: { id: existing.id }, data: { valueId: tv.id } });
          await tx.variantAttribute.delete({ where: { id: va.id } });
        } else {
          await tx.variantAttribute.update({ where: { id: va.id }, data: { attributeId: target.id, valueId: tv.id } });
        }
      }
      const lines = await tx.productAttributeLine.findMany({ where: { attributeId: origin.id } });
      for (const l of lines) {
        const dup = await tx.productAttributeLine.findUnique({ where: { productId_attributeId: { productId: l.productId, attributeId: target.id } } });
        if (dup) await tx.productAttributeLine.delete({ where: { id: l.id } });
        else await tx.productAttributeLine.update({ where: { id: l.id }, data: { attributeId: target.id } });
      }
      const pavs = await tx.productAttributeValue.findMany({ where: { attributeId: origin.id } });
      for (const p of pavs) {
        const val = await tx.attributeValue.findUnique({ where: { id: p.valueId } });
        if (!val) continue;
        const tv = await ensureValue(tx, target.id, val.valor);
        const dup = await tx.productAttributeValue.findFirst({ where: { productId: p.productId, attributeId: target.id, valueId: tv.id } });
        if (dup) await tx.productAttributeValue.delete({ where: { id: p.id } });
        else await tx.productAttributeValue.update({ where: { id: p.id }, data: { attributeId: target.id, valueId: tv.id } });
      }
      await tx.productPasso.updateMany({ where: { attributeId: origin.id }, data: { attributeId: target.id } });
      await tx.attributeValue.deleteMany({ where: { attributeId: origin.id } });
      await tx.attribute.delete({ where: { id: origin.id } });
      log(`attr.merge: ${o.from} -> ${o.into} (${vas.length} variantes)`);
      return;
    }
    case "attr.assignAxis": {
      const a = await ensureAttr(tx, o.attribute);
      const p = await productByName(tx, o.product);
      if (!p) throw new Error(`attr.assignAxis: no existe el producto "${o.product}"`);
      const existing = await tx.productAttributeLine.findUnique({ where: { productId_attributeId: { productId: p.id, attributeId: a.id } } });
      const max = await tx.productAttributeLine.aggregate({ where: { productId: p.id }, _max: { sortOrder: true } });
      const sortOrder = o.sortOrder ?? (max._max.sortOrder ?? -1) + 1;
      if (existing && existing.sortOrder === sortOrder) { log(`attr.assignAxis ya estaba: ${o.attribute} -> ${o.product}`); return; }
      await tx.productAttributeLine.upsert({
        where: { productId_attributeId: { productId: p.id, attributeId: a.id } },
        update: { sortOrder },
        create: { productId: p.id, attributeId: a.id, sortOrder },
      });
      log(`attr.assignAxis: ${o.attribute} -> ${o.product} (orden ${sortOrder})`);
      return;
    }
    case "attr.unassignAxis": {
      const a = await attrBy(tx, o.attribute);
      const p = await productByName(tx, o.product);
      if (!a || !p) { log(`attr.unassignAxis ya aplicado: ${o.attribute}/${o.product}`); return; }
      const vids = (await tx.productVariant.findMany({ where: { productId: p.id }, select: { id: true } })).map((v) => v.id);
      const va = await tx.variantAttribute.deleteMany({ where: { attributeId: a.id, variantId: { in: vids } } });
      await tx.productAttributeValue.deleteMany({ where: { productId: p.id, attributeId: a.id } });
      await tx.productAttributeLine.deleteMany({ where: { productId: p.id, attributeId: a.id } });
      log(`attr.unassignAxis: ${o.attribute} de ${o.product} (${va.count} variantes)`);
      return;
    }
    case "attr.restrictValues": {
      const a = await attrBy(tx, o.attribute);
      if (!a) throw new Error(`attr.restrictValues: no existe el atributo "${o.attribute}"`);
      const p = await productByName(tx, o.product);
      if (!p) throw new Error(`attr.restrictValues: no existe el producto "${o.product}"`);
      const current = await tx.productAttributeValue.findMany({ where: { productId: p.id, attributeId: a.id }, include: { value: true } });
      const curSet = current.map((c) => norm(c.value.valor)).sort();
      const desSet = o.values.map(norm).sort();
      if (curSet.length === desSet.length && curSet.every((v, i) => v === desSet[i])) {
        log(`attr.restrictValues ya estaba: ${o.product}/${o.attribute}`);
        return;
      }
      await tx.productAttributeValue.deleteMany({ where: { productId: p.id, attributeId: a.id } });
      for (const v of o.values) {
        const val = await ensureValue(tx, a.id, v);
        await tx.productAttributeValue.create({ data: { productId: p.id, attributeId: a.id, valueId: val.id } });
      }
      log(`attr.restrictValues: ${o.product}/${o.attribute} = [${o.values.join(", ")}]`);
      return;
    }
    case "attr.splitByProduct": {
      const origin = await attrBy(tx, o.from);
      for (const [productName, targetName] of Object.entries(o.into)) {
        const target = await ensureAttr(tx, targetName);
        for (const v of o.values ?? []) await ensureValue(tx, target.id, v);
        const p = await productByName(tx, productName);
        if (!p) { warn(`attr.splitByProduct: no existe el producto "${productName}"`); continue; }
        if (origin) {
          const n = await moveVariants(tx, origin.id, p.id, target.id);
          await moveLine(tx, origin.id, p.id, target.id);
          log(`attr.splitByProduct: ${o.from} -> ${targetName} (${productName}, ${n} variantes)`);
        } else {
          const exists = await tx.productAttributeLine.findUnique({ where: { productId_attributeId: { productId: p.id, attributeId: target.id } } });
          if (!exists) await tx.productAttributeLine.create({ data: { productId: p.id, attributeId: target.id, sortOrder: 0 } });
        }
      }
      // cleanup del origen si quedó vacío
      if (origin) {
        const vals = await tx.attributeValue.findMany({ where: { attributeId: origin.id } });
        for (const v of vals) {
          const usos = (await tx.variantAttribute.count({ where: { valueId: v.id } })) + (await tx.productAttributeValue.count({ where: { valueId: v.id } }));
          if (usos === 0) await tx.attributeValue.delete({ where: { id: v.id } });
        }
        const rest = (await tx.variantAttribute.count({ where: { attributeId: origin.id } }))
          + (await tx.productAttributeLine.count({ where: { attributeId: origin.id } }))
          + (await tx.productPasso.count({ where: { attributeId: origin.id } }))
          + (await tx.attributeValue.count({ where: { attributeId: origin.id } }));
        if (rest === 0) { await tx.attribute.delete({ where: { id: origin.id } }); log(`attr.splitByProduct: "${o.from}" eliminado`); }
        else warn(`attr.splitByProduct: "${o.from}" conserva ${rest} referencia(s)`);
      }
      return;
    }
    case "value.add": {
      const a = await attrBy(tx, o.attribute);
      if (!a) throw new Error(`value.add: no existe el atributo "${o.attribute}"`);
      const before = await findValue(tx, a.id, o.value);
      if (before) { log(`value.add ya estaba: ${o.attribute}/${o.value}`); return; }
      await tx.attributeValue.create({ data: { attributeId: a.id, valor: cap(o.value) } });
      log(`value.add: ${o.attribute} += ${cap(o.value)}`);
      return;
    }
    case "value.rename": {
      const a = await attrBy(tx, o.attribute);
      if (!a) throw new Error(`value.rename: no existe el atributo "${o.attribute}"`);
      const from = await findValue(tx, a.id, o.from);
      if (!from) {
        if (await findValue(tx, a.id, o.to)) log(`value.rename ya aplicado: ${o.attribute}/${o.from}`);
        else warn(`value.rename: no existe "${o.from}" en "${o.attribute}"`);
        return;
      }
      const conflict = await findValue(tx, a.id, o.to);
      if (conflict && conflict.id !== from.id) throw new Error(`value.rename: "${o.to}" ya existe en "${o.attribute}"`);
      await tx.attributeValue.update({ where: { id: from.id }, data: { valor: cap(o.to) } });
      log(`value.rename: ${o.attribute}: ${o.from} -> ${o.to}`);
      return;
    }
    case "value.delete": {
      const a = await attrBy(tx, o.attribute);
      if (!a) { log(`value.delete ya aplicado: ${o.attribute}/${o.value}`); return; }
      const v = await findValue(tx, a.id, o.value);
      if (!v) { log(`value.delete ya aplicado: ${o.attribute}/${o.value}`); return; }
      const usos = await tx.variantAttribute.count({ where: { valueId: v.id } });
      if (usos > 0 && !o.cascade) throw new Error(`value.delete: "${o.value}" en uso (${usos}); usa remap o cascade:true`);
      if (usos > 0) await tx.variantAttribute.deleteMany({ where: { valueId: v.id } });
      await tx.productAttributeValue.deleteMany({ where: { valueId: v.id } });
      await tx.attributeValue.delete({ where: { id: v.id } });
      log(`value.delete: ${o.attribute}/${o.value}${usos ? ` (${usos} variantes)` : ""}`);
      return;
    }
    case "value.merge": {
      const a = await attrBy(tx, o.attribute);
      if (!a) { log(`value.merge ya aplicado: ${o.attribute}`); return; }
      const from = await findValue(tx, a.id, o.from);
      if (!from) { log(`value.merge ya aplicado: ${o.attribute}/${o.from}`); return; }
      const to = await findValue(tx, a.id, o.into);
      if (!to) {
        await tx.attributeValue.update({ where: { id: from.id }, data: { valor: cap(o.into) } });
      } else {
        await tx.variantAttribute.updateMany({ where: { valueId: from.id }, data: { valueId: to.id } });
        await tx.productAttributeValue.updateMany({ where: { valueId: from.id }, data: { valueId: to.id } });
        await tx.attributeValue.delete({ where: { id: from.id } });
      }
      log(`value.merge: ${o.attribute}: ${o.from} -> ${o.into}`);
      return;
    }
    case "value.remap": {
      const fromAttr = await attrBy(tx, o.fromAttr);
      if (!fromAttr) { log(`value.remap ya aplicado: ${o.fromAttr}/${o.fromValue}`); return; }
      const fromVal = await findValue(tx, fromAttr.id, o.fromValue);
      if (!fromVal) { log(`value.remap ya aplicado: ${o.fromAttr}/${o.fromValue}`); return; }
      const toAttr = await ensureAttr(tx, o.toAttr);
      const toVal = await ensureValue(tx, toAttr.id, o.toValue);
      const vas = await tx.variantAttribute.findMany({ where: { attributeId: fromAttr.id, valueId: fromVal.id } });
      let n = 0;
      for (const va of vas) {
        const existing = await tx.variantAttribute.findUnique({
          where: { variantId_attributeId: { variantId: va.variantId, attributeId: toAttr.id } },
        });
        if (existing && existing.valueId !== toVal.id) {
          warn(`value.remap: variante ${va.variantId} ya tiene ${o.toAttr}; se conserva`);
          continue;
        }
        await setAttr(tx, va.variantId, toAttr.id, toVal.id);
        await tx.variantAttribute.delete({ where: { id: va.id } });
        n++;
      }
      log(`value.remap: ${o.fromAttr}/${o.fromValue} -> ${o.toAttr}/${o.toValue} (${n} variantes)`);
      return;
    }
    case "variant.set": {
      const v = await variantBySku(tx, o.sku);
      if (!v) throw new Error(`variant.set: no existe la variante "${o.sku}"`);
      const a = await attrBy(tx, o.attribute);
      if (!a) throw new Error(`variant.set: no existe el atributo "${o.attribute}"`);
      const val = await ensureValue(tx, a.id, o.value);
      await setAttr(tx, v.id, a.id, val.id);
      log(`variant.set: ${o.sku} ${o.attribute}=${o.value}`);
      return;
    }
    case "variant.clear": {
      const v = await variantBySku(tx, o.sku);
      const a = await attrBy(tx, o.attribute);
      if (!v || !a) { log(`variant.clear ya aplicado: ${o.sku}/${o.attribute}`); return; }
      await tx.variantAttribute.deleteMany({ where: { variantId: v.id, attributeId: a.id } });
      log(`variant.clear: ${o.sku} ${o.attribute}`);
      return;
    }
    case "variant.create": {
      const existing = await variantBySku(tx, o.sku);
      if (existing) { log(`variant.create ya existe: ${o.sku}`); return; }
      const p = await productByName(tx, o.product);
      if (!p) throw new Error(`variant.create: no existe el producto "${o.product}"`);
      const v = await tx.productVariant.create({ data: { productId: p.id, nombre: o.nombre ?? p.nombre, sku: o.sku } });
      for (const [attrName, valueName] of Object.entries(o.attrs)) {
        const a = await attrBy(tx, attrName);
        if (!a) throw new Error(`variant.create: no existe el atributo "${attrName}"`);
        const val = await ensureValue(tx, a.id, valueName);
        await setAttr(tx, v.id, a.id, val.id);
      }
      log(`variant.create: ${o.sku}`);
      return;
    }
    case "variant.copy": {
      const existing = await variantBySku(tx, o.sku);
      if (existing) { log(`variant.copy ya existe: ${o.sku}`); return; }
      const src = await variantBySku(tx, o.from);
      if (!src) throw new Error(`variant.copy: no existe la variante origen "${o.from}"`);
      const srcVa = await tx.variantAttribute.findMany({ where: { variantId: src.id }, include: { attribute: true } });
      const v = await tx.productVariant.create({ data: { productId: src.productId, nombre: src.nombre, sku: o.sku } });
      const byName = new Map(srcVa.map((va) => [va.attribute.nombre, va.valueId]));
      for (const [attrName, valueName] of Object.entries(o.overrides ?? {})) {
        const a = await attrBy(tx, attrName);
        if (!a) throw new Error(`variant.copy: no existe el atributo "${attrName}"`);
        byName.set(attrName, (await ensureValue(tx, a.id, valueName)).id);
      }
      for (const [attrName, valueId] of byName) {
        const a = await attrBy(tx, attrName);
        if (a) await setAttr(tx, v.id, a.id, valueId);
      }
      log(`variant.copy: ${o.from} -> ${o.sku}`);
      return;
    }
    case "variant.deriveFrom": {
      const target = await productByName(tx, o.target);
      const source = await productByName(tx, o.source);
      if (!target || !source) throw new Error(`variant.deriveFrom: falta producto target/source`);
      const nameToId = new Map<string, number>();
      for (const n of [...o.on, ...o.inherit]) {
        const a = await attrBy(tx, n);
        if (!a) throw new Error(`variant.deriveFrom: no existe el atributo "${n}"`);
        nameToId.set(n, a.id);
      }
      const idToName = new Map([...nameToId].map(([n, id]) => [id, n] as const));
      const onIds = o.on.map((n) => nameToId.get(n)!);
      const inheritIds = o.inherit.map((n) => nameToId.get(n)!);
      const key = (m: Map<number, number>) => onIds.map((id) => m.get(id) ?? "?").join("|");
      const load = async (productId: number) => {
        const vs = await tx.productVariant.findMany({ where: { productId }, include: { variantAttributes: true } });
        return vs.map((v) => ({ id: v.id, sku: v.sku, attrs: new Map(v.variantAttributes.map((va) => [va.attributeId, va.valueId])) }));
      };
      const sourceVars = await load(source.id);
      const byKey = new Map<string, Map<number, Set<number>>>();
      for (const v of sourceVars) {
        const k = key(v.attrs);
        const g = byKey.get(k) ?? new Map<number, Set<number>>();
        for (const id of inheritIds) {
          const val = v.attrs.get(id);
          if (val === undefined) continue;
          const set = g.get(id) ?? new Set<number>();
          set.add(val);
          g.set(id, set);
        }
        byKey.set(k, g);
      }
      const targetVars = await load(target.id);
      let n = 0;
      for (const v of targetVars) {
        const g = byKey.get(key(v.attrs));
        if (!g) continue;
        for (const [attrId, valueSet] of g) {
          if (v.attrs.has(attrId)) continue;
          if (valueSet.size !== 1) { warn(`variant.deriveFrom: ${v.sku} ${idToName.get(attrId)} ambiguo; pendiente`); continue; }
          const valueId = [...valueSet][0];
          await setAttr(tx, v.id, attrId, valueId);
          v.attrs.set(attrId, valueId);
          n++;
        }
      }
      log(`variant.deriveFrom: ${o.target} <- ${o.source} (${n} valores)`);
      return;
    }
    case "variant.delete": {
      const v = await variantBySku(tx, o.sku);
      if (!v) { log(`variant.delete ya aplicado: ${o.sku}`); return; }
      const b = await bloqueos(tx, v.id);
      const historial = b.precios + b.ventas + b.ofs + b.ofLineas + b.reportes;
      if (historial > 0) throw new Error(`variant.delete: "${o.sku}" tiene historial ${JSON.stringify(b)}`);
      if (b.stock + b.movs > 0 && !o.allowStock) throw new Error(`variant.delete: "${o.sku}" tiene stock/movimientos; usa allowStock:true`);
      await tx.stockMove.deleteMany({ where: { variantId: v.id } });
      await tx.stockLevel.deleteMany({ where: { variantId: v.id } });
      await tx.variantPackaging.deleteMany({ where: { variantId: v.id } });
      await tx.variantAttribute.deleteMany({ where: { variantId: v.id } });
      await tx.productVariant.delete({ where: { id: v.id } });
      log(`variant.delete: ${o.sku}`);
      return;
    }
    case "step.repoint": {
      const p = await productByName(tx, o.product);
      const from = await attrBy(tx, o.fromAttribute);
      if (!p || !from) { log(`step.repoint ya aplicado: ${o.fromAttribute}/${o.product}`); return; }
      const to = await ensureAttr(tx, o.toAttribute);
      const r = await tx.productPasso.updateMany({
        where: { attributeId: from.id, OR: [{ variantProductId: p.id }, { productId: p.id }] },
        data: { attributeId: to.id },
      });
      log(`step.repoint: ${o.fromAttribute} -> ${o.toAttribute} (${o.product}, ${r.count})`);
      return;
    }
    case "category.ensure": {
      if (await tx.category.findUnique({ where: { nombre: o.nombre } })) { log(`category.ensure ya estaba: ${o.nombre}`); return; }
      await tx.category.create({ data: { nombre: o.nombre } });
      log(`category.ensure: ${o.nombre} creada`);
      return;
    }
    case "location.ensure": {
      const prev = await tx.location.findUnique({ where: { nombre: o.nombre } });
      if (prev) {
        if (o.tipo && String(prev.tipo) !== o.tipo) { await tx.location.update({ where: { id: prev.id }, data: { tipo: o.tipo } }); log(`location.ensure: ${o.nombre} tipo -> ${o.tipo}`); }
        else log(`location.ensure ya estaba: ${o.nombre}`);
        return;
      }
      await tx.location.create({ data: { nombre: o.nombre, tipo: o.tipo ?? "almacen" } });
      log(`location.ensure: ${o.nombre} creada`);
      return;
    }
    case "packaging.ensure": {
      if (await tx.packaging.findUnique({ where: { nombre: o.nombre } })) { log(`packaging.ensure ya estaba: ${o.nombre}`); return; }
      await tx.packaging.create({ data: { nombre: o.nombre } });
      log(`packaging.ensure: ${o.nombre} creado`);
      return;
    }
    case "product.define": {
      const existing = await tx.product.findUnique({ where: { skuBase: o.sku } });
      const categoryId = o.category ? (await ensureCategory(tx, o.category)).id : existing?.categoryId ?? null;
      const nombre = o.nombre;
      const uom = o.uom ?? existing?.uom ?? "pieza";
      const basePrice = o.basePrice ?? (existing ? Number(existing.basePrice) : 0);
      const hasVariants = o.hasVariants ?? existing?.hasVariants ?? false;
      const vendible = o.vendible ?? existing?.vendible ?? false;
      const imagen = o.imagen !== undefined ? o.imagen : existing?.imagen ?? null;
      const activo = o.activo ?? existing?.activo ?? true;
      if (!existing) {
        await tx.product.create({ data: { nombre, skuBase: o.sku, categoryId, uom: uom as never, basePrice, hasVariants, vendible, imagen, activo } });
        log(`product.define: ${o.sku} creado`);
        return;
      }
      const same =
        existing.nombre === nombre &&
        String(existing.uom) === String(uom) &&
        Number(existing.basePrice) === Number(basePrice) &&
        existing.hasVariants === hasVariants &&
        existing.vendible === vendible &&
        existing.imagen === imagen &&
        existing.activo === activo &&
        existing.categoryId === categoryId;
      if (same) { log(`product.define ya estaba: ${o.sku}`); return; }
      await tx.product.update({ where: { id: existing.id }, data: { nombre, categoryId, uom: uom as never, basePrice, hasVariants, vendible, imagen, activo } });
      log(`product.define: ${o.sku} actualizado`);
      return;
    }
    case "variant.define": {
      const p = await productByName(tx, o.product);
      if (!p) throw new Error(`variant.define: no existe el producto "${o.product}"`);
      const desired = new Map<number, number>();
      for (const [attrName, valueName] of Object.entries(o.attrs)) {
        const a = await attrBy(tx, attrName);
        if (!a) throw new Error(`variant.define: no existe el atributo "${attrName}"`);
        desired.set(a.id, (await ensureValue(tx, a.id, valueName)).id);
      }
      let v = await variantBySku(tx, o.sku);
      if (!v) {
        v = await tx.productVariant.create({
          data: {
            productId: p.id,
            nombre: o.nombre ?? p.nombre,
            sku: o.sku,
            price: o.price ?? null,
            stockMin: o.min ?? 0,
            stockMax: o.max ?? 0,
            longLead: o.longLead ?? false,
            imagen: o.imagen ?? null,
            notas: o.notas ?? null,
            activo: o.activo ?? true,
          },
        });
        log(`variant.define: ${o.sku} creada`);
      } else {
        const meta = {
          nombre: o.nombre ?? v.nombre,
          price: o.price !== undefined ? o.price : (v.price === null ? null : Number(v.price)),
          stockMin: o.min ?? Number(v.stockMin),
          stockMax: o.max ?? Number(v.stockMax),
          longLead: o.longLead ?? v.longLead,
          imagen: o.imagen !== undefined ? o.imagen : v.imagen,
          notas: o.notas !== undefined ? o.notas : v.notas,
          activo: o.activo ?? v.activo,
        };
        const same =
          v.nombre === meta.nombre &&
          (v.price === null ? null : Number(v.price)) === meta.price &&
          Number(v.stockMin) === meta.stockMin &&
          Number(v.stockMax) === meta.stockMax &&
          v.longLead === meta.longLead &&
          v.imagen === meta.imagen &&
          v.notas === meta.notas &&
          v.activo === meta.activo;
        if (!same) {
          await tx.productVariant.update({ where: { id: v.id }, data: meta });
          log(`variant.define: ${o.sku} meta actualizada`);
        } else {
          log(`variant.define ya estaba: ${o.sku}`);
        }
      }
      const existingVa = await tx.variantAttribute.findMany({ where: { variantId: v.id } });
      let attrChanges = 0;
      for (const va of existingVa) {
        if (!desired.has(va.attributeId)) {
          await tx.variantAttribute.delete({ where: { id: va.id } });
          attrChanges++;
        }
      }
      for (const [attrId, valueId] of desired) {
        const cur = existingVa.find((x) => x.attributeId === attrId);
        if (cur && cur.valueId === valueId) continue;
        await setAttr(tx, v.id, attrId, valueId);
        attrChanges++;
      }
      if (attrChanges) log(`variant.define: ${o.sku} ${attrChanges} valor(es) ajustado(s)`);
      return;
    }
    case "bom.set": {
      const p = await productByName(tx, o.product);
      if (!p) throw new Error(`bom.set: no existe el producto "${o.product}"`);
      const desired: { componentId: number; cantidad: number; tipo: string }[] = [];
      for (const c of o.components) {
        const comp = await productByName(tx, c.component);
        if (!comp) throw new Error(`bom.set: no existe el componente "${c.component}"`);
        desired.push({ componentId: comp.id, cantidad: c.cantidad, tipo: c.tipo });
      }
      const existing = await tx.productComponent.findMany({ where: { productId: p.id } });
      const same =
        existing.length === desired.length &&
        desired.every((d) => existing.some((e) => e.componentId === d.componentId && Number(e.cantidad) === d.cantidad && String(e.tipo) === d.tipo));
      if (same) { log(`bom.set ya estaba: ${o.product}`); return; }
      await tx.productComponent.deleteMany({ where: { productId: p.id } });
      for (const d of desired) {
        await tx.productComponent.create({ data: { productId: p.id, componentId: d.componentId, cantidad: d.cantidad, tipo: d.tipo as never } });
      }
      log(`bom.set: ${o.product} (${desired.length} componentes)`);
      return;
    }
    case "step.set": {
      const p = await productByName(tx, o.product);
      if (!p) throw new Error(`step.set: no existe el producto "${o.product}"`);
      const desired: { sortOrder: number; pregunta: string; attributeId: number | null; variantProductId: number | null; panel: number }[] = [];
      for (const s of o.steps) {
        const a = s.attribute ? await attrBy(tx, s.attribute) : null;
        if (s.attribute && !a) throw new Error(`step.set: no existe el atributo "${s.attribute}"`);
        const vp = s.variantProduct ? await productByName(tx, s.variantProduct) : null;
        if (s.variantProduct && !vp) throw new Error(`step.set: no existe el producto "${s.variantProduct}"`);
        desired.push({ sortOrder: s.sortOrder, pregunta: s.pregunta, attributeId: a?.id ?? null, variantProductId: vp?.id ?? null, panel: s.panel ?? 0 });
      }
      const existing = await tx.productPasso.findMany({ where: { productId: p.id } });
      const same =
        existing.length === desired.length &&
        desired.every((d) =>
          existing.some(
            (e) =>
              e.sortOrder === d.sortOrder &&
              e.pregunta === d.pregunta &&
              e.attributeId === d.attributeId &&
              e.variantProductId === d.variantProductId &&
              e.panel === d.panel,
          ),
        );
      if (same) { log(`step.set ya estaba: ${o.product}`); return; }
      await tx.productPasso.deleteMany({ where: { productId: p.id } });
      for (const d of desired) await tx.productPasso.create({ data: { productId: p.id, ...d } });
      log(`step.set: ${o.product} (${desired.length} pasos)`);
      return;
    }
    case "packaging.set": {
      const v = await variantBySku(tx, o.sku);
      if (!v) throw new Error(`packaging.set: no existe la variante "${o.sku}"`);
      const desired: { packagingId: number; cantidad: number }[] = [];
      for (const e of o.empaques) {
        const pk = await ensurePackaging(tx, e.nombre);
        desired.push({ packagingId: pk.id, cantidad: e.cantidad });
      }
      const existing = await tx.variantPackaging.findMany({ where: { variantId: v.id } });
      const same =
        existing.length === desired.length &&
        desired.every((d) => existing.some((e) => e.packagingId === d.packagingId && Number(e.cantidad) === d.cantidad));
      if (same) { log(`packaging.set ya estaba: ${o.sku}`); return; }
      await tx.variantPackaging.deleteMany({ where: { variantId: v.id } });
      for (const d of desired) await tx.variantPackaging.create({ data: { variantId: v.id, packagingId: d.packagingId, cantidad: d.cantidad } });
      log(`packaging.set: ${o.sku} (${desired.length} empaques)`);
      return;
    }
    case "stock.set": {
      const v = await variantBySku(tx, o.sku);
      if (!v) throw new Error(`stock.set: no existe la variante "${o.sku}"`);
      const loc = await tx.location.findUnique({ where: { nombre: o.location } });
      if (!loc) throw new Error(`stock.set: no existe la ubicación "${o.location}"`);
      const current = await tx.stockLevel.findUnique({ where: { variantId_locationId: { variantId: v.id, locationId: loc.id } } });
      const currentQty = current ? Number(current.qty) : 0;
      if (currentQty === o.qty) { log(`stock.set ya estaba: ${o.sku}@${o.location}=${o.qty}`); return; }
      await tx.stockLevel.upsert({
        where: { variantId_locationId: { variantId: v.id, locationId: loc.id } },
        update: { qty: o.qty },
        create: { variantId: v.id, locationId: loc.id, qty: o.qty },
      });
      await tx.stockMove.create({ data: { variantId: v.id, locationId: loc.id, qty: o.qty - currentQty, motivo: "apertura", ref: "seed" } });
      log(`stock.set: ${o.sku}@${o.location}=${o.qty}`);
      return;
    }
    default: {
      const never: never = o;
      throw new Error(`op no implementada: ${JSON.stringify(never)}`);
    }
  }
}

export async function applyOps(tx: Tx, ops: Op[]): Promise<EngineResult> {
  const logs: string[] = [];
  const warns: string[] = [];
  const log = (s: string) => logs.push(s);
  const warn = (s: string) => warns.push(s);
  for (let i = 0; i < ops.length; i++) {
    try {
      await runOp(tx, ops[i], log, warn);
    } catch (e) {
      throw new Error(`ops[${i}] (${ops[i].op}): ${(e as Error).message}`);
    }
  }
  return { logs, warns };
}
