import { api } from "./api";
import type { Passo } from "./types";

/**
 * Caché corta (30s) de los pasos guiados por productId.
 * Evita re-fetch al reabrir el modal de ventas o navegar entre todo/productos
 * con el mismo ítem; mantiene frescas las opciones/stock razonablemente.
 */
const TTL = 30_000;
const cache = new Map<number, { ts: number; data: Passo[] }>();

export async function getPasosCached(productId: number): Promise<Passo[]> {
  const hit = cache.get(productId);
  if (hit && Date.now() - hit.ts < TTL) return hit.data;
  const data = await api<Passo[]>(`/public/productos/${productId}/pasos`);
  cache.set(productId, { ts: Date.now(), data });
  return data;
}