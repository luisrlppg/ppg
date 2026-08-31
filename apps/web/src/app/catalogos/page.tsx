"use client";

import { useCallback, useEffect, useState } from "react";
import AppShell from "@/components/app-shell";
import AtributosGlobales from "@/components/catalogos/atributos-globales";
import { api } from "@/lib/api";
import type { Categoria, Packaging } from "@/lib/types";

export default function CatalogosPage() {
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

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

  const notify = (e: Error | null, okMsg: string) => {
    if (e) { setError(e.message); setMsg(""); }
    else { setError(""); setMsg(okMsg); }
  };

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
      <AtributosGlobales onNotify={notify} />

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
