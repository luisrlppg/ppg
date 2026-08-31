export const TURNOS = ["matutino", "vespertino", "nocturno"] as const;
export type Turno = (typeof TURNOS)[number];

export const SECCIONES = ["maquina1", "maquina2", "maquina3", "ensamble", "ensartado", "pegado", "perforado"] as const;
export type Seccion = (typeof SECCIONES)[number];

export const HORAS_TURNO: Record<Turno, number> = {
  matutino: 8,
  vespertino: 7.5,
  nocturno: 8,
};
