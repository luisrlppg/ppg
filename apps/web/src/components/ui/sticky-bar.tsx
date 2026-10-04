"use client";

import { useEffect, useRef } from "react";

/**
 * Envuelve la barra de búsqueda/filtros para que quede fija al hacer scroll.
 * Mide su alto y lo publica en `--sticky-head` (en `<html>`) para que los
 * encabezados de tabla (`.table th`) se peguen justo debajo sin traslaparse.
 */
export default function StickyBar({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const aplicar = () =>
      document.documentElement.style.setProperty("--sticky-head", `${el.offsetHeight}px`);
    aplicar();
    const ro = new ResizeObserver(aplicar);
    ro.observe(el);
    return () => {
      ro.disconnect();
      document.documentElement.style.removeProperty("--sticky-head");
    };
  }, []);

  return (
    <div ref={ref} className="sticky-bar">
      {children}
    </div>
  );
}
