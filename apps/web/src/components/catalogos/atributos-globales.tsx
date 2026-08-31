"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Atributo } from "@/lib/types";

interface Props {
  onNotify: (e: Error | null, okMsg: string) => void;
}

export default function AtributosGlobales({ onNotify }: Props) {
  const [atributos, setAtributos] = useState<Atributo[]>([]);
  const [attrSearch, setAttrSearch] = useState("");
  const [showCreateAttr, setShowCreateAttr] = useState(false);
  const [createAttrNombre, setCreateAttrNombre] = useState("");
  const [createAttrValores, setCreateAttrValores] = useState("");
  const [editingAttr, setEditingAttr] = useState<Atributo | null>(null);
  const [editAttrValores, setEditAttrValores] = useState<string[]>([]);
  const [newValor, setNewValor] = useState("");
  const [savingAttr, setSavingAttr] = useState(false);

  const cargarAtributos = useCallback(async () => {
    try {
      const attrs = await api<Atributo[]>(`/catalogos/atributos${attrSearch ? `?search=${encodeURIComponent(attrSearch)}` : ""}`);
      setAtributos(attrs);
    } catch { setAtributos([]); }
  }, [attrSearch]);

  useEffect(() => {
    cargarAtributos();
  }, [cargarAtributos]);

  async function crearAtributo() {
    if (!createAttrNombre.trim()) return;
    setSavingAttr(true);
    try {
      const valores = createAttrValores.split(",").map((v) => v.trim()).filter(Boolean);
      await api("/catalogos/atributos", {
        method: "POST",
        body: JSON.stringify({ nombre: createAttrNombre.trim(), valores }),
      });
      setCreateAttrNombre("");
      setCreateAttrValores("");
      setShowCreateAttr(false);
      await cargarAtributos();
      onNotify(null, "Atributo creado.");
    } catch (e) { onNotify(e as Error, ""); }
    finally { setSavingAttr(false); }
  }

  function abrirEditarAttr(attr: Atributo) {
    setEditingAttr(attr);
    setEditAttrValores(attr.valores.map((v) => v.valor));
    setNewValor("");
  }

  async function agregarValor() {
    if (!newValor.trim() || !editingAttr) return;
    try {
      await api(`/catalogos/atributos/${editingAttr.id}/valores`, {
        method: "POST",
        body: JSON.stringify({ valor: newValor.trim() }),
      });
      setNewValor("");
      await cargarAtributos();
      const updated = atributos.find((a) => a.id === editingAttr.id);
      if (updated) setEditAttrValores(updated.valores.map((v) => v.valor));
    } catch (e) { onNotify(e as Error, ""); }
  }

  async function eliminarValor(attrId: number, valorId: number) {
    try {
      await api(`/catalogos/atributos/${attrId}/valores/${valorId}`, { method: "DELETE" });
      await cargarAtributos();
      const updated = atributos.find((a) => a.id === attrId);
      if (updated) setEditAttrValores(updated.valores.map((v) => v.valor));
      onNotify(null, "Valor eliminado.");
    } catch (e) { onNotify(e as Error, e instanceof Error ? e.message : ""); }
  }

  async function eliminarAtributo(attrId: number) {
    try {
      await api(`/catalogos/atributos/${attrId}`, { method: "DELETE" });
      setEditingAttr(null);
      await cargarAtributos();
      onNotify(null, "Atributo eliminado.");
    } catch (e) { onNotify(e as Error, e instanceof Error ? e.message : ""); }
  }

  return (
    <div className="card">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ marginTop: 0, marginBottom: 0 }}>Atributos globales</h2>
        <button type="button" className="btn primary sm" onClick={() => { setShowCreateAttr(true); setCreateAttrNombre(""); setCreateAttrValores(""); }}>
          + Crear atributo
        </button>
      </div>
      <p className="muted small" style={{ margin: "8px 0" }}>
        Los atributos globales pueden asignarse a cualquier producto. Los valores definen las opciones disponibles.
      </p>
      <input
        value={attrSearch}
        onChange={(e) => setAttrSearch(e.target.value)}
        placeholder="Buscar atributo..."
        style={{ marginBottom: 16, width: "100%", maxWidth: 300 }}
      />
      <div className="card" style={{ padding: 0, overflow: "hidden", margin: 0 }}>
        <table className="table" style={{ margin: 0 }}>
          <thead>
            <tr>
              <th>Atributo</th>
              <th>Valores</th>
              <th>Productos</th>
              <th style={{ width: 140 }}></th>
            </tr>
          </thead>
          <tbody>
            {atributos.map((attr) => (
              <tr key={attr.id}>
                <td><strong>{attr.nombre}</strong></td>
                <td className="muted-2">
                  {attr.valores.length === 0 ? (
                    <span className="muted small">sin valores</span>
                  ) : (
                    attr.valores.map((v) => v.valor).join(", ")
                  )}
                </td>
                <td className="muted-2">
                  {attr.productIds?.length || 0} producto(s)
                </td>
                <td>
                  <button type="button" className="btn ghost sm" onClick={() => abrirEditarAttr(attr)}>Editar</button>
                  <button type="button" className="btn ghost sm" style={{ color: "red" }} onClick={() => eliminarAtributo(attr.id)}>Eliminar</button>
                </td>
              </tr>
            ))}
            {atributos.length === 0 && (
              <tr><td colSpan={4} className="empty">Sin atributos. Crea uno para empezar.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* --- Modal: Crear atributo --- */}
      {showCreateAttr && (
        <div className="modal-overlay" onClick={() => setShowCreateAttr(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Crear atributo global</h3>
            <label style={{ display: "block", marginBottom: 12 }}>
              Nombre del atributo
              <input
                value={createAttrNombre}
                onChange={(e) => setCreateAttrNombre(e.target.value)}
                placeholder="ej. Color tapa"
                autoFocus
              />
            </label>
            <label style={{ display: "block", marginBottom: 12 }}>
              Valores (separados por coma)
              <input
                value={createAttrValores}
                onChange={(e) => setCreateAttrValores(e.target.value)}
                placeholder="Negro, Blanco, Transparente"
              />
            </label>
            <div className="row" style={{ gap: 8 }}>
              <button type="button" className="btn ghost" onClick={() => setShowCreateAttr(false)}>Cancelar</button>
              <button type="button" className="btn primary" onClick={crearAtributo} disabled={savingAttr || !createAttrNombre.trim()}>
                {savingAttr ? "Creando…" : "Crear atributo"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- Modal: Editar atributo --- */}
      {editingAttr && (
        <div className="modal-overlay" onClick={() => setEditingAttr(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Editar atributo: {editingAttr.nombre}</h3>
            <div style={{ marginBottom: 12 }}>
              {editAttrValores.map((valor, i) => {
                const original = editingAttr.valores[i];
                return (
                  <div key={original?.id ?? i} className="row" style={{ marginBottom: 6 }}>
                    <span style={{ flex: 1 }}>{valor}</span>
                    <button type="button" className="btn ghost sm" style={{ color: "red" }}
                      onClick={() => original && eliminarValor(editingAttr.id, original.id)}>
                      Eliminar
                    </button>
                  </div>
                );
              })}
              {editAttrValores.length === 0 && (
                <p className="muted small">Sin valores. Agrega uno abajo.</p>
              )}
            </div>
            <div className="inline-form" style={{ marginBottom: 12 }}>
              <input value={newValor} onChange={(e) => setNewValor(e.target.value)} placeholder="Nuevo valor"
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), agregarValor())} />
              <button type="button" className="btn ghost sm" onClick={agregarValor} disabled={!newValor.trim()}>Agregar</button>
            </div>
            <div className="row" style={{ gap: 8 }}>
              <button type="button" className="btn" style={{ color: "red" }} onClick={() => eliminarAtributo(editingAttr.id)}>Eliminar atributo global</button>
              <button type="button" className="btn" onClick={() => setEditingAttr(null)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
