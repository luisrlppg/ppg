"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Packaging } from "@/lib/types";

interface EmpaqueRow {
  packagingId: number;
  nombre: string;
  cantidad: string;
}

interface Props {
  variantId: number;
  empaquesIniciales: { packagingId: number; nombre: string; cantidad: number }[];
  empaques: Packaging[];
  notify: (e: Error | null, okMsg: string) => void;
  onEmpaqueCreado: () => Promise<void>;
}

export default function EmpaquesVariante({ variantId, empaquesIniciales, empaques, notify, onEmpaqueCreado }: Props) {
  const [rows, setRows] = useState<EmpaqueRow[]>([]);
  const [nuevo, setNuevo] = useState("");
  const [cantidad, setCantidad] = useState("");
  const [nuevoNombre, setNuevoNombre] = useState("");
  const [creando, setCreando] = useState(false);

  useEffect(() => {
    setRows(empaquesIniciales.map((p) => ({ packagingId: p.packagingId, nombre: p.nombre, cantidad: String(p.cantidad) })));
  }, [empaquesIniciales]);

  function agregar() {
    if (!nuevo || !cantidad) return;
    if (rows.some((r) => r.packagingId === Number(nuevo))) return;
    const nombre = empaques.find((e) => e.id === Number(nuevo))?.nombre ?? nuevo;
    setRows([...rows, { packagingId: Number(nuevo), nombre, cantidad }]);
    setNuevo("");
    setCantidad("");
  }

  async function guardar() {
    try {
      const packagings = rows.filter((r) => Number(r.cantidad) > 0).map((r) => ({ packagingId: r.packagingId, cantidad: Number(r.cantidad) }));
      await api(`/productos/variantes/${variantId}/packagings`, { method: "PUT", body: JSON.stringify({ packagings }) });
      notify(null, "Empaques guardados.");
    } catch (e) { notify(e as Error, ""); }
  }

  async function crearEmpaque() {
    const nombre = nuevoNombre.trim();
    if (!nombre) return;
    setCreando(true);
    try {
      await api("/catalogos/empaques", { method: "POST", body: JSON.stringify({ nombre }) });
      await onEmpaqueCreado();
      notify(null, `Empaque "${nombre}" creado.`);
      setNuevoNombre("");
    } catch (e) { notify(e as Error, ""); }
    finally { setCreando(false); }
  }

  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>Empaques</h3>
      <table className="table" style={{ margin: 0 }}>
        <thead>
          <tr>
            <th>Empaque</th>
            <th style={{ width: 160 }}>Cantidad (piezas)</th>
            <th style={{ width: 70 }}></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.packagingId}>
              <td>{r.nombre}</td>
              <td>
                <input
                  type="number" step="0.001" min="0" value={r.cantidad}
                  onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, cantidad: e.target.value } : x)))}
                  style={{ width: 130 }}
                />
              </td>
              <td>
                <button type="button" className="btn ghost sm" onClick={() => setRows(rows.filter((_, j) => j !== i))}>Quitar</button>
              </td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={3} className="empty">Sin empaques definidos.</td></tr>}
        </tbody>
      </table>
      <div className="inline-form" style={{ marginTop: 8 }}>
        <select value={nuevo} onChange={(e) => setNuevo(e.target.value)}>
          <option value="">Empaque…</option>
          {empaques.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
        </select>
        <input type="number" step="0.001" min="0" placeholder="Cant." value={cantidad} onChange={(e) => setCantidad(e.target.value)} />
        <button type="button" className="btn ghost sm" onClick={agregar}>Agregar</button>
        <button type="button" className="btn primary sm" onClick={guardar}>Guardar</button>
      </div>
      <div className="inline-form" style={{ marginTop: 8 }}>
        <input value={nuevoNombre} onChange={(e) => setNuevoNombre(e.target.value)} placeholder="Nuevo empaque (si falta el nombre)…" />
        <button type="button" className="btn ghost sm" disabled={creando} onClick={crearEmpaque}>
          {creando ? "Creando…" : "Crear empaque"}
        </button>
      </div>
    </div>
  );
}
