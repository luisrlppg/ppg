import { api } from "./api";
import type { Passo, SeleccionPaso } from "./types";

/**
 * Caché corta (30s) de los pasos guiados por productId.
 * Evita re-fetch al reabrir el modal de ventas o navegar entre productos
 * con el mismo ítem; mantiene frescas las opciones/stock razonablemente.
 */
const TTL = 30_000;
const cache = new Map<number, { ts: number; data: Passo[] }>();

/** Pasos sin filtro de selección (opciones completas de cada componente). */
export async function getPasosCached(productId: number): Promise<Passo[]> {
  const hit = cache.get(productId);
  if (hit && Date.now() - hit.ts < TTL) return hit.data;
  const data = await api<Passo[]>(`/public/productos/${productId}/pasos`);
  cache.set(productId, { ts: Date.now(), data });
  return data;
}

/**
 * Pasos filtrados por la selección actual (cascada server-side, ej. rosca).
 * No se cachea: depende de la selección.
 */
export async function getPasosConSeleccion(productId: number, seleccion: SeleccionPaso[]): Promise<Passo[]> {
  if (seleccion.length === 0) return getPasosCached(productId);
  return api<Passo[]>(`/public/productos/${productId}/pasos`, {
    method: "POST",
    body: JSON.stringify({ seleccion }),
  });
}
