"use client";

/** Evento global para refrescar el globo de "pendientes de ubicar" del sidebar. */
export const POR_UBICAR_EVENT = "ppg:por-ubicar";

export function refrescarPorUbicar() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(POR_UBICAR_EVENT));
}
