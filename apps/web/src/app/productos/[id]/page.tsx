"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import AppShell from "@/components/app-shell";
import { api } from "@/lib/api";
import type { Atributo, Categoria, Grid, GridCombo, Packaging, ProductoDetalle, Variante } from "@/lib/types";

interface BomRow {
  componentId: number;
  nombre: string;
  cantidad: number;
  tipo: string;
}

interface EmpaqueRow {
  packagingId: number;
  nombre: string;
  cantidad: string;
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

  const cargar = useCallback(async () => {
    const [pd, g] = await Promise.all([
      api<ProductoDetalle>(`/productos/${prodId}`),
      api<Grid | { ejes: never[]; combinaciones: never[] }>(`/productos/${prodId}/grid`),
    ]);
    setD(pd);
    setGrid(g);
  }, [prodId]);

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

  // ------------------------------------------------------------------ Ejes
  const [ejesSel, setEjesSel] = useState<number[]>([]);
  const [nuevoEje, setNuevoEje] = useState("");
  const [showMasCombinaciones, setShowMasCombinaciones] = useState(false);

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

  async function generarTodas() {
    try {
      const r = await api<{ creadas: number }>(`/productos/${prodId}/generar`, { method: "POST" });
      await cargar();
      notify(null, `Se crearon ${r.creadas} variante(s) con empaques heredados.`);
    } catch (e) { notify(e as Error, ""); }
  }

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

  // ------------------------------------------------------- Empaques
  const [empRows, setEmpRows] = useState<Record<number, EmpaqueRow[]>>({});
  const [empInit, setEmpInit] = useState<number | null>(null);
  const [nuevoEmpaque, setNuevoEmpaque] = useState<Record<number, string>>({});
  const [nuevaCantidad, setNuevaCantidad] = useState<Record<number, string>>({});
  const [nuevoEmpNombre, setNuevoEmpNombre] = useState("");
  const [creandoEmp, setCreandoEmp] = useState(false);

  useEffect(() => {
    if (d && d.id !== empInit) {
      const rows: Record<number, EmpaqueRow[]> = {};
      for (const v of d.variantes) {
        rows[v.id] = (v.packagings ?? []).map((p) => ({
          packagingId: p.packagingId,
          nombre: p.nombre,
          cantidad: String(p.cantidad),
        }));
      }
      setEmpRows(rows);
      setEmpInit(d.id);
    }
  }, [d, empInit]);

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
      setEmpaques(await api<Packaging[]>("/catalogos/empaques"));
      setNuevoEmpNombre("");
      notify(null, `Empaque "${nombre}" creado.`);
    } catch (e) { notify(e as Error, ""); }
    finally { setCreandoEmp(false); }
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

      {/* --- Ejes del grid (solo si tiene variantes) --- */}
      {d.hasVariants && (
        <div className="card">
          <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
            <h3 style={{ marginTop: 0, marginBottom: 0 }}>Ejes del grid</h3>
            <button
              className="btn ghost sm"
              onClick={() => setShowMasCombinaciones(!showMasCombinaciones)}
            >
              {showMasCombinaciones ? "Ocultar combinaciones" : "Más combinaciones"}
            </button>
          </div>
          <p className="muted small" style={{ margin: "4px 0 12px" }}>
            Los ejes definen las combinaciones de variantes. Al guardar, las combinaciones no materializadas aparecerán en "Más combinaciones".
          </p>
          {ejesSel.map((attrId, i) => {
            const nombre = atributos.find((a) => a.id === attrId)?.nombre ?? `#${attrId}`;
            return (
              <div key={attrId} className="row" style={{ marginBottom: 8 }}>
                <span>{i + 1}. {nombre}</span>
                <button type="button" className="btn ghost sm" onClick={() => setEjesSel(ejesSel.filter((x) => x !== attrId))}>
                  Quitar
                </button>
              </div>
            );
          })}
          <div className="inline-form" style={{ marginTop: 8 }}>
            <select value={nuevoEje} onChange={(e) => setNuevoEje(e.target.value)}>
              <option value="">Agregar atributo…</option>
              {atributos.filter((a) => !ejesSel.includes(a.id)).map((a) => (
                <option key={a.id} value={a.id}>{a.nombre}</option>
              ))}
            </select>
            <button type="button" className="btn ghost sm" onClick={() => { if (nuevoEje) { setEjesSel([...ejesSel, Number(nuevoEje)]); setNuevoEje(""); } }}>
              Agregar
            </button>
            <button type="button" className="btn primary sm" onClick={guardarEjes}>Guardar ejes</button>
          </div>
        </div>
      )}

      {/* --- Más combinaciones (expandible) --- */}
      {d.hasVariants && showMasCombinaciones && grid && grid.ejes.length > 0 && (
        <div className="card">
          <div className="row">
            <h3 style={{ marginTop: 0, marginBottom: 0 }}>Combinaciones ({grid.combinaciones.length})</h3>
            <button type="button" className="btn primary sm" style={{ flex: 0 }} onClick={generarTodas}>
              Materializar todas
            </button>
          </div>
          <div className="spacer" />
          <div className="card" style={{ padding: 0, overflow: "hidden", margin: 0 }}>
            <table className="table" style={{ margin: 0 }}>
              <thead>
                <tr>
                  <th>Combinación</th>
                  <th>SKU</th>
                  <th>Estado</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {grid.combinaciones.map((c) => (
                  <tr key={c.sku}>
                    <td>{c.valoracion.join(" · ")}</td>
                    <td className="muted-2">{c.sku}</td>
                    <td>
                      {c.varianteId ? (
                        <span className="badge normal">creada</span>
                      ) : (
                        <span className="badge bajo">sin crear</span>
                      )}
                    </td>
                    <td>
                      {!c.varianteId && (
                        <button type="button" className="btn ghost sm" onClick={() => materializar(c)}>
                          Materializar
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
      <div className="card">
        <div className="row">
          <h3 style={{ marginTop: 0, marginBottom: 0 }}>Empaques por variante</h3>
          <span className="muted small" style={{ flex: 1 }}>
            ¿Cuántas piezas caben en cada empaque? Los nuevos empaques se heredan del producto padre.
          </span>
        </div>
        <div className="spacer" />
        {d.variantes.map((v, vi) => (
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
    </AppShell>
  );
}