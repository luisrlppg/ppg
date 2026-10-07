import type { SeccionReporte, TipoLineaReporte, Turno } from "@/lib/types";

export type TurnoCaptura = Extract<Turno, "matutino" | "vespertino">;
export type Maquina = Extract<SeccionReporte, "maquina1" | "maquina2" | "maquina3">;
export type SeccionInformativa = Extract<SeccionReporte, "ensamble" | "pegado" | "perforado">;
export type Fase = "setup" | "captura" | "ensartado" | "informativas";

export const TURNOS: { value: TurnoCaptura; label: string }[] = [
  { value: "matutino", label: "Matutino" },
  { value: "vespertino", label: "Vespertino" },
];

export const HORAS_TURNO: Record<TurnoCaptura, number> = {
  matutino: 8,
  vespertino: 7.5,
};

export const MAQUINAS: { value: Maquina; label: string }[] = [
  { value: "maquina1", label: "Máquina 1" },
  { value: "maquina2", label: "Máquina 2" },
  { value: "maquina3", label: "Máquina 3" },
];

export const SECCIONES_INFORMATIVAS: { value: SeccionInformativa; label: string }[] = [
  { value: "ensamble", label: "Ensamble" },
  { value: "pegado", label: "Pegado" },
  { value: "perforado", label: "Perforado" },
];

export function hoy(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function turnoPorHora(): TurnoCaptura {
  return new Date().getHours() < 14 ? "matutino" : "vespertino";
}

export interface LineaForm {
  key: string;
  variantId: number;
  sku: string;
  nombre: string;
  producto: string;
  uom: string;
  seccion: SeccionReporte;
  tipo: TipoLineaReporte;
  cantidad: string;
  forma: string;
  color: string;
}

export interface EnsartadoForm {
  key: string;
  pincelVariantId: number;
  pincelSku: string;
  pincelNombre: string;
  mangoVariantId: number;
  mango: string;
  colorId: number;
  color: string;
  cantidad: string;
}

export interface InformativaForm {
  key: string;
  seccion: SeccionInformativa;
  producto: string;
  cantidad: string;
}

export interface LineaExtra {
  variantId?: number;
  productoTexto?: string;
  seccion: string;
  tipo: string;
  ok: number;
}

export interface EntradasGuardar {
  variantId: number;
  seccion: SeccionReporte;
  tipo: TipoLineaReporte;
  ok: number;
}
