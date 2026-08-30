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