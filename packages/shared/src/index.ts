export const ROLES = ["admin", "operador"] as const;
export type Role = (typeof ROLES)[number];

export const SEPARADORES_MILES = ["espacio", "coma"] as const;
export type SeparadorMiles = (typeof SEPARADORES_MILES)[number];

export interface PublicUser {
  id: number;
  username: string;
  nombre: string;
  role: Role;
  separadorMiles: SeparadorMiles;
}

export interface LoginResponse {
  user: PublicUser;
}

export interface MeResponse {
  user: PublicUser;
}

export const HOME_BY_ROLE: Record<Role, string> = {
  operador: "Tu reporte de producción",
  admin: "Panel de control",
};

// --- Catálogos / inventario (E1) ---

export const MOTIVOS_STOCK = [
  "apertura",
  "entrada",
  "salida",
  "ajuste",
  "ensamble",
  "transferencia",
  "despacho",
  "produccion",
  "consumo",
] as const;
export type MotivoStock = (typeof MOTIVOS_STOCK)[number];

export const TIPOS_COMPONENTE = ["exacto", "consumible"] as const;
export type TipoComponente = (typeof TIPOS_COMPONENTE)[number];

export const UOMS = ["pieza", "metro"] as const;
export type Uom = (typeof UOMS)[number];

export const TIPOS_UBICACION = ["almacen", "temporal"] as const;
export type TipoUbicacion = (typeof TIPOS_UBICACION)[number];

export const CAMPOS_PRECIO = ["base", "variante"] as const;

export const MONITOR_CHANNELS = ["email", "telegram", "callmebot"] as const;
export type MonitorChannel = (typeof MONITOR_CHANNELS)[number];

// --- Formato de cantidades ---

const qtyFmt = new Intl.NumberFormat("en-US", { maximumFractionDigits: 3 });

/**
 * Formatea una cantidad con separador de miles y punto decimal.
 * `1234.5` → `"1,234.5"` (coma) o `"1 234.5"` (espacio). "—" para nulos/vacíos.
 */
export function formatCantidad(
  valor: number | string | null | undefined,
  separador: SeparadorMiles = "coma",
): string {
  if (valor === null || valor === undefined || valor === "") return "—";
  const n = typeof valor === "number" ? valor : Number(valor);
  if (!Number.isFinite(n)) return String(valor);
  const texto = qtyFmt.format(n);
  return separador === "espacio" ? texto.replace(/,/g, "\u00A0") : texto;
}