"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import AppShell from "@/components/app-shell";
import EmpaquesPorVariante from "@/components/productos/empaques-por-variante";
import { api } from "@/lib/api";
import type { Atributo, Categoria, Grid, GridCombo, Packaging, ProductoDetalle, Variante } from "@/lib/types";

interface BomRow {
  componentId: number;
  nombre: string;
  cantidad: number;
  tipo: string;
}

export default function ProductoDetallePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const prodId = Number(id);
  const [d, setD] = useState<ProductoDetalle | null>(null);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [atributos, setAtributos] = useState<Atributo[]>([]);
  const [empaques, setEmpaques] = useState<Packaging[]>([]);
  const [grid, setGrid] = useState<Grid | null>(null);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  // --- Atributos propios y heredados del producto ---
  const [propios, setPropios] = useState<Atributo[]>([]);
  const [heredados, setHeredados] = useState<Atributo[]>([]);
  const [showCreateAttrModal, setShowCreateAttrModal] = useState(false);
  const [createAttrNombre, setCreateAttrNombre] = useState("");
  const [createAttrValores, setCreateAttrValores] = useState("");
  const [editingAttr, setEditingAttr] = useState<Atributo | null>(null);
  const [editAttrValores, setEditAttrValores] = useState<string[]>([]);
  const [newValor, setNewValor] = useState("");
  const [savingAttr, setSavingAttr] = useState(false);
  const [showAddGlobalModal, setShowAddGlobalModal] = useState(false);
  const [globalAttrSearch, setGlobalAttrSearch] = useState("");
  const [asigningAttr, setAsigningAttr] = useState(false);

  const cargarAtributosProducto = useCallback(async () => {
    try {
      const result = await api<{ propios: Atributo[]; heredados: Atributo[] }>(`/catalogos/atributos/producto/${prodId}`);
      setPropios(result.propios);
      setHeredados(result.heredados);
    } catch { setPropios([]); setHeredados([]); }
  }, [prodId]);

  const cargar = useCallback(async () => {
    const [pd, g] = await Promise.all([
      api<ProductoDetalle>(`/productos/${prodId}`),
      api<Grid | { ejes: never[]; combinaciones: never[] }>(`/productos/${prodId}/grid`),
    ]);
    setD(pd);
    setGrid(g);
    await cargarAtributosProducto();
  }, [prodId, cargarAtributosProducto]);

  useEffect(() => {
    api<Categoria[]>("/catalogos/categorias").then(setCategorias).catch(() => setCategorias([]));
    api<Atributo[]>("/catalogos/atributos").then(setAtributos).catch(() => setAtributos([]));
    api<Packaging[]>("/catalogos/empaques").then(setEmpaques).catch(() => setEmpaques([]));
  }, []);

  useEffect(() => {
    cargar().catch((e) => setError(e.message));
  }, [cargar]);

  const notify = (e: Error | null, okMsg: string) => {
    if (e) { setError(e.message); setMsg(""); }
    else { setError(""); setMsg(okMsg); }
  };

  const refrescarEmpaques = useCallback(async () => {
    try {
      setEmpaques(await api<Packaging[]>("/catalogos/empaques"));
    } catch { /* noop */ }
  }, []);

  // ------------------------------------------------------------- Datos base
  const [nombreEdit, setNombreEdit] = useState<string | null>(null);

  async function guardarNombre() {
    if (!nombreEdit?.trim()) { setNombreEdit(null); return; }
    try {
      await api(`/productos/${prodId}`, { method: "PATCH", body: JSON.stringify({ nombre: nombreEdit.trim() }) });
      await cargar();
      setNombreEdit(null);
      notify(null, "Nombre actualizado.");
    } catch (e) { notify(e as Error, ""); }
  }

  // ------------------------------------------------------------------ Atributos locales
  async function crearAtributo() {
    if (!createAttrNombre.trim()) return;
    setSavingAttr(true);
    try {
      const valores = createAttrValores.split(",").map((v) => v.trim()).filter(Boolean);
      // Crear atributo global
      await api("/catalogos/atributos", {
        method: "POST",
        body: JSON.stringify({ nombre: createAttrNombre.trim(), valores }),
      });
      // Buscar el atributo creado para obtener su ID
      const allAttrs = await api<Atributo[]>("/catalogos/atributos");
      const created = allAttrs.find((a) => a.nombre === createAttrNombre.trim());
      if (created) {
        // Asignar al producto via PUT ejes (agrega a los existentes)
        const allPropiosIds = [...propios, ...heredados].map((a) => a.id);
        const newEjes = [...allPropiosIds, created.id].map((attrId, i) => ({ attributeId: attrId, sortOrder: i }));
        await api(`/productos/${prodId}/ejes`, {
          method: "PUT",
          body: JSON.stringify({ ejes: newEjes }),
        });
      }
      setCreateAttrNombre("");
      setCreateAttrValores("");
      setShowCreateAttrModal(false);
      await cargarAtributosProducto();
      notify(null, "Atributo creado y asignado.");
    } catch (e) { notify(e as Error, e instanceof Error ? e.message : "Error"); }
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
      await cargarAtributosProducto();
      const updated = [...propios, ...heredados].find((a) => a.id === editingAttr.id);
      if (updated) setEditAttrValores(updated.valores.map((v) => v.valor));
    } catch (e) { notify(e as Error, ""); }
  }

  async function eliminarValor(attrId: number, valorId: number) {
    try {
      await api(`/catalogos/atributos/${attrId}/valores/${valorId}`, { method: "DELETE" });
      await cargarAtributosProducto();
      const updated = [...propios, ...heredados].find((a) => a.id === attrId);
      if (updated) setEditAttrValores(updated.valores.map((v) => v.valor));
      notify(null, "Valor eliminado.");
    } catch (e) { notify(e as Error, ""); }
  }

  async function desasignarAtributo(attrId: number) {
    try {
      await api(`/catalogos/atributos/${attrId}/desasignar/${prodId}`, { method: "DELETE" });
      setEditingAttr(null);
      await cargarAtributosProducto();
      notify(null, "Atributo desasignado del producto.");
    } catch (e) { notify(e as Error, ""); }
  }

  async function asignarAtributoGlobal(attrId: number) {
    setAsigningAttr(true);
    try {
      await api(`/catalogos/atributos/${attrId}/asignar/${prodId}`, { method: "POST" });
      setShowAddGlobalModal(false);
      setGlobalAttrSearch("");
      await cargarAtributosProducto();
      notify(null, "Atributo asignado.");
    } catch (e) { notify(e as Error, ""); }
    finally { setAsigningAttr(false); }
  }

  // ------------------------------------------------------------------ Ejes (para grid legacy)
  const [ejesSel, setEjesSel] = useState<number[]>([]);
  const [nuevoEje, setNuevoEje] = useState("");

  useEffect(() => {
    if (d && grid) {
      setEjesSel(grid.ejes.map((e) => e.attributeId));
    }
  }, [d, grid]);

  async function guardarEjes() {
    try {
      const ejes = ejesSel.map((attributeId, i) => ({ attributeId, sortOrder: i }));
      await api(`/productos/${prodId}/ejes`, { method: "PUT", body: JSON.stringify({ ejes }) });
      await cargar();
      notify(null, "Ejes del grid guardados.");
    } catch (e) { notify(e as Error, ""); }
  }

  // ---------------------------------------------------------------- Grid
  async function materializar(combo: GridCombo) {
    try {
      await api(`/productos/${prodId}/materializar`, {
        method: "POST",
        body: JSON.stringify({ valueIds: combo.valueIds }),
      });
      await cargar();
      notify(null, `Variante "${combo.nombre}" creada con empaques heredados.`);
    } catch (e) { notify(e as Error, ""); }
  }

  // Combinación materializable según el valor elegido por atributo (dropdown por eje)
  const [selValores, setSelValores] = useState<Record<number, number>>({});
  const ejesGrid = grid?.ejes ?? [];
  const faltantesGrid = ejesGrid.filter((e) => !(selValores[e.attributeId] !== undefined)).length;
  const comboSeleccionado: GridCombo | null = (() => {
    if (!grid || faltantesGrid > 0) return null;
    const valueIds = ejesGrid.map((e) => selValores[e.attributeId]);
    return grid.combinaciones.find((c) => c.valueIds.length === valueIds.length && c.valueIds.every((v, i) => v === valueIds[i])) ?? null;
  })();

  // -------------------------------------------------------------- Variantes
  const [editNombreVid, setEditNombreVid] = useState<number | null>(null);
  const [editNombreVal, setEditNombreVal] = useState("");
  const [showNuevaVariante, setShowNuevaVariante] = useState(false);
  const [nuevaVarNombre, setNuevaVarNombre] = useState("");
  const [nuevaVarSku, setNuevaVarSku] = useState("");
  const [guardandoVar, setGuardandoVar] = useState(false);

  function iniciarEditNombre(v: Variante) {
    setEditNombreVid(v.id);
    setEditNombreVal(v.nombre);
  }

  async function guardarNombreVariante(v: Variante) {
    if (!editNombreVal.trim()) { setEditNombreVid(null); return; }
    try {
      await api(`/productos/variantes/${v.id}`, { method: "PATCH", body: JSON.stringify({ nombre: editNombreVal.trim() }) });
      await cargar();
      setEditNombreVid(null);
      notify(null, "Nombre de variante actualizado.");
    } catch (e) { notify(e as Error, ""); }
  }

  async function crearVariante(e: React.FormEvent) {
    e.preventDefault();
    if (!nuevaVarNombre.trim() || !nuevaVarSku.trim()) return;
    setGuardandoVar(true);
    try {
      await api(`/productos/${prodId}/variantes`, {
        method: "POST",
        body: JSON.stringify({ nombre: nuevaVarNombre.trim(), sku: nuevaVarSku.trim() }),
      });
      setNuevaVarNombre("");
      setNuevaVarSku("");
      setShowNuevaVariante(false);
      await cargar();
      notify(null, "Variante creada con empaques heredados.");
    } catch (err) { notify(err as Error, ""); }
    finally { setGuardandoVar(false); }
  }

  async function toggle(v: Variante, campo: "published" | "longLead" | "activo") {
    try {
      await api(`/productos/variantes/${v.id}`, { method: "PATCH", body: JSON.stringify({ [campo]: !v[campo] }) });
      await cargar();
      notify(null, "Variante actualizada.");
    } catch (e) { notify(e as Error, ""); }
  }

  // ------------------------------------------------------------------ BOM
  const [bomRows, setBomRows] = useState<BomRow[]>([]);
  const [buscaComp, setBuscaComp] = useState("");
  const [resultComp, setResultComp] = useState<{ id: number; nombre: string; sku: string; producto: string }[]>([]);

  useEffect(() => {
    if (d) setBomRows(d.componentes.map((c) => ({ ...c })));
  }, [d]);

  async function buscarComponentes(q: string) {
    setBuscaComp(q);
    if (!q.trim()) { setResultComp([]); return; }
    const r = await api<{ id: number; nombre: string; sku: string; producto: string }[]>(`/productos/variantes?search=${encodeURIComponent(q)}`);
    setResultComp(r);
  }

  function agregarComp(v: { id: number; nombre: string; sku: string; producto: string }) {
    setBomRows((rows) => [...rows, { componentId: v.id, nombre: `${v.producto} · ${v.nombre}`, cantidad: 1, tipo: "exacto" }]);
    setBuscaComp("");
    setResultComp([]);
  }

  async function guardarBom() {
    try {
      await api(`/productos/${prodId}/componentes`, {
        method: "PUT",
        body: JSON.stringify({ componentes: bomRows.map((r) => ({ componentId: r.componentId, cantidad: r.cantidad, tipo: r.tipo })) }),
      });
      notify(null, "Lista de materiales guardada.");
    } catch (e) { notify(e as Error, ""); }
  }

  if (!d) {
    return (
      <AppShell>
        <p className="muted">Cargando producto…</p>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <p><Link href="/productos">← Productos</Link></p>
      {error && <div className="error">{error}</div>}
      {msg && <div className="msg-ok">{msg}</div>}

      {/* --- Datos base --- */}
      <h2>
        {nombreEdit !== null ? (
          <input
            value={nombreEdit}
            onChange={(e) => setNombreEdit(e.target.value)}
            onBlur={guardarNombre}
            onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
            autoFocus
          />
        ) : (
          <span onClick={() => setNombreEdit(d.nombre)} style={{ cursor: "pointer" }} title="Clic para editar">
            {d.nombre}
          </span>
        )}
      </h2>
      <p className="muted small">SKU base: {d.skuBase} · UOM: {d.uom} · {d.hasVariants ? "Con variantes" : "Variante única"}</p>

      <div className="card">
        <div className="row" style={{ alignItems: "flex-end" }}>
          <label style={{ flex: 1 }}>
            Categoría
            <select
              value={d.categoryId ?? ""}
              onChange={(e) => {
                const val = e.target.value ? Number(e.target.value) : null;
                api(`/productos/${prodId}`, { method: "PATCH", body: JSON.stringify({ categoryId: val }) })
                  .then(() => cargar()).catch((e) => notify(e as Error, ""));
              }}
            >
              <option value="">— Sin categoría —</option>
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>{c.nombre}</option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {/* --- Atributos y valores (solo si tiene variantes) --- */}
      {d.hasVariants && (
        <div className="card">
          <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
            <h3 style={{ marginTop: 0, marginBottom: 0 }}>Atributos</h3>
          </div>
          <p className="muted small" style={{ margin: "4px 0 12px" }}>
            Los atributos definen las opciones de venta. Los valores se usan para filtrar variantes.
          </p>

          {propios.length > 0 && (
            <>
              <p className="muted small" style={{ margin: "0 0 8px", fontWeight: 600 }}>PROPIOS</p>
              <table className="table" style={{ marginBottom: 12 }}>
                <tbody>
                  {propios.map((attr) => (
                    <tr key={attr.id}>
                      <td><strong>{attr.nombre}</strong></td>
                      <td className="muted-2">
                        {attr.valores.length === 0 ? (
                          <span className="muted small">sin valores</span>
                        ) : (
                          attr.valores.map((v) => v.valor).join(", ")
                        )}
                      </td>
                      <td style={{ width: 200 }}>
                        <button type="button" className="btn ghost sm" onClick={() => abrirEditarAttr(attr)}>Editar</button>
                        <button type="button" className="btn ghost sm" style={{ color: "red" }} onClick={() => desasignarAtributo(attr.id)}>Desasignar</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          {heredados.length > 0 && (
            <>
              <p className="muted small" style={{ margin: "8px 0 8px", fontWeight: 600 }}>HEREDADOS (de componentes del BOM)</p>
              <table className="table" style={{ marginBottom: 12 }}>
                <tbody>
                  {heredados.map((attr) => (
                    <tr key={attr.id}>
                      <td><span className="muted">{attr.nombre}</span></td>
                      <td className="muted-2">
                        {attr.valores.length === 0 ? (
                          <span className="muted small">sin valores</span>
                        ) : (
                          attr.valores.map((v) => v.valor).join(", ")
                        )}
                      </td>
                      <td style={{ width: 200 }}></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          <button
            type="button"
            className="btn primary sm"
            onClick={() => { setShowCreateAttrModal(true); setCreateAttrNombre(""); setCreateAttrValores(""); }}
          >
            + Crear nuevo atributo
          </button>
          <span style={{ margin: "0 8px" }} />
          <button
            type="button"
            className="btn ghost sm"
            onClick={() => { setShowAddGlobalModal(true); setGlobalAttrSearch(""); }}
          >
            + Agregar atributo global ▾
          </button>
        </div>
      )}

      {/* --- Modal: Crear atributo --- */}
      {showCreateAttrModal && (
        <div className="modal-overlay" onClick={() => setShowCreateAttrModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Crear atributo</h3>
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
              <button
                type="button"
                className="btn ghost"
                onClick={() => setShowCreateAttrModal(false)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn primary"
                onClick={crearAtributo}
                disabled={savingAttr || !createAttrNombre.trim()}
              >
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
            <p className="muted small" style={{ margin: "0 0 12px" }}>
              Los valores definen las opciones disponibles en el storefront.
            </p>

            <div style={{ marginBottom: 12 }}>
              {editAttrValores.map((valor, i) => {
                const original = editingAttr.valores[i];
                return (
                  <div key={original?.id ?? i} className="row" style={{ marginBottom: 6 }}>
                    <span style={{ flex: 1 }}>{valor}</span>
                    <button
                      type="button"
                      className="btn ghost sm"
                      style={{ color: "red" }}
                      onClick={() => original && eliminarValor(editingAttr.id, original.id)}
                    >
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
              <input
                value={newValor}
                onChange={(e) => setNewValor(e.target.value)}
                placeholder="Nuevo valor"
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), agregarValor())}
              />
              <button type="button" className="btn ghost sm" onClick={agregarValor} disabled={!newValor.trim()}>
                Agregar
              </button>
            </div>

            <div className="row" style={{ gap: 8 }}>
              <button
                type="button"
                className="btn"
                style={{ color: "red" }}
                onClick={() => { desasignarAtributo(editingAttr.id); setEditingAttr(null); }}
              >
                Desasignar del producto
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => setEditingAttr(null)}
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- Modal: Agregar atributo global --- */}
      {showAddGlobalModal && (
        <div className="modal-overlay" onClick={() => setShowAddGlobalModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ minWidth: 400 }}>
            <h3>Agregar atributo global</h3>
            <p className="muted small" style={{ margin: "0 0 12px" }}>
              Solo se muestran atributos no asignados a este producto.
            </p>
            <input
              value={globalAttrSearch}
              onChange={(e) => setGlobalAttrSearch(e.target.value)}
              placeholder="Buscar atributo..."
              autoFocus
              style={{ marginBottom: 12 }}
            />
            <div style={{ maxHeight: 300, overflowY: "auto", border: "1px solid var(--line)", borderRadius: 4, padding: 8 }}>
              {atributos
                .filter((a) => {
                  const assignedIds = [...propios, ...heredados].map((p) => p.id);
                  if (assignedIds.includes(a.id)) return false;
                  if (!globalAttrSearch) return true;
                  return a.nombre.toLowerCase().includes(globalAttrSearch.toLowerCase());
                })
                .map((attr) => (
                  <div key={attr.id} className="row" style={{ marginBottom: 8, alignItems: "center" }}>
                    <span style={{ flex: 1 }}>
                      <strong>{attr.nombre}</strong>
                      <span className="muted"> — {attr.valores.length} valores</span>
                    </span>
                    <button
                      type="button"
                      className="btn ghost sm"
                      onClick={() => asignarAtributoGlobal(attr.id)}
                      disabled={asigningAttr}
                    >
                      Asignar
                    </button>
                  </div>
                ))}
              {atributos.filter((a) => {
                const assignedIds = [...propios, ...heredados].map((p) => p.id);
                if (assignedIds.includes(a.id)) return false;
                if (!globalAttrSearch) return true;
                return a.nombre.toLowerCase().includes(globalAttrSearch.toLowerCase());
              }).length === 0 && (
                <p className="muted small" style={{ textAlign: "center", padding: 16 }}>
                  No hay atributos disponibles para asignar.
                </p>
              )}
            </div>
            <button
              type="button"
              className="btn"
              style={{ marginTop: 12 }}
              onClick={() => setShowAddGlobalModal(false)}
            >
              Cerrar
            </button>
          </div>
        </div>
      )}

      {/* --- Lista de materiales (BOM) --- */}
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Lista de materiales (BOM)</h3>
        <div className="inline-form">
          <label>
            Agregar componente (variante)
            <input value={buscaComp} onChange={(e) => buscarComponentes(e.target.value)} placeholder="Buscar por nombre o SKU…" />
          </label>
        </div>
        {resultComp.length > 0 && (
          <div className="card" style={{ margin: "8px 0", padding: 8 }}>
            {resultComp.slice(0, 6).map((v) => (
              <button key={v.id} type="button" className="btn ghost sm" style={{ margin: 4 }} onClick={() => agregarComp(v)}>
                + {v.producto} · {v.nombre} ({v.sku})
              </button>
            ))}
          </div>
        )}
        <div className="card" style={{ padding: 0, overflow: "hidden", margin: "12px 0" }}>
          <table className="table">
            <thead>
              <tr>
                <th>Componente</th>
                <th>Cantidad</th>
                <th>Tipo</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {bomRows.map((r, i) => (
                <tr key={`${r.componentId}-${i}`}>
                  <td>{r.nombre}</td>
                  <td>
                    <input type="number" step="0.001" value={r.cantidad}
                      style={{ width: 100 }}
                      onChange={(e) => setBomRows(bomRows.map((x, j) => j === i ? { ...x, cantidad: Number(e.target.value) } : x))}
                    />
                  </td>
                  <td>
                    <select value={r.tipo} onChange={(e) => setBomRows(bomRows.map((x, j) => j === i ? { ...x, tipo: e.target.value } : x))}>
                      <option value="exacto">exacto (se consume al ensamblar)</option>
                      <option value="consumible">consumible (solo vigilado por umbral)</option>
                    </select>
                  </td>
                  <td>
                    <button type="button" className="btn ghost sm" onClick={() => setBomRows(bomRows.filter((_, j) => j !== i))}>Quitar</button>
                  </td>
                </tr>
              ))}
              {bomRows.length === 0 && (
                <tr><td colSpan={4} className="empty">Sin componentes todavía.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <button type="button" className="btn primary" onClick={guardarBom}>Guardar BOM</button>
        <span className="muted small"> El tipo "exacto" se descuenta del stock al registrar un ensamble; el "consumible" solo genera alerta de umbral.</span>
      </div>

      {/* --- Variantes --- */}
      <div className="card">
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ marginTop: 0, marginBottom: 0 }}>Variantes</h3>
          <button type="button" className="btn primary sm" onClick={() => setShowNuevaVariante(!showNuevaVariante)}>
            {showNuevaVariante ? "Cerrar" : "+ Nueva variante"}
          </button>
        </div>

        {showNuevaVariante && (
          <form onSubmit={crearVariante} className="card" style={{ marginTop: 12, background: "#fafafa" }}>
            <div className="row">
              <label style={{ flex: 1 }}>
                Nombre de la variante
                <input value={nuevaVarNombre} onChange={(e) => setNuevaVarNombre(e.target.value)} placeholder="ej. Taparrosca 13mm" required />
              </label>
              <label style={{ flex: 1 }}>
                SKU
                <input value={nuevaVarSku} onChange={(e) => setNuevaVarSku(e.target.value)} placeholder="ej. TP-13" required />
              </label>
              <button type="submit" className="btn primary sm" disabled={guardandoVar} style={{ alignSelf: "flex-end" }}>
                {guardandoVar ? "Creando…" : "Crear"}
              </button>
            </div>
          </form>
        )}

        {d.hasVariants && grid && grid.ejes.length > 0 && (
          <div className="card" style={{ marginTop: 12, background: "#fafafa" }}>
            <p style={{ margin: "0 0 8px", fontWeight: 600 }}>Materializar combinación</p>
            <p className="muted small" style={{ margin: "0 0 12px" }}>
              Elige un valor por atributo para materializar esa variante específica.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginBottom: 12 }}>
              {ejesGrid.map((eje) => (
                <label key={eje.attributeId} style={{ display: "block" }}>
                  {eje.nombre}
                  <select
                    style={{ width: "100%", marginTop: 4 }}
                    value={selValores[eje.attributeId] ?? ""}
                    onChange={(ev) =>
                      setSelValores((prev) => {
                        const next = { ...prev };
                        const vid = ev.target.value === "" ? undefined : Number(ev.target.value);
                        if (vid === undefined) delete next[eje.attributeId];
                        else next[eje.attributeId] = vid;
                        return next;
                      })
                    }
                  >
                    <option value="">— Elegir —</option>
                    {eje.valores.map((v) => (
                      <option key={v.id} value={v.id}>{v.valor}</option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
            {faltantesGrid > 0 ? (
              <p className="muted small">
                Faltan {faltantesGrid} atributo(s) por elegir para formar una combinación.
              </p>
            ) : comboSeleccionado ? (
              <div className="row" style={{ alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <div>
                  <strong>{comboSeleccionado.valoracion.join(" · ")}</strong>
                  <div className="muted-2 small" style={{ fontFamily: "monospace" }}>{comboSeleccionado.sku}</div>
                </div>
                <div style={{ flex: 1 }} />
                {comboSeleccionado.varianteId ? (
                  <span className="badge normal">creada</span>
                ) : (
                  <button
                    type="button"
                    className="btn primary sm"
                    style={{ flex: 0 }}
                    onClick={() => materializar(comboSeleccionado)}
                  >
                    Materializar esta variante
                  </button>
                )}
              </div>
            ) : (
              <p className="muted small">No se encontró esa combinación.</p>
            )}
          </div>
        )}

        <div className="spacer" />
        <div className="card" style={{ padding: 0, overflow: "hidden", margin: 0 }}>
          <table className="table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>SKU</th>
                <th>Atributos</th>
                <th>Stock</th>
                <th>Publicada</th>
                <th>Crítico</th>
              </tr>
            </thead>
            <tbody>
              {d.variantes.map((v) => (
                <tr key={v.id}>
                  <td>
                    {editNombreVid === v.id ? (
                      <input
                        value={editNombreVal}
                        onChange={(e) => setEditNombreVal(e.target.value)}
                        onBlur={() => guardarNombreVariante(v)}
                        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                        autoFocus
                        style={{ width: 160 }}
                      />
                    ) : (
                      <span
                        onClick={() => iniciarEditNombre(v)}
                        style={{ cursor: "pointer" }}
                        title="Clic para editar nombre"
                      >
                        {v.nombre}
                      </span>
                    )}
                  </td>
                  <td className="muted-2">{v.sku}</td>
                  <td>
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                      {(v.valoracion ?? []).map((a) => (
                        <span key={a.attributeId} className="kbd-chip">{a.attribute}: {a.valor}</span>
                      ))}
                      {((v.valoracion ?? []).length === 0) && (
                        <span className="muted small">variante única</span>
                      )}
                    </div>
                  </td>
                  <td>{v.stockActual} {d.uom}</td>
                  <td>
                    <input type="checkbox" checked={v.published} onChange={() => toggle(v, "published")} style={{ width: "auto" }} />
                  </td>
                  <td>
                    <input type="checkbox" checked={v.longLead} onChange={() => toggle(v, "longLead")} style={{ width: "auto" }} />
                  </td>
                </tr>
              ))}
              {d.variantes.length === 0 && (
                <tr><td colSpan={6} className="empty">Sin variantes. Crea una desde el grid de combinaciones arriba.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="muted small" style={{ marginTop: 8 }}>
          Clic en el nombre para editar. Los precios se gestionan desde la app de cotizaciones.
        </p>
      </div>

      {/* --- Empaques por variante --- */}
      <EmpaquesPorVariante
        variantes={d.variantes}
        empaques={empaques}
        uom={d.uom}
        notify={notify}
        onEmpaqueCreado={refrescarEmpaques}
      />
    </AppShell>
  );
}