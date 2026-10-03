/**
 * One-off: genera el PLAN de migración Odoo → PPG a partir de
 * `Product Variant (product.product).csv`. NO toca la base de datos.
 *
 * Enfoque: un producto por LÍNEA (Vástago, Taparrosca, Mango…). Cada familia
 * Odoo (`Vastago 1582`, `Tapa 1538`…) es un grupo de variantes; el código de
 * 4 dígitos = rosca (2) + altura (2).
 *
 * Uso:
 *   pnpm --filter @ppg/db exec tsx ../../scripts/odoo-migration-plan.ts
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const IN = process.argv[2] ?? join(ROOT, "scripts/odoo-data/Product Variant (product.product).csv");
const OUT = process.argv[3] ?? join(ROOT, "scripts/odoo-migration");

// ------------------------------------------------------------------ CSV
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQ = false;
      else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c !== "\r") field += c;
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}
function toCsv(rows: (string | number)[][]): string {
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  return "\uFEFF" + rows.map((r) => r.map(esc).join(",")).join("\r\n") + "\r\n";
}

// ------------------------------------------------------------- Normalización
function fixName(s: string): string {
  let out = s.replace(/\t/g, " ");
  if (out.includes("Ã")) { try { out = Buffer.from(out, "latin1").toString("utf8"); } catch { /* noop */ } }
  return out.replace(/\s+/g, " ").trim();
}

const ATTR_CANON: Record<string, string> = {
  rosca: "Tamaño rosca", diametro: "Tamaño rosca",
  ojo: "Agujero vastago", Ojo: "Agujero vastago",
  "color-vastago": "Color Vástago",
  "color-tapa": "Color tapa",
  "color de st": "Color Sobretapa",
  cerda: "Color de Cerda de Cepillo", "Color Cerda": "Color de Cerda de Cepillo",
  cepillo: "Forma del cepillo", Forma: "Forma del cepillo",
  vastago: "Altura vastago",
  tipo: "Tipo", Tipo: "Tipo",
  punta: "Punta", Punta: "Punta",
  Color: "Color", color: "Color",
  "diseno-vastago": "Versión del vástago", "Diseño": "Versión del vástago",
  largo: "Altura",
  tamano: "Tamaño (pulgadas)",
  "Tamaño": "Tamaño",
  pincel: "Medida pincel",
  Medidas: "Medidas",
  "Grosor Cerda": "Grosor cerda",
  material: "Material",
  Logo: "Logo",
  Cuello: "Cuello",
  operacion: "Operación",
  Ceja: "Ceja",
  Densidad: "Densidad",
  Estado: "Estado",
  "tipo-vastago": "Tipo vástago",
};

const BASURA = new Set(["na", "n/a", "rosa ???", "no aprobadp", "no aprobado", ""]);

const MERGE: Record<string, string> = {
  "tapa1540": "Sobretapa 1540",
  "CERDA": "Cerda", "cerda": "Cerda", "cerd": "Cerda",
  "Tapa Rebeca 13 (negro)": "Tapa Rebeca 13",
  "Pincel 1535 (normal)60": "Pincel 1535",
  "Sobretapa 1540 (blanco, normal, sin logo) Vastago 1582 negro nylon": "Sobretapa Con Vastago y Cepillo (SVC)",
  "sobretapa con vastago (1540 blanco normal": "Sobretapa Con Vastago",
  "sobretapa con vastago (1540 blanco normal sin logo) 1582 para pegar negro nylon": "Sobretapa Con Vastago y Cepillo (SVC)",
  "1080": "Botella 1080 Delineador",
  "1016": "Botella 1016",
};

const NO_MIGRAR = new Set([
  "Sobretapa Con Vastago",
  "C4",
  "Kit Juego de Delineador",
  "sobretapa con punta",
  "Tapa con Vastago Sin Rosca",
  "Tapa con Vastago Sin Rosca y Cepillo",
]);
const DESAGREGAR = new Set([
  "Vastago con Cepillo (VC)", "Vastago con Gloss", "Vastago con Punta (VP)",
  "Sobretapa Con Vastago y Cepillo (SVC)", "Sobretapa Con Vastago y Punta (SVP)",
]);

