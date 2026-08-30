"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import AppShell from "@/components/app-shell";
import { api } from "@/lib/api";
import type { Atributo, Categoria, Grid, GridCombo, ProductoDetalle, Variante } from "@/lib/types";

interface BomRow {
  componentId: number;
  nombre: string;
  cantidad: number;
  tipo: string;
}

export default function ProductoDetallePage() {
  const { id } = useParams<{ id: string }>();
  const prodId = Number(id);
  const [d, setD] = useState<ProductoDetalle | null>(null);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [atributos, setAtributos] = useState<Atributo[]>([]);
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
  }, []);

  useEffect(() => {
    cargar().catch((e) => setError(e.message));
  }, [cargar]);

  const notify = (e: Error | null, okMsg: string) => {
    if (e) {
      setError(e.message);
      setMsg("");
    } else {
      setError("");
      setMsg(okMsg);
    }
  };

  // ------------------------------------------------------------- Datos base
  const [nombreEdit, setNombreEdit] = useState<string | null>(null);
  const [precioEdit, setPrecioEdit] = useState<string | null>(null);

  async function guardarBase(campos: Record<string, unknown>) {
    try {
      await api(`/productos/${prodId}`, { method: "PATCH", body: JSON.stringify(campos) });
      await cargar();
      setNombreEdit(null);
      setPrecioEdit(null);
      notify(null, "Producto actualizado.");
    } catch (e) {
      notify(e as Error, "");
    }
  }

  // ------------------------------------------------------------------ Ejes
  const [ejesSel, setEjesSel] = useState<number[]>([]);
  const [nuevoEje, setNuevoEje] = useState("");

  async function guardarEjes() {
    try {
      const ejes = ejesSel.map((attributeId, i) => ({ attributeId, sortOrder: i }));
      await api(`/productos/${prodId}/ejes`, { method: "PUT", body: JSON.stringify({ ejes }) });
      await cargar();
      notify(null, "Ejes del grid guardados.");
    } catch (e) {
      notify(e as Error, "");
    }
  }

  useEffect(() => {
    if (d && grid) {
      const current = grid.ejes.map((e) => e.attributeId);
      setEjesSel(current);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d, grid]);

  // ---------------------------------------------------------------- Grid
  async function materializar(combo: GridCombo) {
    try {
      await api(`/productos/${prodId}/materializar`, {
        method: "POST",
        body: JSON.stringify({ valueIds: combo.valueIds }),
      });
      await cargar();
      notify(null, `Variante "${combo.nombre}" creada.`);
    } catch (e) {
      notify(e as Error, "");
    }
  }

  async function generarTodas() {
    try {
      const r = await api<{ creadas: number }>(`/productos/${prodId}/generar`, { method: "POST" });
      await cargar();
      notify(null, `Se crearon ${r.creadas} variante(s).`);
    } catch (e) {
      notify(e as Error, "");
    }
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
    if (!q.trim()) {
      setResultComp([]);
      return;
    }
    const r = await api<{ id: number; nombre: string; sku: string; producto: string }[]>(`/productos/variantes?search=${encodeURIComponent(q)}`);
    setResultComp(r);
  }

  function agregarComp(v: { id: number; nombre: string; sku: string; producto: string }) {
    setBomRows((rows) => [
      ...rows,
      { componentId: v.id, nombre: `${v.producto} · ${v.nombre}`, cantidad: 1, tipo: "exacto" },
    ]);
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
    } catch (e) {
      notify(e as Error, "");
    }
  }

  // ------------------------------------------------------------- Variantes
  const [precioVar, setPrecioVar] = useState<Record<number, string>>({});
  const [minVar, setMinVar] = useState<Record<number, string>>({});
  const [maxVar, setMaxVar] = useState<Record<number, string>>({});

  async function setPrecio(v: Variante) {
    const val = precioVar[v.id];
    if (val === undefined || val === "") return;
    try {
      await api(`/productos/variantes/${v.id}/precio`, {
        method: "PATCH",
        body: JSON.stringify({ price: Number(val) }),
      });
      await cargar();
      notify(null, `Precio de ${v.sku} actualizado.`);
    } catch (e) {
      notify(e as Error, "");
    }
  }

  async function setUmbrales(v: Variante, campos: { stockMin?: string; stockMax?: string }) {
    try {
      const body: Record<string, number> = {};
      if (campos.stockMin !== undefined) body.stockMin = Number(campos.stockMin);
      if (campos.stockMax !== undefined) body.stockMax = Number(campos.stockMax);
      await api(`/productos/variantes/${v.id}`, { method: "PATCH", body: JSON.stringify(body) });
      await cargar();
      notify(null, "Umbrales actualizados.");
    } catch (e) {
      notify(e as Error, "");
    }
  }

  async function toggle(v: Variante, campo: "published" | "longLead" | "activo") {
    try {
      await api(`/productos/variantes/${v.id}`, {
        method: "PATCH",
        body: JSON.stringify({ [campo]: !v[campo] }),
      });
      await cargar();
      notify(null, "Variante actualizada.");
    } catch (e) {
      notify(e as Error, "");
    }
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
      <p>
        <Link href="/productos">← Productos</Link>
      </p>
      {error && <div className="error">{error}</div>}
      {msg && <div className="msg-ok">{msg}</div>}

      <h2>
        {nombreEdit !== null ? (
          <input
            value={nombreEdit}
            onChange={(e) => setNombreEdit(e.target.value)}
            onBlur={() => nombreEdit.trim() && guardarBase({ nombre: nombreEdit.trim() })}
            onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
            autoFocus
          />
        ) : (
          <span onClick={() => setNombreEdit(d.nombre)} style={{ cursor: "pointer" }} title="Clic para editar">
            {d.nombre}
          </span>
        )}
      </h2>
      <p className="muted small">SKU base: {d.skuBase} · UOM: {d.uom} · HasVariants: {d.hasVariants ? "sí" : "no"}</p>

      <div className="card">
        <div className="row">
          <label>
            Categoría
            <select value={d.categoryId ?? ""} onChange={(e) => guardarBase({ categoryId: e.target.value ? Number(e.target.value) : null })}>
              <option value="">—</option>
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </label>
          <label>
            Precio base (neto)
            <input
              type="number"
              step="0.01"
              value={precioEdit ?? d.basePrice}
              onChange={(e) => setPrecioEdit(e.target.value)}
              onBlur={() => precioEdit !== null && guardarBase({ basePrice: Number(precioEdit) })}
            />
          </label>
        </div>
      </div>

      {d.hasVariants && (
        <>
          <div className="card">
            <h3 style={{ marginTop: 0 }}>Ejes del grid</h3>
            <p className="muted small">Los ejes definen las combinaciones de variantes del combo.</p>
            {ejesSel.map((attrId, i) => {
              const nombre = atributos.find((a) => a.id === attrId)?.nombre ?? `#${attrId}`;
              return (
                <div key={attrId} className="row" style={{ marginBottom: 8 }}>
                  <span>
                    {i + 1}. {nombre}
                  </span>
                  <button type="button" className="btn ghost small" onClick={() => setEjesSel(ejesSel.filter((x) => x !== attrId))}>
                    Quitar
                  </button>
                </div>
              );
            })}
            {ejesSel.length === 0 && <p className="empty">Sin ejes: el producto tendrá una variante única.</p>}
            <div className="inline-form" style={{ marginTop: 8 }}>
              <select value={nuevoEje} onChange={(e) => setNuevoEje(e.target.value)}>
                <option value="">Agregar atributo…</option>
                {atributos
                  .filter((a) => !ejesSel.includes(a.id))
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.nombre}
                    </option>
                  ))}
              </select>
              <button
                type="button"
                className="btn ghost"
                onClick={() => {
                  if (nuevoEje) {
                    setEjesSel([...ejesSel, Number(nuevoEje)]);
                    setNuevoEje("");
                  }
                }}
              >
                Agregar
              </button>
              <button type="button" className="btn primary" style={{ flex: 0 }} onClick={guardarEjes}>
                Guardar ejes
              </button>
            </div>
          </div>

          {grid && grid.ejes.length > 0 && (
            <div className="card">
              <div className="row">
                <h3 style={{ marginTop: 0, marginBottom: 0 }}>Combinaciones ({grid.combinaciones.length})</h3>
                <button type="button" className="btn primary" onClick={generarTodas} style={{ flex: 0 }}>
                  Materializar todas
                </button>
              </div>
              <div className="spacer" />
              <div className="card" style={{ padding: 0, overflow: "hidden", margin: 0 }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Combinación</th>
                      <th>SKU</th>
                      <th>Estado</th>
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
                            <button type="button" className="btn ghost small" onClick={() => materializar(c)}>
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
        </>
      )}

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Lista de materiales (BOM) para ensamble</h3>
        <div className="inline-form">
          <label>
            Agregar componente (variante)
            <input value={buscaComp} onChange={(e) => buscarComponentes(e.target.value)} placeholder="Buscar por nombre o SKU…" />
          </label>
        </div>
        {resultComp.length > 0 && (
          <div className="card" style={{ margin: "8px 0", padding: 8 }}>
            {resultComp.slice(0, 6).map((v) => (
              <button key={v.id} type="button" className="btn ghost small" style={{ margin: 4 }} onClick={() => agregarComp(v)}>
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
                    <input
                      type="number"
                      step="0.001"
                      value={r.cantidad}
                      style={{ width: 100 }}
                      onChange={(e) => setBomRows(bomRows.map((x, j) => (j === i ? { ...x, cantidad: Number(e.target.value) } : x)))}
                    />
                  </td>
                  <td>
                    <select value={r.tipo} onChange={(e) => setBomRows(bomRows.map((x, j) => (j === i ? { ...x, tipo: e.target.value } : x)))}>
                      <option value="exacto">exacto (se consume al ensamblar)</option>
                      <option value="consumible">consumible (solo vigilado por umbral)</option>
                    </select>
                  </td>
                  <td>
                    <button type="button" className="btn ghost small" onClick={() => setBomRows(bomRows.filter((_, j) => j !== i))}>
                      Quitar
                    </button>
                  </td>
                </tr>
              ))}
              {bomRows.length === 0 && (
                <tr>
                  <td colSpan={4} className="empty">
                    Sin componentes todavía.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <button type="button" className="btn primary" onClick={guardarBom}>
          Guardar BOM
        </button>
        <span className="muted small"> El tipo “exacto” se descuenta del stock al registrar un ensamble; el “consumible” solo genera alerta de umbral.</span>
      </div>

      <div className="card">
        <div className="row">
          <h3 style={{ marginTop: 0, marginBottom: 0 }}>Variantes</h3>
          <Link className="btn ghost" style={{ flex: 0 }} href={`/inventario?variant=${d.variantes[0]?.id ?? ""}`}>
            Ir a inventario
          </Link>
        </div>
        <div className="spacer" />
        <div className="card" style={{ padding: 0, overflow: "hidden", margin: 0 }}>
          <table className="table">
            <thead>
              <tr>
                <th>SKU</th>
                <th>Nombre</th>
                <th>Precio</th>
                <th>Min</th>
                <th>Max</th>
                <th>Stock</th>
                <th>Publicado</th>
                <th>Crítico</th>
              </tr>
            </thead>
            <tbody>
              {d.variantes.map((v) => (
                <tr key={v.id}>
                  <td className="muted-2">{v.sku}</td>
                  <td>
                    {v.nombre}
                    <div className="small muted">{v.valoracion.map((a) => a.valor).join(" · ") || "variante única"}</div>
                  </td>
                  <td>
                    <input
                      type="number"
                      step="0.01"
                      style={{ width: 100 }}
                      placeholder="precio compra"
                      value={precioVar[v.id] ?? (v.price ?? "")}
                      onChange={(e) => setPrecioVar({ ...precioVar, [v.id]: e.target.value })}
                      onBlur={() => setPrecio(v)}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      step="0.001"
                      style={{ width: 70 }}
                      value={minVar[v.id] ?? v.stockMin}
                      onChange={(e) => setMinVar({ ...minVar, [v.id]: e.target.value })}
                      onBlur={() => minVar[v.id] !== undefined && setUmbrales(v, { stockMin: minVar[v.id] })}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      step="0.001"
                      style={{ width: 70 }}
                      value={maxVar[v.id] ?? v.stockMax}
                      onChange={(e) => setMaxVar({ ...maxVar, [v.id]: e.target.value })}
                      onBlur={() => maxVar[v.id] !== undefined && setUmbrales(v, { stockMax: maxVar[v.id] })}
                    />
                  </td>
                  <td>
                    {v.stockActual} {d.uom}
                  </td>
                  <td>
                    <input type="checkbox" checked={v.published} onChange={() => toggle(v, "published")} style={{ width: "auto" }} />
                  </td>
                  <td>
                    <input type="checkbox" checked={v.longLead} onChange={() => toggle(v, "longLead")} style={{ width: "auto" }} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}