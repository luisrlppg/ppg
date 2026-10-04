import { api } from "./api";
import type { Passo, ResolucionVariante, SeleccionPaso } from "./types";

/**
 * Lógica compartida del wizard de configuración (tienda + modal de ventas).
 *
 * Modelo B: cada paso saca sus opciones de las variantes activas de su
 * componente. El servidor filtra por compatibilidad (ejes compartidos, p. ej.
 * rosca) contra la selección previa. `panel` agrupa pasos que se muestran juntos.
 */

export interface Panel {
  pasos: number[];
}

/** Agrupa los pasos por `panel` (los paneles se numeran 1..N y agrupan pasos contiguos). */
export function buildPaneles(passos: Passo[]): Panel[] {
  const byPanel = new Map<number, number[]>();
  passos.forEach((p, i) => {
    const arr = byPanel.get(p.panel) ?? [];
    arr.push(i);
    byPanel.set(p.panel, arr);
  });
  return [...byPanel.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, pasos]) => ({ pasos }));
}

export function esPanelResuelto(panel: Panel, selecciones: Record<number, number | undefined>): boolean {
  return panel.pasos.every((i) => selecciones[i] !== undefined);
}

/** Selección actual como vector {attributeId, valueId} para el resolver del servidor. */
export function seleccionActual(passos: Passo[], selecciones: Record<number, number | undefined>): SeleccionPaso[] {
  const out: SeleccionPaso[] = [];
  passos.forEach((p, i) => {
    const valueId = selecciones[i];
    if (valueId !== undefined) out.push({ attributeId: p.attributeId, valueId });
  });
  return out;
}

/** Selección confirmada hasta el paso `hastaIdx` inclusive (para pedir opciones al avanzar). */
export function seleccionHasta(
  passos: Passo[],
  selecciones: Record<number, number | undefined>,
  hastaIdx: number,
): SeleccionPaso[] {
  const out: SeleccionPaso[] = [];
  passos.forEach((p, i) => {
    if (i > hastaIdx) return;
    const valueId = selecciones[i];
    if (valueId !== undefined) out.push({ attributeId: p.attributeId, valueId });
  });
  return out;
}

/**
 * Selección de los pasos ANTERIORES al panel que empieza en `primerIdxPanel`.
 * Es la que se envía al servidor para que el paso a mostrar traiga TODAS sus
 * opciones (sin filtrarse por su propia elección).
 */
export function seleccionAntesDe(
  passos: Passo[],
  selecciones: Record<number, number | undefined>,
  primerIdxPanel: number,
): SeleccionPaso[] {
  return seleccionHasta(passos, selecciones, primerIdxPanel - 1);
}

/**
 * Copia de `selecciones` donde cada paso del panel sin elegir toma su opción
 * resaltada (la primera). Se usa al pulsar "Siguiente" para aceptar la sugerida.
 */
export function seleccionResaltadaDe(
  passos: Passo[],
  selecciones: Record<number, number | undefined>,
  panel: Panel,
): Record<number, number | undefined> {
  const next = { ...selecciones };
  for (const i of panel.pasos) {
    if (next[i] !== undefined) continue;
    const opt = passos[i]?.opciones[0];
    if (opt) next[i] = opt.valueId;
  }
  return next;
}

export function resolver(
  productId: number,
  passos: Passo[],
  selecciones: Record<number, number | undefined>,
  crear: boolean,
): Promise<ResolucionVariante> {
  return api<ResolucionVariante>(`/public/productos/${productId}/resolver`, {
    method: "POST",
    body: JSON.stringify({ seleccion: seleccionActual(passos, selecciones), crear }),
  });
}

/**
 * Limpia en silencio las selecciones que dejaron de ser válidas tras recargar
 * opciones por la cascada. Solo desde `desdeIdx` en adelante: los pasos en curso
 * y anteriores no se tocan. NO preselecciona: la elección la hace el usuario.
 */
export function limpiarSeleccionesInvalidas(
  passos: Passo[],
  selecciones: Record<number, number | undefined>,
  desdeIdx = 0,
): { next: Record<number, number | undefined>; changed: boolean } {
  let changed = false;
  const next = { ...selecciones };
  passos.forEach((p, i) => {
    if (i < desdeIdx) return;
    const actual = next[i];
    if (actual !== undefined && !p.opciones.some((o) => o.valueId === actual)) {
      delete next[i];
      changed = true;
    }
  });
  return { next, changed };
}

/** Índice de la opción "resaltada" del paso cuando aún no hay selección (primera). */
export function opcionResaltada(paso: Passo | undefined, seleccion: number | undefined): number | undefined {
  if (!paso || seleccion !== undefined) return undefined;
  return paso.opciones[0]?.valueId;
}
