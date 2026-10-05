"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

/** Cualquier fila filtrable: producto + valoración de atributos de su variante. */
export interface ItemFiltrable {
  productoId: number;
  producto: string;
  valoracion: { attribute: string; valor: string }[];
}

export interface ProductoFiltrable {
  productoId: number;
  producto: string;
  variantes: number;
}

/**
 * Buscador de producto + filtro por atributos (mismos valores presentes en los
 * items). Compartido por Inventario y Fabricación. Dentro de un atributo es
 * "alguno de"; entre atributos se combinan (Y).
 */
export function useFiltroAtributos<T extends ItemFiltrable>(items: T[]) {
  const [busqueda, setBusqueda] = useState("");
  const [coincidenciasAbiertas, setCoincidenciasAbiertas] = useState(false);
  const [productoSelId, setProductoSelId] = useState<number | null>(null);
  const [filtros, setFiltros] = useState<Record<string, Set<string>>>({});
  const [showFiltros, setShowFiltros] = useState(false);

  // Cierra el dropdown de búsqueda al hacer click fuera.
  useEffect(() => {
    if (!coincidenciasAbiertas) return;
    function onDown(e: MouseEvent) {
      const t = e.target as HTMLElement;
      if (!t.closest(".buscador-wrap")) setCoincidenciasAbiertas(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [coincidenciasAbiertas]);

  const productos = useMemo(() => {
    const map = new Map<number, ProductoFiltrable>();
    for (const v of items) {
      let g = map.get(v.productoId);
      if (!g) {
        g = { productoId: v.productoId, producto: v.producto, variantes: 0 };
        map.set(v.productoId, g);
      }
      g.variantes += 1;
    }
    return [...map.values()].sort((a, b) => a.producto.localeCompare(b.producto));
  }, [items]);

  const coincidenciasProducto = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return [];
    return productos.filter((p) => p.producto.toLowerCase().includes(q)).slice(0, 8);
  }, [busqueda, productos]);

  const productoSel = productos.find((p) => p.productoId === productoSelId) ?? null;

  const atributosProducto = useMemo(() => {
    if (!productoSel) return [] as { attribute: string; valores: string[] }[];
    const map = new Map<string, Set<string>>();
    for (const v of items) {
      if (v.productoId !== productoSel.productoId) continue;
      for (const a of v.valoracion) {
        const s = map.get(a.attribute) ?? new Set<string>();
        s.add(a.valor);
        map.set(a.attribute, s);
      }
    }
    return [...map.entries()]
      .map(([attribute, set]) => ({ attribute, valores: [...set].sort() }))
      .sort((a, b) => a.attribute.localeCompare(b.attribute));
  }, [items, productoSel]);

  const seleccionarProducto = useCallback((productoId: number) => {
    setProductoSelId(productoId);
    setBusqueda("");
    setCoincidenciasAbiertas(false);
    setFiltros({});
    setShowFiltros(true);
  }, []);

  const limpiarFiltro = useCallback(() => {
    setProductoSelId(null);
    setFiltros({});
    setBusqueda("");
    setShowFiltros(false);
  }, []);

  const toggleValor = useCallback((attribute: string, valor: string) => {
    setFiltros((prev) => {
      const set = new Set(prev[attribute] ?? []);
      if (set.has(valor)) set.delete(valor);
      else set.add(valor);
      const next = { ...prev };
      if (set.size === 0) delete next[attribute];
      else next[attribute] = set;
      return next;
    });
  }, []);

  const nFiltrosActivos = Object.values(filtros).reduce((a, s) => a + s.size, 0);

  const pasaFiltro = useCallback(
    (v: ItemFiltrable) => {
      if (!productoSel) return true;
      if (v.productoId !== productoSel.productoId) return false;
      for (const [attribute, valores] of Object.entries(filtros)) {
        const tiene = v.valoracion.some((a) => a.attribute === attribute && valores.has(a.valor));
        if (!tiene) return false;
      }
      return true;
    },
    [productoSel, filtros],
  );

  const filtradas = useMemo(() => items.filter(pasaFiltro), [items, pasaFiltro]);

  return {
    busqueda,
    setBusqueda,
    coincidenciasAbiertas,
    setCoincidenciasAbiertas,
    productos,
    coincidenciasProducto,
    productoSel,
    seleccionarProducto,
    limpiarFiltro,
    filtros,
    setFiltros,
    showFiltros,
    setShowFiltros,
    atributosProducto,
    toggleValor,
    nFiltrosActivos,
    pasaFiltro,
    filtradas,
    hayFiltro: productoSel !== null,
  };
}

export type FiltroAtributos = ReturnType<typeof useFiltroAtributos>;
