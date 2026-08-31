"use client";

import { useCallback, useEffect, useState } from "react";
import AppShell from "@/components/app-shell";
import { api } from "@/lib/api";
import type { Atributo, AtributoValor, Categoria, Packaging } from "@/lib/types";

export default function CatalogosPage() {
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  // --- Atributos ---
  const [atributos, setAtributos] = useState<Atributo[]>([]);
  const [attrSearch, setAttrSearch] = useState("");
  const [showCreateAttr, setShowCreateAttr] = useState(false);
  const [createAttrNombre, setCreateAttrNombre] = useState("");
  const [createAttrValores, setCreateAttrValores] = useState("");
  const [editingAttr, setEditingAttr] = useState<Atributo | null>(null);
  const [editAttrValores, setEditAttrValores] = useState<string[]>([]);
  const [newValor, setNewValor] = useState("");
  const [savingAttr, setSavingAttr] = useState(false);

  // --- Categorías ---
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [newCatNombre, setNewCatNombre] = useState("");
  const [editingCat, setEditingCat] = useState<Categoria | null>(null);
  const [editCatNombre, setEditCatNombre] = useState("");

  // --- Empaques ---
  const [empaques, setEmpaques] = useState<Packaging[]>([]);
  const [newEmpNombre, setNewEmpNombre] = useState("");
  const [editingEmp, setEditingEmp] = useState<Packaging | null>(null);
  const [editEmpNombre, setEditEmpNombre] = useState("");

  const cargarAtributos = useCallback(async () => {
    try {
      const attrs = await api<Atributo[]>(`/catalogos/atributos${attrSearch ? `?search=${encodeURIComponent(attrSearch)}` : ""}`);
      setAtributos(attrs);
    } catch { setAtributos([]); }
  }, [attrSearch]);

  const cargarCatalogos = useCallback(async () => {
    try {
      const [cats, emps] = await Promise.all([
        api<Categoria[]>("/catalogos/categorias"),
        api<Packaging[]>("/catalogos/empaques"),
      ]);
      setCategorias(cats);
      setEmpaques(emps);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    cargarCatalogos();
  }, [cargarCatalogos]);

  useEffect(() => {
    cargarAtributos();
  }, [cargarAtributos]);

  const notify = (e: Error | null, okMsg: string) => {
    if (e) { setError(e.message); setMsg(""); }
    else { setError(""); setMsg(okMsg); }
  };

  // --- Atributos ---
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
      notify(null, "Atributo creado.");
    } catch (e) { notify(e as Error, ""); }
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
    } catch (e) { notify(e as Error, ""); }
  }

  async function eliminarValor(attrId: number, valorId: number) {
    try {
      await api(`/catalogos/atributos/${attrId}/valores/${valorId}`, { method: "DELETE" });
      await cargarAtributos();
      const updated = atributos.find((a) => a.id === attrId);
      if (updated) setEditAttrValores(updated.valores.map((v) => v.valor));
      notify(null, "Valor eliminado.");
    } catch (e) { notify(e as Error, e instanceof Error ? e.message : ""); }
  }

  async function eliminarAtributo(attrId: number) {
    try {
      await api(`/catalogos/atributos/${attrId}`, { method: "DELETE" });
      setEditingAttr(null);
      await cargarAtributos();
      notify(null, "Atributo eliminado.");
    } catch (e) { notify(e as Error, e instanceof Error ? e.message : ""); }
  }

  async function guardarNombreAttr() {
    if (!editingAttr || !editAttrValores[0]) return;
    // The name is the first valor in editAttrValores since we pre-populate
    // Actually, editingAttr.nombre stays the same - we just edit valores
    setEditingAttr(null);
  }

  // --- Categorías ---
  async function crearCategoria() {
    if (!newCatNombre.trim()) return;
    try {
      await api("/catalogos/categorias", {
        method: "POST",
        body: JSON.stringify({ nombre: newCatNombre.trim() }),
      });
      setNewCatNombre("");
      await cargarCatalogos();
      notify(null, "Categoría creada.");
    } catch (e) { notify(e as Error, ""); }
  }

  async function guardarCategoria() {
    if (!editingCat || !editCatNombre.trim()) return;
    try {
      await api(`/catalogos/categorias/${editingCat.id}`, {
        method: "PATCH",
        body: JSON.stringify({ nombre: editCatNombre.trim() }),
      });
      setEditingCat(null);
      await cargarCatalogos();
      notify(null, "Categoría actualizada.");
    } catch (e) { notify(e as Error, ""); }
  }

  async function eliminarCategoria(id: number) {
    try {
      await api(`/catalogos/categorias/${id}`, { method: "DELETE" });
      await cargarCatalogos();
      notify(null, "Categoría eliminada.");
    } catch (e) { notify(e as Error, ""); }
  }

  // --- Empaques ---
  async function crearEmpaque() {
    if (!newEmpNombre.trim()) return;
    try {
      await api("/catalogos/empaques", {
        method: "POST",
        body: JSON.stringify({ nombre: newEmpNombre.trim() }),
      });
      setNewEmpNombre("");
      await cargarCatalogos();
      notify(null, "Empaque creado.");
    } catch (e) { notify(e as Error, ""); }
  }

  async function guardarEmpaque() {
    if (!editingEmp || !editEmpNombre.trim()) return;
    try {
      await api(`/catalogos/empaques/${editingEmp.id}`, {
        method: "PATCH",
        body: JSON.stringify({ nombre: editEmpNombre.trim() }),
      });
      setEditingEmp(null);
      await cargarCatalogos();
      notify(null, "Empaque actualizado.");
    } catch (e) { notify(e as Error, ""); }
  }

  async function eliminarEmpaque(id: number) {
    try {
      await api(`/catalogos/empaques/${id}`, { method: "DELETE" });
      await cargarCatalogos();
      notify(null, "Empaque eliminado.");
    } catch (e) { notify(e as Error, ""); }
  }

  return (
    <AppShell>
      {error && <div className="error">{error}</div>}
      {msg && <div className="msg-ok">{msg}</div>}

      {/* --- ATRIBUTOS GLOBALES --- */}
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

      <div style={{ height: 24 }} />

      {/* --- CATEGORÍAS --- */}
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Categorías</h2>
        <div className="inline-form" style={{ marginBottom: 12 }}>
          <input value={newCatNombre} onChange={(e) => setNewCatNombre(e.target.value)} placeholder="Nombre de categoría" />
          <button type="button" className="btn primary sm" onClick={crearCategoria}>Crear</button>
        </div>
        <div className="card" style={{ padding: 0, overflow: "hidden", margin: 0 }}>
          <table className="table" style={{ margin: 0 }}>
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Productos</th>
                <th style={{ width: 140 }}></th>
              </tr>
            </thead>
            <tbody>
              {categorias.map((cat) => (
                <tr key={cat.id}>
                  <td>
                    {editingCat?.id === cat.id ? (
                      <input value={editCatNombre} onChange={(e) => setEditCatNombre(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && guardarCategoria()} autoFocus />
                    ) : (
                      <strong>{cat.nombre}</strong>
                    )}
                  </td>
                  <td className="muted-2">{cat.productos} producto(s)</td>
                  <td>
                    {editingCat?.id === cat.id ? (
                      <>
                        <button type="button" className="btn ghost sm" onClick={guardarCategoria}>Guardar</button>
                        <button type="button" className="btn ghost sm" onClick={() => setEditingCat(null)}>Cancelar</button>
                      </>
                    ) : (
                      <>
                        <button type="button" className="btn ghost sm" onClick={() => { setEditingCat(cat); setEditCatNombre(cat.nombre); }}>Editar</button>
                        <button type="button" className="btn ghost sm" style={{ color: "red" }} onClick={() => eliminarCategoria(cat.id)}>Eliminar</button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
              {categorias.length === 0 && (
                <tr><td colSpan={3} className="empty">Sin categorías.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ height: 24 }} />

      {/* --- EMPAQUES --- */}
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Empaques</h2>
        <div className="inline-form" style={{ marginBottom: 12 }}>
          <input value={newEmpNombre} onChange={(e) => setNewEmpNombre(e.target.value)} placeholder="Nombre de empaque" />
          <button type="button" className="btn primary sm" onClick={crearEmpaque}>Crear</button>
        </div>
        <div className="card" style={{ padding: 0, overflow: "hidden", margin: 0 }}>
          <table className="table" style={{ margin: 0 }}>
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Activo</th>
                <th style={{ width: 140 }}></th>
              </tr>
            </thead>
            <tbody>
              {empaques.map((emp) => (
                <tr key={emp.id}>
                  <td>
                    {editingEmp?.id === emp.id ? (
                      <input value={editEmpNombre} onChange={(e) => setEditEmpNombre(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && guardarEmpaque()} autoFocus />
                    ) : (
                      <span style={{ color: emp.activo ? undefined : "var(--muted)" }}>{emp.nombre}</span>
                    )}
                  </td>
                  <td>
                    <span className={`badge ${emp.activo ? "normal" : "bajo"}`}>
                      {emp.activo ? "Sí" : "No"}
                    </span>
                  </td>
                  <td>
                    {editingEmp?.id === emp.id ? (
                      <>
                        <button type="button" className="btn ghost sm" onClick={guardarEmpaque}>Guardar</button>
                        <button type="button" className="btn ghost sm" onClick={() => setEditingEmp(null)}>Cancelar</button>
                      </>
                    ) : (
                      <>
                        <button type="button" className="btn ghost sm" onClick={() => { setEditingEmp(emp); setEditEmpNombre(emp.nombre); }}>Editar</button>
                        <button type="button" className="btn ghost sm" style={{ color: "red" }} onClick={() => eliminarEmpaque(emp.id)}>Eliminar</button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
              {empaques.length === 0 && (
                <tr><td colSpan={3} className="empty">Sin empaques.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}
