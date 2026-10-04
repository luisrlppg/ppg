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

/** Auto-selecciona un paso cuando solo queda una opción posible. */
export function autoSeleccionar(
  passos: Passo[],
  selecciones: Record<number, number | undefined>,
): { next: Record<number, number | undefined>; changed: boolean } {
  let changed = false;
  const next = { ...selecciones };
  passos.forEach((p, i) => {
    if (next[i] !== undefined) return;
    if (p.opciones.length === 1) {
      next[i] = p.opciones[0].valueId;
      changed = true;
    }
  });
  return { next, changed };
}
