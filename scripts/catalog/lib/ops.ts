import { readFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";

export type Op =
  | { op: "attr.ensure"; name: string; values?: string[] }
  | { op: "attr.rename"; from: string; to: string }
  | { op: "attr.delete"; name: string; cascade?: boolean }
  | { op: "attr.merge"; from: string; into: string; prefer?: "origin" | "target" }
  | { op: "attr.assignAxis"; product: string; attribute: string; sortOrder?: number }
  | { op: "attr.unassignAxis"; product: string; attribute: string }
  | { op: "attr.restrictValues"; product: string; attribute: string; values: string[] }
  | { op: "attr.splitByProduct"; from: string; into: Record<string, string>; values?: string[] }
  | { op: "value.add"; attribute: string; value: string }
  | { op: "value.rename"; attribute: string; from: string; to: string }
  | { op: "value.delete"; attribute: string; value: string; cascade?: boolean }
  | { op: "value.merge"; attribute: string; from: string; into: string }
  | { op: "value.remap"; fromAttr: string; fromValue: string; toAttr: string; toValue: string }
  | { op: "variant.set"; sku: string; attribute: string; value: string }
  | { op: "variant.clear"; sku: string; attribute: string }
  | { op: "variant.create"; product: string; sku: string; nombre?: string; attrs: Record<string, string> }
  | { op: "variant.copy"; from: string; sku: string; overrides?: Record<string, string> }
  | { op: "variant.deriveFrom"; target: string; source: string; on: string[]; inherit: string[] }
  | { op: "variant.delete"; sku: string; allowStock?: boolean }
  | { op: "step.repoint"; product: string; fromAttribute: string; toAttribute: string };

export interface OpsFile {
  version: number;
  name: string;
  description?: string;
  ops: Op[];
}

const REQUIRED: Record<string, string[]> = {
  "attr.ensure": ["name"],
  "attr.rename": ["from", "to"],
  "attr.delete": ["name"],
  "attr.merge": ["from", "into"],
  "attr.assignAxis": ["product", "attribute"],
  "attr.unassignAxis": ["product", "attribute"],
  "attr.restrictValues": ["product", "attribute", "values"],
  "attr.splitByProduct": ["from", "into"],
  "value.add": ["attribute", "value"],
  "value.rename": ["attribute", "from", "to"],
  "value.delete": ["attribute", "value"],
  "value.merge": ["attribute", "from", "into"],
  "value.remap": ["fromAttr", "fromValue", "toAttr", "toValue"],
  "variant.set": ["sku", "attribute", "value"],
  "variant.clear": ["sku", "attribute"],
  "variant.create": ["product", "sku", "attrs"],
  "variant.copy": ["from", "sku"],
  "variant.deriveFrom": ["target", "source", "on", "inherit"],
  "variant.delete": ["sku"],
  "step.repoint": ["product", "fromAttribute", "toAttribute"],
};

export function loadOpsFile(path: string): OpsFile {
  let raw: unknown;
  try {
    raw = parseYaml(readFileSync(path, "utf8"));
  } catch (e) {
    throw new Error(`No se pudo leer/parsear "${path}": ${(e as Error).message}`);
  }
  if (!raw || typeof raw !== "object") throw new Error(`"${path}" no contiene un YAML válido`);
  const f = raw as Record<string, unknown>;
  if (f.version !== 1) throw new Error(`version debe ser 1 (recibido: ${String(f.version)})`);
  if (typeof f.name !== "string" || !f.name.trim()) throw new Error("falta el campo name");
  if (!Array.isArray(f.ops) || f.ops.length === 0) throw new Error("ops debe ser una lista con al menos una operación");
  f.ops.forEach((o, i) => validateOp(o, i));
  return { version: 1, name: f.name, description: f.description as string | undefined, ops: f.ops as Op[] };
}

function validateOp(o: unknown, idx: number): asserts o is Op {
  const at = `ops[${idx}]`;
  if (!o || typeof o !== "object") throw new Error(`${at}: no es un objeto`);
  const op = (o as Record<string, unknown>).op;
  if (typeof op !== "string" || !REQUIRED[op]) throw new Error(`${at}: operación desconocida "${String(op)}"`);
  for (const field of REQUIRED[op]) {
    const v = (o as Record<string, unknown>)[field];
    if (v === undefined || v === null || v === "") throw new Error(`${at} (${op}): falta "${field}"`);
  }
}
