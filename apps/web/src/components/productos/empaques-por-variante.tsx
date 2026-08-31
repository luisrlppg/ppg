"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Packaging, Variante } from "@/lib/types";

interface EmpaqueRow {
  packagingId: number;
  nombre: string;
  cantidad: string;
}

interface Props {
  variantes: Variante[];
  empaques: Packaging[];
  uom: string;
  notify: (e: Error | null, okMsg: string) => void;
  onEmpaqueCreado: () => Promise<void>;
}

export default function EmpaquesPorVariante({ variantes, empaques, uom, notify, onEmpaqueCreado }: Props) {
  const [empRows, setEmpRows] = useState<Record<number, EmpaqueRow[]>>({});
  const [empInit, setEmpInit] = useState<string | null>(null);
  const [nuevoEmpaque, setNuevoEmpaque] = useState<Record<number, string>>({});
  const [nuevaCantidad, setNuevaCantidad] = useState<Record<number, string>>({});
  const [nuevoEmpNombre, setNuevoEmpNombre] = useState("");
  const [creandoEmp, setCreandoEmp] = useState(false);

  const initKey = variantes.map((v) => v.id).join(",");
  useEffect(() => {
    if (initKey !== empInit) {
      const rows: Record<number, EmpaqueRow[]> = {};
      for (const v of variantes) {
        rows[v.id] = (v.packagings ?? []).map((p) => ({
          packagingId: p.packagingId,
          nombre: p.nombre,
          cantidad: String(p.cantidad),
        }));
      }
      setEmpRows(rows);
      setEmpInit(initKey);
    }
  }, [initKey, empInit]);

  function addEmpaque(v: Variante) {
    const pid = nuevoEmpaque[v.id];
    const cant = nuevaCantidad[v.id];
    if (!pid || !cant) return;
    const existing = empRows[v.id] ?? [];
    if (existing.some((r) => r.packagingId === Number(pid))) return;
    const nombre = empaques.find((e) => e.id === Number(pid))?.nombre ?? pid;
    setEmpRows({ ...empRows, [v.id]: [...existing, { packagingId: Number(pid), nombre, cantidad: cant }] });
    setNuevoEmpaque({ ...nuevoEmpaque, [v.id]: "" });
    setNuevaCantidad({ ...nuevaCantidad, [v.id]: "" });
  }

  function quitarEmpaque(v: Variante, i: number) {
    setEmpRows({ ...empRows, [v.id]: (empRows[v.id] ?? []).filter((_, j) => j !== i) });
  }

  function cambiarCantidad(v: Variante, i: number, cantidad: string) {
    setEmpRows({ ...empRows, [v.id]: (empRows[v.id] ?? []).map((r, j) => j === i ? { ...r, cantidad } : r) });
  }

  async function guardarEmpaques(v: Variante) {
    try {
      const packagings = (empRows[v.id] ?? []).filter((r) => Number(r.cantidad) > 0).map((r) => ({ packagingId: r.packagingId, cantidad: Number(r.cantidad) }));
      await api(`/productos/variantes/${v.id}/packagings`, { method: "PUT", body: JSON.stringify({ packagings }) });
      notify(null, `Empaques de ${v.sku} guardados.`);
    } catch (e) { notify(e as Error, ""); }
  }

  async function crearEmpaque() {
    const nombre = nuevoEmpNombre.trim();
    if (!nombre) return;
    setCreandoEmp(true);
    try {
      await api("/catalogos/empaques", { method: "POST", body: JSON.stringify({ nombre }) });
      await onEmpaqueCreado();
      notify(null, `Empaque "${nombre}" creado.`);
    } catch (e) { notify(e as Error, ""); }
    finally { setCreandoEmp(false); }
  }

  return (
    <div className="card">
      <div className="row">
        <h3 style={{ marginTop: 0, marginBottom: 0 }}>Empaques por variante</h3>
        <span className="muted small" style={{ flex: 1 }}>
          ¿Cuántas piezas caben en cada empaque? Los nuevos empaques se heredan del producto padre.
        </span>
      </div>
      <div className="spacer" />
      {variantes.map((v, vi) => (
        <div key={v.id} style={{ borderTop: vi > 0 ? "1px solid var(--line)" : "none", padding: "10px 0" }}>
          <strong>{v.nombre} <span className="muted-2 small">({v.sku})</span></strong>
          <div className="card" style={{ padding: 8, margin: "8px 0" }}>
            <table className="table" style={{ margin: 0 }}>
              <thead>
                <tr>
                  <th>Empaque</th>
                  <th style={{ width: 160 }}>Cantidad (piezas)</th>
                  <th style={{ width: 70 }}></th>
                </tr>
              </thead>
              <tbody>
                {(empRows[v.id] ?? []).map((r, i) => (
                  <tr key={`${v.id}-${r.packagingId}`}>
                    <td>{r.nombre}</td>
                    <td>
                      <input type="number" step="0.001" min="0" value={r.cantidad}
                        onChange={(e) => cambiarCantidad(v, i, e.target.value)}
                        style={{ width: 130 }}
                      />
                    </td>
                    <td>
                      <button type="button" className="btn ghost sm" onClick={() => quitarEmpaque(v, i)}>Quitar</button>
                    </td>
                  </tr>
                ))}
                {(empRows[v.id] ?? []).length === 0 && (
                  <tr><td colSpan={3} className="empty">Sin empaques definidos.</td></tr>
                )}
              </tbody>
            </table>
            <div className="inline-form" style={{ marginTop: 8 }}>
              <select value={nuevoEmpaque[v.id] ?? ""}
                onChange={(e) => setNuevoEmpaque({ ...nuevoEmpaque, [v.id]: e.target.value })}>
                <option value="">Empaque…</option>
                {empaques.map((e) => (
                  <option key={e.id} value={e.id}>{e.nombre}</option>
                ))}
              </select>
              <input type="number" step="0.001" min="0" placeholder="Cant."
                value={nuevaCantidad[v.id] ?? ""}
                onChange={(e) => setNuevaCantidad({ ...nuevaCantidad, [v.id]: e.target.value })}
              />
              <button type="button" className="btn ghost sm" onClick={() => addEmpaque(v)}>Agregar</button>
              <button type="button" className="btn primary sm" onClick={() => guardarEmpaques(v)}>Guardar</button>
            </div>
          </div>
        </div>
      ))}
      <div className="inline-form">
        <input value={nuevoEmpNombre} onChange={(e) => setNuevoEmpNombre(e.target.value)}
          placeholder="Nuevo empaque (si falta el nombre)…" />
        <button type="button" className="btn ghost sm" disabled={creandoEmp} onClick={crearEmpaque}>
          {creandoEmp ? "Creando…" : "Crear empaque"}
        </button>
      </div>
    </div>
  );
}