const SEED_SKU: Record<string, string> = {
  "Vástago": "VST", "Mango": "VAST", "Pincel": "PIN", "Taparrosca": "TPR",
  "Sobretapa": "STP", "Botella": "BOT", "Escurridor": "ESC",
  "Cepillo Nylon": "CNI", "Cepillo Silicon": "CSI", "Cerda": "CERD",
  "Delineador": "DPL", "Lip Gloss": "LGL", "Palillo": "", "Tapón": "",
  "Palillo Sin Cepillo": "P0014", "Palillo Citologico Sin Cepillo": "P0032",
  "Palillo con Cepillo": "P0033", "Palillo Citologico con Cepillo": "P0034",
};
const CAT: Record<string, string> = {
  "Vástago": "Vástagos", "Mango": "Mangos", "Pincel": "Pinceles", "Taparrosca": "Taparroscas",
  "Sobretapa": "Sobretapas", "Botella": "Botellas", "Escurridor": "Escurridores",
  "Cepillo Nylon": "Cepillos", "Cepillo Silicon": "Cepillos", "Cerda": "Cerda",
  "Delineador": "Puntas", "Lip Gloss": "Puntas", "Palillo": "Palillos", "Tapón": "Tapones",
  "Palillo Sin Cepillo": "Palillos", "Palillo Citologico Sin Cepillo": "Palillos",
  "Palillo con Cepillo": "Palillos", "Palillo Citologico con Cepillo": "Palillos",
};

