export const ROLES = ["admin", "supervisor", "operador"] as const;
export type Role = (typeof ROLES)[number];

export interface PublicUser {
  id: number;
  username: string;
  nombre: string;
  role: Role;
}

export interface LoginResponse {
  user: PublicUser;
}

export interface MeResponse {
  user: PublicUser;
}

export const HOME_BY_ROLE: Record<Role, string> = {
  operador: "Tu reporte de producción",
  supervisor: "Bandeja de pendientes de inventario",
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