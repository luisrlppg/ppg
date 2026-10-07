"use client";

import { useMemo, useState } from "react";
import Modal from "@/components/ui/modal";
import { api } from "@/lib/api";
import type { Existencia, Ubicacion } from "@/lib/types";

interface Props {
  ubicaciones: Ubicacion[];
  exist: Existencia[];
  onCambio: () => void | Promise<void>;
  onCerrar: () => void;
}

export default function UbicacionesModal({ ubicaciones, exist, onCambio, onCerrar }: Props) {
  const [nuevoNombre, setNuevoNombre] = useState("");
  const [editId, setEditId] = useState<number | null>(null);
  const [editNombre, setEditNombre] = useState("");
  const [porEliminar, setPorEliminar] = useState<Ubicacion | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  // Ubicaciones con existencias (no se pueden eliminar).
  const conStock = useMemo(() => {
    const ids = new Set<number>();
    for (const v of exist) {
      for (const [locId, info] of Object.entries(v.porUbicacion)) {
        if (info.qty > 0) ids.add(Number(locId));
      }
    }
    return ids;
  }, [exist]);

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    if (!nuevoNombre.trim()) return;
    setGuardando(true);
    setError("");
    try {
      await api("/inventario/ubicaciones", { method: "POST", body: JSON.stringify({ nombre: nuevoNombre.trim() }) });
      setNuevoNombre("");
      await onCambio();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setGuardando(false);
    }
  }

  async function guardarEdicion() {
    if (editId === null || !editNombre.trim()) return;
    setGuardando(true);
    setError("");
    try {
      await api(`/inventario/ubicaciones/${editId}`, { method: "PATCH", body: JSON.stringify({ nombre: editNombre.trim() }) });
      setEditId(null);
      setEditNombre("");
      await onCambio();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setGuardando(false);
    }
  }

  async function eliminar() {
    if (!porEliminar) return;
    setGuardando(true);
    setError("");
    try {
      await api(`/inventario/ubicaciones/${porEliminar.id}`, { method: "DELETE" });
      setPorEliminar(null);
      await onCambio();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setGuardando(false);
    }
  }

  function motivoNoEliminar(u: Ubicacion): string | null {
    if (u.tipo !== "almacen") return "Es una ubicación del sistema";
    if (conStock.has(u.id)) return "Tiene existencias";
    return null;
  }

  return (
    <Modal title="Ubicaciones" onClose={onCerrar}>
      {error && <div className="error">{error}</div>}
      <p className="muted small" style={{ marginTop: 0 }}>
        Administra los compartimentos y almacenes. Una ubicación sólo se puede eliminar si no tiene existencias.
      </p>

      {porEliminar ? (
        <div className="card" style={{ borderColor: "var(--danger, #c0392b)" }}>
          <p style={{ marginTop: 0 }}>
            ¿Eliminar la ubicación <strong>{porEliminar.nombre}</strong>? Esta acción no se puede deshacer.
          </p>
          <div className="row" style={{ justifyContent: "flex-end" }}>
            <button type="button" className="btn ghost sm" onClick={() => setPorEliminar(null)}>
              Cancelar
            </button>
            <button type="button" className="btn danger sm" disabled={guardando} onClick={eliminar}>
              {guardando ? "Eliminando…" : "Eliminar"}
            </button>
          </div>
        </div>
      ) : null}

      <div className="table-wrap" style={{ marginBottom: 12 }}>
        <table className="table">
          <thead>
            <tr>
              <th>Nombre</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {ubicaciones.map((u) => (
              <tr key={u.id}>
                <td>
                  {editId === u.id ? (
                    <input
                      value={editNombre}
                      onChange={(e) => setEditNombre(e.target.value)}
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === "Enter") guardarEdicion();
                        if (e.key === "Escape") setEditId(null);
                      }}
                    />
                  ) : (
                    <strong>{u.nombre}</strong>
                  )}
                </td>
                <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                  {editId === u.id ? (
                    <>
                      <button type="button" className="btn primary sm" disabled={guardando || !editNombre.trim()} onClick={guardarEdicion}>
                        Guardar
                      </button>{" "}
                      <button type="button" className="btn ghost sm" onClick={() => { setEditId(null); setError(""); }}>
                        Cancelar
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="btn sm"
                        onClick={() => {
                          setEditId(u.id);
                          setEditNombre(u.nombre);
                          setPorEliminar(null);
                          setError("");
                        }}
                      >
                        Editar
                      </button>{" "}
                      <button
                        type="button"
                        className="btn ghost sm"
                        disabled={motivoNoEliminar(u) !== null}
                        title={motivoNoEliminar(u) ?? undefined}
                        onClick={() => {
                          setPorEliminar(u);
                          setEditId(null);
                          setError("");
                        }}
                      >
                        Eliminar
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
            {ubicaciones.length === 0 && (
              <tr>
                <td colSpan={2} className="empty">Sin ubicaciones.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <form onSubmit={crear} className="row" style={{ alignItems: "flex-end" }}>
        <label style={{ flex: 1 }}>
          Nueva ubicación
          <input
            value={nuevoNombre}
            onChange={(e) => setNuevoNombre(e.target.value)}
            placeholder="ej. Almacén 2, Piso producción"
          />
        </label>
        <button className="btn primary" disabled={guardando || !nuevoNombre.trim()}>
          Crear
        </button>
      </form>
    </Modal>
  );
}
