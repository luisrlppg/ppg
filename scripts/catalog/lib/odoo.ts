import { readFileSync } from "node:fs";

export interface CrosswalkRow {
  sku: string;
  producto: string;
  uom: string;
  familiaOdoo: string;
  attrs: Record<string, string>;
  stockMin: number;
  stockMax: number;
  origen: string;
}

export function parseCsv(text: string): string[][] {
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
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function parseAttrs(s: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of s.split("|")) {
    const t = part.trim();
    if (!t || !t.includes(":")) continue;
    const i = t.indexOf(":");
    out[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return out;
}

export function readCrosswalk(path: string): CrosswalkRow[] {
  const rows = parseCsv(readFileSync(path, "utf8").replace(/^\uFEFF/, ""));
  const H = rows[0];
  const iS = H.indexOf("sku"), iP = H.indexOf("producto"), iU = H.indexOf("uom"), iF = H.indexOf("familiaOdoo");
  const iA = H.indexOf("atributos"), iMin = H.indexOf("stockMin"), iMax = H.indexOf("stockMax"), iOr = H.indexOf("origen");
  return rows.slice(1).filter((r) => (r[iS] ?? "").trim()).map((r) => ({
    sku: (r[iS] ?? "").trim(),
    producto: (r[iP] ?? "").trim(),
    uom: (r[iU] ?? "").trim(),
    familiaOdoo: (r[iF] ?? "").trim(),
    attrs: parseAttrs(r[iA] ?? ""),
    stockMin: Number(r[iMin] ?? 0) || 0,
    stockMax: Number(r[iMax] ?? 0) || 0,
    origen: (r[iOr] ?? "").trim(),
  }));
}