const mm = (v: string) => `${parseInt(v, 10)}mm`;
const low = (v: string) => { const x = v.toLowerCase().trim(); return BASURA.has(x) ? "desconocido" : x; };
const normKey = (s: string) =>
  fixName(s)
    .toLowerCase()
    .replace(/\[[^\]]*\]/g, " ")       // quita prefijos [RM31]
    .replace(/[()"]/g, " ")
    .replace(/[^a-z0-9.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
const MM_ATTRS = new Set(["Tamaño rosca", "Altura vastago", "Altura tapa", "Altura"]);
function normVal(canon: string, value: string): string {
  const v = value.toLowerCase().trim();
  if (BASURA.has(v)) return "desconocido";
  if (MM_ATTRS.has(canon) && /^\d+(\.\d+)?$/.test(v)) return `${v}mm`;
  return v;
}

interface Classified { producto: string; skuBase: string; categoria: string; derived: { canon: string; value: string }[]; accion: string; }

function classify(rawName: string): Classified {
  const name = fixName(rawName);
  if (/^(pe|pp|pvc)\b/i.test(name)) {
    return { producto: /^pvc/i.test(name) ? "Pigmento PVC" : "Pigmento PP/PE", skuBase: "", categoria: "Pigmentos", derived: [], accion: "diferido" };
  }

  const merged = MERGE[name] ?? name;
  if (NO_MIGRAR.has(merged)) return { producto: "", skuBase: "", categoria: "", derived: [], accion: "no_migrar" };
  if (DESAGREGAR.has(merged)) return { producto: "", skuBase: "", categoria: "", derived: [], accion: "desagregar" };

  const mk = (producto: string, derived: { canon: string; value: string }[] = []): Classified =>
    ({ producto, skuBase: SEED_SKU[producto] ?? "", categoria: CAT[producto] ?? "Otros", derived, accion: "producto" });
  const codeLine = (producto: string, code: string, alturaCanon: string, extra?: string) => {
    const d = [{ canon: "Tamaño rosca", value: mm(code.slice(0, 2)) }, { canon: alturaCanon, value: mm(code.slice(2)) }];
    if (extra) d.push({ canon: "Tipo", value: low(extra) });
    return mk(producto, d);
  };

  if (merged === "Mango Pelikan") return mk("Mango", [{ canon: "Tipo", value: "pelikan" }]);
  if (merged === "Pincel Pelikan") return mk("Pincel", [{ canon: "Tipo", value: "pelikan" }]);

  let m: RegExpMatchArray | null;
  if ((m = merged.match(/^Vastago\s+(\d{4})(?:\s+(.*))?$/))) return codeLine("Vástago", m[1], "Altura vastago", m[2]);
  if ((m = merged.match(/^Tapa\s+(\d{4})(?:\s+(.*))?$/))) return codeLine("Taparrosca", m[1], "Altura tapa", m[2]);
  if ((m = merged.match(/^Tapa Rebeca\s+(\d{2})$/)))
    return mk("Taparrosca", [{ canon: "Tamaño rosca", value: mm(m[1]) }, { canon: "Forma tapa", value: "rebeca" }]);
  if ((m = merged.match(/^Mango\s+(\d{4})(?:\s+(.*))?$/))) return codeLine("Mango", m[1], "Altura vastago", m[2]);
  if ((m = merged.match(/^Pincel\s+(\d{4})(?:\s+(.*))?$/))) return codeLine("Pincel", m[1], "Altura vastago", m[2]);
  if ((m = merged.match(/^Sobretapa\s+(\d{4})(?:\s+(.*))?$/))) return codeLine("Sobretapa", m[1], "Altura", m[2]);
  if ((m = merged.match(/^Botella\s+(\d{4})(?:\s+(.*))?$/))) return codeLine("Botella", m[1], "Altura", m[2]);
  if ((m = merged.match(/^Escurridor\s+(\d{4})(?:\s+(.*))?$/))) return codeLine("Escurridor", m[1], "Altura", m[2]);
  if (/^Etiquetas\b/i.test(merged)) return mk("Etiquetas");
  if (/^Cepillo\b/.test(merged)) {
    const prod = /silicon/i.test(merged) ? "Cepillo Silicon" : "Cepillo Nylon";
    return mk(prod); // material implícito en el producto; sin eje "Material"
  }
  if (/^Palillo con Cepillo Citolog/i.test(merged)) return mk("Palillo Citologico con Cepillo");
  if (/^Palillo con Cepillo/i.test(merged)) return mk("Palillo con Cepillo");
  if (/^Palillo Citologico/i.test(merged)) return mk("Palillo Citologico Sin Cepillo", [{ canon: "Color de Palillo Citologico", value: "blanco" }]);
  if (/^Palillo\b/.test(merged)) return mk("Palillo Sin Cepillo");
  if (/^Tapon\b/.test(merged)) return mk("Tapón");
  if (/^Cerda\b/i.test(merged) || /cerda/i.test(merged)) {
    const g = merged.match(/\(([^)]+)\)/);
    const derived = g ? [{ canon: "Grosor cerda", value: low(g[1]) }] : [];
    return mk("Cerda", derived);
  }

  // Línea propia (Tapa con Pincel, Tapa con Vastago Sin Rosca, Bolsa, Alambre, etc.)
  return { producto: merged, skuBase: "", categoria: categoriaPropia(merged), derived: [], accion: "producto" };
}

function categoriaPropia(name: string): string {
  const w = name.split(/[\s(]+/)[0].toLowerCase();
  const m: Record<string, string> = {
    tapa: "Taparroscas", sobretapa: "Sobretapas", botella: "Botellas", bolsa: "Empaques",
    caja: "Empaques", alambre: "Alambre", grapas: "Otros", fleje: "Otros", pulcera: "Otros",
    esterato: "Otros", opresor: "Otros", galleta: "Otros", kit: "Kits", polietileno: "Otros",
    c4: "Otros", punta: "Puntas",
  };
  return m[w] ?? "Otros";
}

// ------------------------------------------------------------------- Parse
const rows = parseCsv(readFileSync(IN, "utf8"));
const H = rows[0];
const iName = H.indexOf("Name");
const iUom = H.indexOf("Unit of Measure");
const iVV = H.indexOf("Variant Values");
const iQoh = H.indexOf("Quantity On Hand");
if (iName < 0 || iVV < 0) throw new Error("CSV inesperado");

interface Variante { name: string; uom: string; qoh: number; attrs: { raw: string; value: string }[]; }
const variantes: Variante[] = [];
const negativos: (string | number)[][] = [["productoOdoo", "uom", "cantidadOnHand"]];
let cur: Variante | null = null;
for (const r of rows.slice(1)) {
  if ((r[iName] ?? "").trim()) {
    const qoh = Number((r[iQoh] ?? "0").trim()) || 0;
    cur = { name: fixName(r[iName]), uom: (r[iUom] ?? "Units").trim(), qoh, attrs: [] };
    variantes.push(cur);
    if (qoh < 0) negativos.push([cur.name, cur.uom, qoh]);
  }
  const vv = (r[iVV] ?? "").trim();
  if (vv && cur && vv.includes(":")) {
    const [a, b] = vv.split(/:(.+)/);
    cur.attrs.push({ raw: a.trim(), value: b.trim() });
  }
}

// Nombres de atributo por familia (en orden), para interpretar `Quants.Product`.
const familyAttrNames = new Map<string, string[]>();
for (const v of variantes) {
  if (v.attrs.length > 0 && !familyAttrNames.has(v.name)) familyAttrNames.set(v.name, v.attrs.map((a) => a.raw));
}

// ------------------------------------------------------- Agrupar por producto
interface Producto { producto: string; skuBase: string; categoria: string; uom: string; ejes: Set<string>; variantes: { name: string; all: { canon: string; value: string }[]; rawVals: string[]; qty: number }[]; }
const productos = new Map<string, Producto>();
const mapping: (string | number)[][] = [["plantillaOdoo", "destino", "accion"]];
const pendientes: (string | number)[][] = [["tipo", "plantilla", "detalle"]];
const vistos = new Set<string>();

for (const v of variantes) {
  const c = classify(v.name);
  if (!vistos.has(v.name)) {
    vistos.add(v.name);
    mapping.push([v.name, c.producto, c.accion]);
  }
  if (c.accion !== "producto") continue;

  let p = productos.get(c.producto);
  if (!p) {
    const uom = c.producto === "Cerda" ? "kg" : v.uom;
    p = { producto: c.producto, skuBase: c.skuBase, categoria: c.categoria, uom, ejes: new Set(), variantes: [] };
    productos.set(c.producto, p);
  }
  const all = [
    ...c.derived,
    ...v.attrs
      .map((a) => { const canon = ATTR_CANON[a.raw] ?? a.raw; return { canon, value: normVal(canon, a.value) }; })
      // Los cepillos ya no usan Estado ni Medidas en PPG (ver reorg-cepillos.ts /
      // reconcile-stock.ts): se ignoran aquí para no reintroducirlos.
      .filter((a) => !((c.producto === "Cepillo Nylon" || c.producto === "Cepillo Silicon") && (a.canon === "Estado" || a.canon === "Medidas"))),
  ];
  for (const a of all) p.ejes.add(a.canon);
  p.variantes.push({ name: v.name, all, rawVals: v.attrs.map((a) => a.value), qty: v.qoh });
}
pendientes.push(["manual", "sobretapa con punta", "revisar: ¿SVP/TVP o descartar?"]);
pendientes.push(["manual", "unificar", "revisar negativos/pigmentos y confirmar desagregar VC/VP/SVC/SVP"]);

// Orden + sku
const prodList = [...productos.values()].sort((a, b) => a.producto.localeCompare(b.producto));
let seq = 0;
const prodRows: (string | number)[][] = [["skuBase", "producto", "categoria", "uom", "hasVariants", "numVariantes", "numVariantesConStock", "ejes"]];
const extraProducts: string[] = [];
const varRows: (string | number)[][] = [["sku", "producto", "uom", "atributos", "familiaOdoo", "qty"]];
const attrMap = new Map<string, Set<string>>();
const displayToSku = new Map<string, string>();
const familyToSku = new Map<string, string>();

for (const p of prodList) {
  let skuBase = p.skuBase;
  if (!skuBase) { seq++; skuBase = `P${String(seq).padStart(4, "0")}`; }
  if (p.producto === "Cepillo Silicon") p.ejes.add("Color"); // eje manual (sin valores en Odoo)
  const ejes = [...p.ejes].sort();
  const conStock = p.variantes.filter((v) => v.qty !== 0); // incluye la negativa (qty 0 tras clamp)
  const nConStock = p.variantes.filter((v) => v.qty > 0).length;
  const uom = p.uom === "kg" ? "kg" : "pieza";
  prodRows.push([skuBase, p.producto, p.categoria, uom, ejes.length > 0 ? "true" : "false", p.variantes.length, nConStock, ejes.join(" | ")]);
  conStock.sort((a, b) => a.name.localeCompare(b.name));
  let vi = 0;
  for (const v of conStock) {
    vi++;
    const sku = `${skuBase}-${String(vi).padStart(4, "0")}`;
    const at = v.all.map((a) => `${a.canon}: ${a.value}`).join(" | ");
    varRows.push([sku, p.producto, uom, at, v.name, Math.max(0, v.qty)]);
    const display = v.rawVals.length ? `${v.name} (${v.rawVals.join(", ")})` : v.name;
    displayToSku.set(normKey(display), sku);
    if (!familyToSku.has(normKey(v.name))) familyToSku.set(normKey(v.name), sku);
    for (const a of v.all) {
      if (!BASURA.has(a.value) && a.value !== "desconocido") {
        if (!attrMap.has(a.canon)) attrMap.set(a.canon, new Set());
        attrMap.get(a.canon)!.add(a.value);
      }
    }
  }
}

const attrRows: (string | number)[][] = [["atributo", "numValores", "valores"]];
for (const [k, vals] of [...attrMap.entries()].sort()) attrRows.push([k, vals.size, [...vals].sort().join(" | ")]);

// ------------------------------------------------------------------- Stock
const QUANTS = join(OUT, "Quants.csv");
const ubicaciones = new Set<string>();
const stockRows: (string | number)[][] = [["sku", "producto", "ubicacion", "uom", "cantidad"]];
const desRows: (string | number)[][] = [["ubicacion", "origen", "componente", "atributos", "cantidad", "uom"]];
const noMigRows: (string | number)[][] = [["productoOdoo", "ubicacion", "cantidad", "uom"]];
const stockPend: (string | number)[][] = [["tipo", "producto", "detalle"]];

if (existsSync(QUANTS)) {
  const qrows = parseCsv(readFileSync(QUANTS, "utf8"));
  const qh = qrows[0];
  const iLoc = qh.indexOf("Location"), iProd = qh.indexOf("Product"), iQty = qh.indexOf("Quantity"), iUom = qh.indexOf("Unit of Measure");
  const familyList = [...familyAttrNames.keys()].sort((a, b) => b.length - a.length);

  // Nombres de Quants que no existen como familia en product.product → destino.
  // Nombres de Quants que no existen como familia en product.product → destino.
  const OVERRIDES = new Map<string, string>([
    [normKey("Etiquetas Recicladas"), "Etiquetas"],
  ]);
  const mapUbic = (loc: string): string | null => {
    if (loc === "Physical Locations/Subcontracting Location") return null;
    if (loc.startsWith("PPG/Oficina/")) return null; // oficina: no migrar
    if (loc === "PPG/Almacen") return "Principal";
    if (loc.startsWith("PPG/Almacen/")) {
      const resto = loc.slice("PPG/Almacen/".length);
      if (resto === "Embarque") return "Embarque";
      if (resto === "Revision") return "Revisión";
      if (resto === "Piso De Almacen") return "Piso de almacén";
      return resto; // letra+número (A1, B2, PIG1, …)
    }
    return loc;
  };
  const parseQuant = (prod: string): { family: string; attrs: Record<string, string> } => {
    const norm = fixName(prod);
    for (const f of familyList) {
      if (norm === f) return { family: f, attrs: {} };
      if (norm.startsWith(f + " (")) {
        const inner = norm.slice(f.length + 2).replace(/\)\s*$/, "");
        const vals = inner.split(",").map((s) => s.trim());
        const names = familyAttrNames.get(f) ?? [];
        const attrs: Record<string, string> = {};
        vals.forEach((val, i) => { if (names[i]) attrs[names[i]] = val; });
        return { family: f, attrs };
      }
    }
    return { family: norm, attrs: {} };
  };
  const canonName = (raw: string) => ATTR_CANON[raw] ?? raw;
  const pairs = (obj: Record<string, string>) =>
    Object.entries(obj)
      .filter(([, v]) => v !== undefined && v !== "")
      .map(([k, v]) => `${canonName(k)}: ${normVal(canonName(k), v)}`)
      .join(" | ");
  const desagregar = (family: string, a: Record<string, string>): { producto: string; attrs: string }[] => {
    const vastago = () => ({ producto: "Vástago", attrs: pairs({ diametro: a.diametro, vastago: a.vastago, "color-vastago": a["color-vastago"], "tipo-vastago": a["tipo-vastago"], "diseno-vastago": a["diseno-vastago"] }) });
    const sobretapa = () => ({ producto: "Sobretapa", attrs: pairs({ diametro: a.diametro, largo: a.largo, "color de st": a["color de st"], tipo: a.tipo, Logo: a.Logo }) });
    const cepillo = (material: string) => ({ producto: /silicon/i.test(material) ? "Cepillo Silicon" : "Cepillo Nylon", attrs: pairs({ cepillo: a.cepillo, cerda: a.cerda, tamano: a.tamano }) });
    const punta = () => {
      const v = (a.punta ?? a.Punta ?? "").toLowerCase();
      if (v.includes("delineador")) return { producto: "Punta Delineador", attrs: `Tipo: ${v}` };
      if (v.includes("gloss")) return { producto: "Punta Lip Gloss", attrs: `Tipo: ${v}` };
      if (v.includes("nylon") || v.includes("silicon")) return cepillo(v);
      return { producto: "?", attrs: `Punta: ${v}` };
    };
    if (/Vastago con Cepillo/i.test(family)) return [vastago(), cepillo(a.material ?? "")];
    if (/Vastago con Gloss/i.test(family)) return [vastago(), { producto: "Punta Lip Gloss", attrs: "Tipo: gloss" }];
    if (/Vastago con Punta/i.test(family)) return [vastago(), punta()];
    if (/SVC/.test(family)) return [sobretapa(), vastago(), cepillo(a.material ?? "")];
    if (/SVP/.test(family)) return [sobretapa(), vastago(), punta()];
    return [];
  };

  for (const r of qrows.slice(1)) {
    if ((r[iProd] ?? "").trim() === "") continue;
    const prod = r[iProd], loc = r[iLoc] ?? "", qty = Number(r[iQty] ?? 0) || 0, uom = r[iUom] ?? "";
    const ub = mapUbic(loc);
    if (ub) ubicaciones.add(ub);
    const { family, attrs } = parseQuant(prod);
    const ov = OVERRIDES.get(normKey(prod));
    if (ov) {
      if (ub) {
        const sku = familyToSku.get(normKey(ov)) ?? `EXTRA:${ov}`;
        stockRows.push([sku, ov, ub, uom === "kg" ? "kg" : "pieza", Math.max(0, qty)]);
        extraProducts.push(ov);
      }
      continue;
    }
    const cls = classify(family);
    if (cls.accion === "no_migrar") { noMigRows.push([prod, ub ?? loc, qty, uom]); continue; }
    if (cls.accion === "diferido") { stockPend.push(["pigmento", prod, String(qty)]); continue; }
    if (cls.accion === "desagregar") {
      for (const c of desagregar(family, attrs)) desRows.push([ub ?? loc, family, c.producto, c.attrs, Math.max(0, qty), uom === "kg" ? "kg" : "pieza"]);
      continue;
    }
    const sku = ub ? displayToSku.get(normKey(prod)) ?? (cls.producto === "Punta Lip Gloss" || cls.producto === "Punta Delineador" ? familyToSku.get(normKey(family)) : undefined) : undefined;
    if (sku) stockRows.push([sku, cls.producto, ub!, uom === "kg" ? "kg" : "pieza", Math.max(0, qty)]);
    else stockPend.push(["sin_match", prod, `${qty} ${uom}`]);
  }
}

// ------------------------------------------------------------------ Salida
mkdirSync(OUT, { recursive: true });
const w = (f: string, csv: string) => writeFileSync(join(OUT, f), csv, "utf8");
// Productos que solo existen en Quants (sin familia en product.product): Etiquetas, etc.
const extraSku = new Map<string, string>();
for (const nombre of [...new Set(extraProducts)].sort()) {
  if (prodList.some((p) => p.producto === nombre)) continue;
  seq++;
  const sku = `P${String(seq).padStart(4, "0")}`;
  extraSku.set(nombre, sku);
  prodRows.push([sku, nombre, "Otros", "pieza", "false", 0, 1, ""]);
}
for (const row of stockRows) {
  const s = String(row[0]);
  if (s.startsWith("EXTRA:")) row[0] = extraSku.get(s.slice(6)) ?? "";
}

w("atributos.csv", toCsv(attrRows));
w("productos.csv", toCsv(prodRows));
w("variantes.csv", toCsv(varRows));
const mapRows: (string | number)[][] = [
  ["plantillaOdoo", "destino", "accion"],
  ...mapping.slice(1).sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
];
w("mapping-odoo.csv", toCsv(mapRows));
w("negativos.csv", toCsv(negativos));
w("pendientes.csv", toCsv(pendientes));
if (existsSync(QUANTS)) {
  w("ubicaciones.csv", toCsv([["ubicacion"], ...[...ubicaciones].sort().map((u) => [u])]));
  w("stock.csv", toCsv(stockRows));
  w("desagregado.csv", toCsv(desRows));
  w("no-migrar-stock.csv", toCsv(noMigRows));
  w("stock-pendientes.csv", toCsv(stockPend));
}

console.log("Plan generado en", OUT);
console.log("variantes Odoo:", variantes.length);
console.log("productos (líneas):", prodList.length);
console.log("atributos:", attrMap.size);
if (existsSync(QUANTS)) {
  console.log("ubicaciones:", ubicaciones.size);
  console.log("stock.csv filas:", stockRows.length - 1);
  console.log("desagregado.csv filas:", desRows.length - 1);
  console.log("no-migrar-stock filas:", noMigRows.length - 1);
  console.log("stock-pendientes filas:", stockPend.length - 1);
}
