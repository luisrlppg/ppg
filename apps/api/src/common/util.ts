import type { TipoComponente, Uom } from "@ppg/shared";

export function dec(value: unknown): number {
  if (value === null || value === undefined) return 0;
  return typeof value === "number" ? value : Number(String(value));
}

export function isNumberOrStringNumber(v: unknown): v is number | string {
  return (
    (typeof v === "number" && Number.isFinite(v)) ||
    (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)))
  );
}

export function toUom(v: unknown): Uom {
  return v === "metro" ? "metro" : "pieza";
}

export function toTipoComponente(v: unknown): TipoComponente {
  return v === "consumible" ? "consumible" : "exacto";
}