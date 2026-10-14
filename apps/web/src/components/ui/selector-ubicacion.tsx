"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export interface UbicacionOpcion {
  id: number;
  nombre: string;
}

interface Props {
  ubicaciones: UbicacionOpcion[];
  value: number | null;
  onChange: (id: number | null) => void;
  placeholder?: string;
  vacio?: string;
}

/**
 * Selector de una ubicación con búsqueda: escribe y las opciones se filtran por
 * nombre. Reutiliza las clases del buscador (`.buscador-wrap`/`.buscador-lista`).
 */
export default function SelectorUbicacion({
  ubicaciones,
  value,
  onChange,
  placeholder = "Buscar ubicación…",
  vacio = "Sin ubicaciones que coincidan.",
}: Props) {
  const [texto, setTexto] = useState("");
  const [abierto, setAbierto] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const sel = ubicaciones.find((u) => u.id === value) ?? null;

  // Al cerrar (o cambiar la selección) el texto refleja la opción elegida.
  useEffect(() => {
    if (!abierto) setTexto(sel?.nombre ?? "");
  }, [abierto, sel]);

  // Si la opción seleccionada deja de existir (cambian las opciones), se limpia.
  useEffect(() => {
    if (value !== null && !ubicaciones.some((u) => u.id === value)) onChange(null);
  }, [value, ubicaciones, onChange]);

  // Cierra al hacer clic fuera.
  useEffect(() => {
    if (!abierto) return;
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setAbierto(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [abierto]);

  const filtradas = useMemo(() => {
    const q = texto.trim().toLowerCase();
    if (!q || q === sel?.nombre.toLowerCase()) return ubicaciones.slice(0, 10);
    return ubicaciones.filter((u) => u.nombre.toLowerCase().includes(q)).slice(0, 10);
  }, [texto, sel, ubicaciones]);

  function elegir(id: number) {
    setTexto(ubicaciones.find((u) => u.id === id)?.nombre ?? "");
    setAbierto(false);
    onChange(id);
  }

  function escribir(v: string) {
    setTexto(v);
    setAbierto(true);
    if (sel && v !== sel.nombre) onChange(null);
  }

  return (
    <div className="buscador-wrap" ref={wrapRef} style={{ maxWidth: "none", width: "100%" }}>
      <input
        value={abierto ? texto : sel?.nombre ?? texto}
        onChange={(e) => escribir(e.target.value)}
        onFocus={() => {
          setTexto(sel?.nombre ?? "");
          setAbierto(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") setAbierto(false);
          else if (e.key === "Enter" && abierto && filtradas.length > 0) {
            e.preventDefault();
            elegir(filtradas[0].id);
          }
        }}
        placeholder={placeholder}
        autoComplete="off"
      />
      {abierto && (
        <ul className="buscador-lista">
          {filtradas.length === 0 ? (
            <li className="muted small" style={{ padding: "8px 10px" }}>
              {vacio}
            </li>
          ) : (
            filtradas.map((u) => (
              <li key={u.id}>
                <button type="button" className={u.id === value ? "on" : ""} onClick={() => elegir(u.id)}>
                  {u.nombre}
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
