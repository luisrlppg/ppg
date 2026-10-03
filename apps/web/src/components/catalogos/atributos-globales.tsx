"use client";

import { useCallback, useEffect, useState } from "react";
import Modal from "@/components/ui/modal";
import { api } from "@/lib/api";
import type { Atributo, AtributoValor } from "@/lib/types";

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
  const [editAttrValores, setEditAttrValores] = useState<AtributoValor[]>([]);
  const [attrNombreDraft, setAttrNombreDraft] = useState("");
  const [valueDrafts, setValueDrafts] = useState<Record<number, string>>({});
  const [newValor, setNewValor] = useState("");
  const [savingAttr, setSavingAttr] = useState(false);
  const [modalError, setModalError] = useState("");

  const cargarAtributos = useCallback(async () => {
    try {
      const attrs = await api<Atributo[]>(`/catalogos/atributos${attrSearch ? `?search=${encodeURIComponent(attrSearch)}` : ""}`);
      setAtributos(attrs);
      return attrs;
    } catch { setAtributos([]); return []; }
  }, [attrSearch]);

  function refrescarEditando(attrs: Atributo[], attrId: number) {
    const updated = attrs.find((a) => a.id === attrId);
    const valores = updated?.valores ?? [];
    setEditAttrValores(valores);
    setValueDrafts(Object.fromEntries(valores.map((v) => [v.id, v.valor])));
  }

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
    setEditAttrValores(attr.valores);
    setAttrNombreDraft(attr.nombre);
    setValueDrafts(Object.fromEntries(attr.valores.map((v) => [v.id, v.valor])));
    setNewValor("");
    setModalError("");
  }

  async function renombrarAtributo() {
    if (!editingAttr) return;
    const nombre = attrNombreDraft.trim();
    if (!nombre) { setModalError("El nombre no puede estar vacío"); return; }
    if (nombre === editingAttr.nombre) return;
    setModalError("");
    try {
      await api(`/catalogos/atributos/${editingAttr.id}`, { method: "PATCH", body: JSON.stringify({ nombre }) });
      const attrs = await cargarAtributos();
      const updated = attrs.find((a) => a.id === editingAttr.id);
      if (updated) { setEditingAttr(updated); setAttrNombreDraft(updated.nombre); }
      onNotify(null, "Atributo renombrado.");
    } catch (e) { setModalError(e instanceof Error ? e.message : "Error"); }
  }

  async function renombrarValor(valorId: number, nuevo: string) {
    if (!editingAttr) return;
    const original = editAttrValores.find((v) => v.id === valorId)?.valor ?? "";
    const valor = nuevo.trim();
    if (!valor || valor === original) {
      setValueDrafts((d) => ({ ...d, [valorId]: original }));
      return;
    }
    setModalError("");
    try {
      await api(`/catalogos/atributos/${editingAttr.id}/valores/${valorId}`, { method: "PATCH", body: JSON.stringify({ valor }) });
      const attrs = await cargarAtributos();
      refrescarEditando(attrs, editingAttr.id);
    } catch (e) {
      setModalError(e instanceof Error ? e.message : "Error");
      setValueDrafts((d) => ({ ...d, [valorId]: original }));
    }
  }

  async function agregarValor() {
    if (!newValor.trim() || !editingAttr) return;
    setModalError("");
    try {
      await api(`/catalogos/atributos/${editingAttr.id}/valores`, {
        method: "POST",
        body: JSON.stringify({ valor: newValor.trim() }),
      });
      setNewValor("");
      const attrs = await cargarAtributos();
      refrescarEditando(attrs, editingAttr.id);
    } catch (e) { setModalError(e instanceof Error ? e.message : "Error"); }
  }

  async function eliminarValor(attrId: number, valorId: number) {
    setModalError("");
    try {
      await api(`/catalogos/atributos/${attrId}/valores/${valorId}`, { method: "DELETE" });
      const attrs = await cargarAtributos();
      refrescarEditando(attrs, attrId);
      onNotify(null, "Valor eliminado.");
    } catch (e) { setModalError(e instanceof Error ? e.message : "Error"); }
  }

  async function eliminarAtributo(attrId: number) {
    setModalError("");
    try {
      await api(`/catalogos/atributos/${attrId}`, { method: "DELETE" });
      setEditingAttr(null);
      await cargarAtributos();
      onNotify(null, "Atributo eliminado.");
    } catch (e) { setModalError(e instanceof Error ? e.message : "Error"); }
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
        <Modal title="Crear atributo global" onClose={() => setShowCreateAttr(false)}>
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
          <div className="row" style={{ gap: 8, justifyContent: "flex-end" }}>
            <button type="button" className="btn ghost" onClick={() => setShowCreateAttr(false)}>Cancelar</button>
            <button type="button" className="btn primary" onClick={crearAtributo} disabled={savingAttr || !createAttrNombre.trim()}>
              {savingAttr ? "Creando…" : "Crear atributo"}
            </button>
          </div>
        </Modal>
      )}

      {/* --- Modal: Editar atributo --- */}
      {editingAttr && (
        <Modal title={`Editar atributo: ${editingAttr.nombre}`} onClose={() => { setEditingAttr(null); setModalError(""); }}>
          {modalError && <div className="error" style={{ marginBottom: 12 }}>{modalError}</div>}
          <label style={{ display: "block", marginBottom: 12 }}>
            Nombre del atributo
            <div className="inline-form" style={{ marginTop: 4 }}>
              <input
                value={attrNombreDraft}
                onChange={(e) => setAttrNombreDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); renombrarAtributo(); } }}
                style={{ flex: 1 }}
              />
              <button type="button" className="btn ghost sm" onClick={renombrarAtributo}
                disabled={!attrNombreDraft.trim() || attrNombreDraft.trim() === editingAttr.nombre}>
                Guardar
              </button>
            </div>
          </label>
          <div style={{ marginBottom: 12 }}>
            {editAttrValores.map((valor) => (
              <div key={valor.id} className="row" style={{ marginBottom: 6, gap: 6 }}>
                <input
                  value={valueDrafts[valor.id] ?? valor.valor}
                  onChange={(e) => setValueDrafts((d) => ({ ...d, [valor.id]: e.target.value }))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") { e.preventDefault(); renombrarValor(valor.id, valueDrafts[valor.id] ?? valor.valor); }
                    if (e.key === "Escape") { setValueDrafts((d) => ({ ...d, [valor.id]: valor.valor })); }
                  }}
                  onBlur={() => renombrarValor(valor.id, valueDrafts[valor.id] ?? valor.valor)}
                  style={{ flex: 1 }}
                />
                <button type="button" className="btn ghost sm" style={{ color: "red" }}
                  onClick={() => eliminarValor(editingAttr.id, valor.id)}>
                  Eliminar
                </button>
              </div>
            ))}
            {editAttrValores.length === 0 && (
              <p className="muted small">Sin valores. Agrega uno abajo.</p>
            )}
          </div>
          <div className="inline-form" style={{ marginBottom: 12 }}>
            <input value={newValor} onChange={(e) => setNewValor(e.target.value)} placeholder="Nuevo valor"
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), agregarValor())} />
            <button type="button" className="btn ghost sm" onClick={agregarValor} disabled={!newValor.trim()}>Agregar</button>
          </div>
          <div className="row" style={{ gap: 8, justifyContent: "space-between" }}>
            <button type="button" className="btn danger" onClick={() => eliminarAtributo(editingAttr.id)}>Eliminar atributo global</button>
            <button type="button" className="btn secondary" onClick={() => setEditingAttr(null)}>Cerrar</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
