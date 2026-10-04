"use client";

import { useCallback, useEffect, useState } from "react";
import AppShell from "@/components/app-shell";
import PageHeader from "@/components/ui/page-header";
import HelpNote from "@/components/ui/help-note";
import Modal from "@/components/ui/modal";
import Segmented from "@/components/ui/segmented";
import StickyBar from "@/components/ui/sticky-bar";
import CantidadEditable from "@/components/inventario/cantidad-editable";
import { api } from "@/lib/api";
import { descargarCSV } from "@/lib/csv";
import { useFormatCantidad } from "@/lib/preferences";
import type { Existencia, Movimiento, Ubicacion } from "@/lib/types";

type Accion = "entrada" | "salida" | "mover";
type Vista = "ubicacion" | "variante" | "variante-minmax";

export default function InventarioPage() {
  const formatCantidad = useFormatCantidad();
  const [exist, setExist] = useState<Existencia[]>([]);
  const [locs, setLocs] = useState<Ubicacion[]>([]);
  const [movs, setMovs] = useState<Movimiento[]>([]);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [vista, setVista] = useState<Vista>("variante");
  const [ubicacionFiltro, setUbicacionFiltro] = useState<number | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [productoSelId, setProductoSelId] = useState<number | null>(null);
  const [filtros, setFiltros] = useState<Record<string, Set<string>>>({});
  const [showFiltros, setShowFiltros] = useState(false);
  const [showUbiFiltro, setShowUbiFiltro] = useState(false);
  const [coincidenciasAbiertas, setCoincidenciasAbiertas] = useState(false);

  const cargar = useCallback(async () => {
    const [e, l, m] = await Promise.all([
      api<Existencia[]>("/inventario/existencia"),
      api<Ubicacion[]>("/inventario/ubicaciones"),
      api<Movimiento[]>("/inventario/movimientos?limit=15"),
    ]);
    setExist(e);
    setLocs(l);
    setMovs(m);
  }, []);

  useEffect(() => {
    cargar().catch((e) => setError(e.message));
  }, [cargar]);

  // Cierra el dropdown de búsqueda al hacer click fuera.
  useEffect(() => {
    if (!coincidenciasAbiertas) return;
    function onDown(e: MouseEvent) {
      const t = e.target as HTMLElement;
      if (!t.closest(".buscador-wrap")) setCoincidenciasAbiertas(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [coincidenciasAbiertas]);

  const notify = (e: Error | null, okMsg: string) => {
    if (e) {
      setError(e.message);
      setMsg("");
    } else {
      setError("");
      setMsg(okMsg);
      cargar().catch(() => undefined);
    }
  };

  // --------------------------------------------------------------- Acciones
  const [accion, setAccion] = useState<Accion | null>(null);
  const [selId, setSelId] = useState<number | null>(null);
  const [cantidad, setCantidad] = useState("");
  const [ubiId, setUbiId] = useState("");
  const [ref, setRef] = useState("");
  const [origen, setOrigen] = useState("");
  const [destino, setDestino] = useState("");
  const [cargando, setCargando] = useState(false);

  function abrir(a: Accion, variantId?: number) {
    setAccion(a);
    setSelId(variantId ?? null);
    setCantidad("");
    setRef("");
    setUbiId(String(locs[0]?.id ?? ""));
    setOrigen(String(locs[0]?.id ?? ""));
    setDestino(String(locs[1]?.id ?? locs[0]?.id ?? ""));
    setError("");
    setMsg("");
  }

  function cerrarAccion() {
    setAccion(null);
    setSelId(null);
  }

  async function ejecutar(e: React.FormEvent) {
    e.preventDefault();
    if (selId === null) {
      setError("Selecciona una variante.");
      return;
    }
    setCargando(true);
    setError("");
    try {
      const qty = Number(cantidad);
      if (accion === "entrada" || accion === "salida") {
        if (!Number.isFinite(qty) || qty <= 0) {
          setError("La cantidad debe ser mayor a 0.");
          return;
        }
        if (accion === "salida") {
          const disponible = exist.find((x) => x.variantId === selId)?.porUbicacion[Number(ubiId)]?.qty ?? 0;
          if (qty > disponible) {
            setError(`Stock insuficiente en la ubicación: hay ${formatCantidad(disponible)} y se intentan sacar ${formatCantidad(qty)}.`);
            return;
          }
        }
        await api("/inventario/movimiento", {
          method: "POST",
          body: JSON.stringify({
            variantId: selId,
            locationId: Number(ubiId),
            motivo: accion,
            cantidad: accion === "salida" ? -qty : qty,
            ref: ref || undefined,
          }),
        });
        notify(null, accion === "entrada" ? "Entrada registrada." : "Salida registrada.");
      } else if (accion === "mover") {
        await api("/inventario/mover", {
          method: "POST",
          body: JSON.stringify({ variantId: selId, fromLocationId: Number(origen), toLocationId: Number(destino), cantidad: qty, ref: ref || undefined }),
        });
        notify(null, "Transferencia registrada.");
      }
      cerrarAccion();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCargando(false);
    }
  }

  // ---------------------------------------------------------- Ajuste por celda
  async function ajustar(variantId: number, locationId: number, nuevaCantidad: number) {
    try {
      const r = await api<{ resultado: { delta: number; sinCambio: boolean } }>("/inventario/ajuste", {
        method: "POST",
        body: JSON.stringify({ variantId, locationId, nuevaCantidad }),
      });
      if (r.resultado.sinCambio) notify(null, "Sin cambios.");
      else notify(null, `Ajuste registrado (${r.resultado.delta > 0 ? "+" : ""}${formatCantidad(r.resultado.delta)}).`);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  // -------------------------------------------------- Editar mín/máx variante
  async function guardarMinMax(variantId: number, patch: { stockMin?: number; stockMax?: number }) {
    try {
      await api(`/inventario/variantes/${variantId}/minmax`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
      notify(null, "Mín/máx actualizado.");
    } catch (e) {
      setError((e as Error).message);
    }
  }

  // ---------------------------------------------------------- Nueva ubicación
  const [showUbi, setShowUbi] = useState(false);
  const [ubiNombre, setUbiNombre] = useState("");
  const [ubiTipo, setUbiTipo] = useState("almacen");

  async function crearUbicacion(e: React.FormEvent) {
    e.preventDefault();
    if (!ubiNombre.trim()) return;
    try {
      await api("/inventario/ubicaciones", { method: "POST", body: JSON.stringify({ nombre: ubiNombre.trim(), tipo: ubiTipo }) });
      setShowUbi(false);
      setUbiNombre("");
      notify(null, "Ubicación creada.");
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const seleccion = exist.find((x) => x.variantId === selId);
  const disponible = seleccion?.porUbicacion[Number(ubiId)]?.qty ?? 0;

  // ------------------------------------------------- Filtro producto/atributos
  // Productos disponibles (para el autocompletado del buscador).
  const productos = (() => {
    const map = new Map<number, { productoId: number; producto: string; uom: string; variantes: number }>();
    for (const v of exist) {
      let g = map.get(v.productoId);
      if (!g) { g = { productoId: v.productoId, producto: v.producto, uom: v.uom, variantes: 0 }; map.set(v.productoId, g); }
      g.variantes += 1;
    }
    return [...map.values()].sort((a, b) => a.producto.localeCompare(b.producto));
  })();

  const coincidenciasProducto = (() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return [];
    return productos.filter((p) => p.producto.toLowerCase().includes(q)).slice(0, 8);
  })();

  const productoSel = productos.find((p) => p.productoId === productoSelId) ?? null;

  // Atributos del producto seleccionado (atributo → valores presentes).
  const atributosProducto = (() => {
    if (!productoSel) return [] as { attribute: string; valores: string[] }[];
    const map = new Map<string, Set<string>>();
    for (const v of exist) {
      if (v.productoId !== productoSel.productoId) continue;
      for (const a of v.valoracion) {
        const s = map.get(a.attribute) ?? new Set<string>();
        s.add(a.valor);
        map.set(a.attribute, s);
      }
    }
    return [...map.entries()]
      .map(([attribute, set]) => ({ attribute, valores: [...set].sort() }))
      .sort((a, b) => a.attribute.localeCompare(b.attribute));
  })();

  const seleccionarProducto = (productoId: number) => {
    setProductoSelId(productoId);
    setBusqueda("");
    setCoincidenciasAbiertas(false);
    setFiltros({});
    setShowFiltros(true);
  };

  const limpiarFiltro = () => {
    setProductoSelId(null);
    setFiltros({});
    setBusqueda("");
    setShowFiltros(false);
  };

  const toggleValor = (attribute: string, valor: string) => {
    setFiltros((prev) => {
      const set = new Set(prev[attribute] ?? []);
      if (set.has(valor)) set.delete(valor);
      else set.add(valor);
      const next = { ...prev };
      if (set.size === 0) delete next[attribute];
      else next[attribute] = set;
      return next;
    });
  };

  const nFiltrosActivos = Object.values(filtros).reduce((a, s) => a + s.size, 0);

  const pasaFiltro = (v: Existencia) => {
    if (!productoSel) return true;
    if (v.productoId !== productoSel.productoId) return false;
    for (const [attribute, valores] of Object.entries(filtros)) {
      const tiene = v.valoracion.some((a) => a.attribute === attribute && valores.has(a.valor));
      if (!tiene) return false;
    }
    return true;
  };

  const filtradas = exist.filter(pasaFiltro);
  const qtyEn = (v: Existencia, locId: number) => v.porUbicacion[locId]?.qty ?? 0;
  const grupos = filtradas
    .map((v) => ({
      v,
      filas: locs.map((l) => ({ l, qty: qtyEn(v, l.id) })).filter((f) => f.qty > 0),
    }))
    .filter((g) => g.filas.length > 0);

  // Vista "Por ubicación": la ubicación encabeza y agrupa sus variantes.
  const gruposUbicacion = locs
    .map((l) => ({
      l,
      filas: filtradas.map((v) => ({ v, qty: qtyEn(v, l.id) })).filter((f) => f.qty > 0),
    }))
    .filter((g) => g.filas.length > 0)
    .filter((g) => ubicacionFiltro === null || g.l.id === ubicacionFiltro);

  // ---------------------------------------------------------- Exportar CSV
  const celdaVariante = (v: Existencia) =>
    [v.producto, ...v.valoracion.map((a) => `${a.attribute} ${a.valor}`)].join(" · ");

  function exportar() {
    const filas: (string | number)[][] = [];
    if (vista === "ubicacion") {
      filas.push(["Ubicación", "SKU", "Producto / Variante", "Cantidad"]);
      for (const g of gruposUbicacion) {
        for (const f of g.filas) filas.push([g.l.nombre, f.v.sku, celdaVariante(f.v), f.qty]);
      }
      descargarCSV("inventario-por-ubicacion.csv", filas);
    } else if (vista === "variante") {
      filas.push(["Producto / Variante", "SKU", "Ubicación", "Cantidad"]);
      for (const g of grupos) {
        for (const f of g.filas) filas.push([celdaVariante(g.v), g.v.sku, f.l.nombre, f.qty]);
      }
      descargarCSV("inventario-por-variante.csv", filas);
    } else if (vista === "variante-minmax") {
      filas.push(["Producto / Variante", "SKU", "Stock", "Mín", "Máx", "Ubicaciones"]);
      for (const v of filtradas) {
        const ubic = Object.values(v.porUbicacion).map((l) => `${l.location}: ${l.qty}`).join(" · ");
        filas.push([celdaVariante(v), v.sku, v.stockActual, v.stockMin, v.stockMax, ubic]);
      }
      descargarCSV("inventario-por-variante-min-max.csv", filas);
    }
  }

  return (
    <AppShell>
      {error && <div className="error">{error}</div>}
      {msg && <div className="msg-ok">{msg}</div>}

      <PageHeader
        title="Inventario"
        subtitle="Existencia por producto y ubicación. Registra entradas, salidas y transferencias."
        actions={
          <>
            <button className="btn secondary sm" onClick={exportar}>
              Exportar CSV
            </button>
            <button className="btn ghost sm" onClick={() => setShowUbi(true)}>
              + Ubicación
            </button>
          </>
        }
      />

      <HelpNote closable>
        Las alertas de bajo stock se disparan <strong>al momento</strong> de cada movimiento. Para un{" "}
        <strong>ajuste</strong> (conteo físico), haz clic en la cantidad en <strong>Por ubicación</strong> o{" "}
        <strong>Por variante</strong> y escribe la cantidad real: se registra la diferencia. El stock no puede
        quedar por debajo de cero. En <strong>Min Max</strong> puedes editar el mínimo y el máximo de cada variante.
      </HelpNote>

      <StickyBar>
      <div className="toolbar">
        <button className="btn primary" onClick={() => abrir("entrada")}>
          + Entrada
        </button>
        <button className="btn secondary" onClick={() => abrir("salida")}>
          − Salida
        </button>
        <button className="btn secondary" onClick={() => abrir("mover")}>
          Transferir
        </button>
        <div className="grow" />
        {productoSel ? (
          <span className="filtro-activo">
            <strong>{productoSel.producto}</strong>
            {nFiltrosActivos > 0 && <span className="muted"> · {nFiltrosActivos} filtro(s)</span>}
            <button type="button" className="btn ghost sm" onClick={() => setShowFiltros(true)}>Atributos</button>
            <button type="button" className="btn ghost sm" onClick={limpiarFiltro} aria-label="Quitar filtro">×</button>
          </span>
        ) : (
          <div className="buscador-wrap">
            <input
              value={busqueda}
              onChange={(e) => { setBusqueda(e.target.value); setCoincidenciasAbiertas(true); }}
              onFocus={() => setCoincidenciasAbiertas(true)}
              placeholder="Buscar producto…"
              style={{ maxWidth: 300 }}
            />
            {coincidenciasAbiertas && coincidenciasProducto.length > 0 && (
              <ul className="buscador-lista">
                {coincidenciasProducto.map((p) => (
                  <li key={p.productoId}>
                    <button type="button" onClick={() => seleccionarProducto(p.productoId)}>
                      {p.producto} <span className="muted small">({p.variantes})</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        {vista === "ubicacion" && (
          <button type="button" className="btn secondary sm" onClick={() => setShowUbiFiltro(true)}>
            {ubicacionFiltro === null
              ? "Filtrar ubicación"
              : `Ubicación: ${locs.find((l) => l.id === ubicacionFiltro)?.nombre ?? ""}`}
          </button>
        )}
        <Segmented
          value={vista}
          onChange={(v) => setVista(v as Vista)}
          options={[
            { value: "ubicacion", label: "Por ubicación" },
            { value: "variante", label: "Por variante" },
            { value: "variante-minmax", label: "Min Max" },
          ]}
        />
      </div>
      </StickyBar>

      <div className="card" style={{ padding: 0 }}>
        <div className="table-wrap">
          {vista === "variante-minmax" ? (
            <table className="table">
              <thead>
                <tr>
                  <th>Producto / Variante</th>
                  <th className="num">Stock</th>
                  <th className="num">Mín</th>
                  <th className="num">Máx</th>
                  <th>Ubicaciones</th>
                </tr>
              </thead>
              <tbody>
                {filtradas.map((v) => (
                  <tr key={v.variantId}>
                    <td>
                      <strong>
                        {v.producto} <span className="muted">({v.uom})</span>
                      </strong>
                      <div className="attr-list">
                        {v.valoracion.length > 0
                          ? v.valoracion.map((a) => (
                              <span key={a.attribute} className="attr-item">
                                <span className="attr-name">{a.attribute}</span> {a.valor}
                              </span>
                            ))
                          : <span className="muted small">—</span>}
                      </div>
                    </td>
                    <td className="num">
                      <strong>{formatCantidad(v.stockActual)}</strong>
                    </td>
                    <td className="num">
                      <CantidadEditable
                        value={v.stockMin}
                        min={0}
                        title="Clic para editar el mínimo"
                        onSave={(n) => guardarMinMax(v.variantId, { stockMin: n })}
                      />
                    </td>
                    <td className="num">
                      <CantidadEditable
                        value={v.stockMax}
                        min={0}
                        title="Clic para editar el máximo"
                        onSave={(n) => guardarMinMax(v.variantId, { stockMax: n })}
                      />
                    </td>
                    <td className="small muted">
                      {Object.values(v.porUbicacion)
                        .map((l) => `${l.location}: ${formatCantidad(l.qty)}`)
                        .join(" · ") || "—"}
                    </td>
                  </tr>
                ))}
                {filtradas.length === 0 && (
                  <tr>
                    <td colSpan={5} className="empty">Sin existencias que coincidan.</td>
                  </tr>
                )}
              </tbody>
            </table>
          ) : vista === "variante" ? (
            <table className="table">
              <thead>
                <tr>
                  <th>Producto / Variante</th>
                  <th>Ubicación</th>
                  <th className="num">Cantidad</th>
                </tr>
              </thead>
              <tbody>
                {grupos.map((g) =>
                  g.filas.map((f, i) => (
                    <tr key={`${g.v.variantId}-${f.l.id}`}>
                      {i === 0 && (
                        <td rowSpan={g.filas.length}>
                          <strong>{g.v.producto}</strong>
                          <div className="attr-list">
                            {g.v.valoracion.length > 0
                              ? g.v.valoracion.map((a) => (
                                  <span key={a.attribute} className="attr-item">
                                    <span className="attr-name">{a.attribute}</span> {a.valor}
                                  </span>
                                ))
                              : <span className="muted small">—</span>}
                          </div>
                        </td>
                      )}
                      <td>{f.l.nombre}</td>
                      <td className="num">
                        <CantidadEditable value={f.qty} onSave={(nueva) => ajustar(g.v.variantId, f.l.id, nueva)} />
                      </td>
                    </tr>
                  )),
                )}
                {grupos.length === 0 && (
                  <tr>
                    <td colSpan={3} className="empty">Sin existencias que coincidan.</td>
                  </tr>
                )}
              </tbody>
            </table>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Ubicación</th>
                  <th>Producto / Variante</th>
                  <th className="num">Cantidad</th>
                </tr>
              </thead>
              <tbody>
                {gruposUbicacion.map((g) =>
                  g.filas.map((f, i) => (
                    <tr key={`${g.l.id}-${f.v.variantId}`}>
                      {i === 0 && (
                        <td rowSpan={g.filas.length}>
                          <strong>{g.l.nombre}</strong>
                        </td>
                      )}
                      <td>
                        <strong>{f.v.producto}</strong>
                        <div className="attr-list">
                          {f.v.valoracion.length > 0
                            ? f.v.valoracion.map((a) => (
                                <span key={a.attribute} className="attr-item">
                                  <span className="attr-name">{a.attribute}</span> {a.valor}
                                </span>
                              ))
                            : <span className="muted small">—</span>}
                        </div>
                      </td>
                      <td className="num">
                        <CantidadEditable value={f.qty} onSave={(nueva) => ajustar(f.v.variantId, g.l.id, nueva)} />
                      </td>
                    </tr>
                  )),
                )}
                {gruposUbicacion.length === 0 && (
                  <tr>
                    <td colSpan={3} className="empty">Sin existencias que coincidan.</td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Últimos movimientos</h3>
        <ul className="step-list" style={{ fontSize: "0.95rem" }}>
          {movs.slice(0, 12).map((m) => (
            <li key={m.id} style={{ padding: "10px 12px" }}>
              <strong>
                {m.qty > 0 ? "+" : ""}
                {formatCantidad(m.qty)}
              </strong>{" "}
              {m.variant?.sku ?? "—"} · {m.motivo}
              {m.location ? ` (${m.location.nombre})` : ""}
              <div className="small muted">
                {m.ref ?? ""} · {new Date(m.createdAt).toLocaleString("es-MX")}
              </div>
            </li>
          ))}
          {movs.length === 0 && <li className="muted">Sin movimientos todavía.</li>}
        </ul>
      </div>

      {/* --- Modal: entrada / salida / transferencia --- */}
      {accion && (
        <Modal
          title={
            accion === "entrada" ? "Registrar entrada"
              : accion === "salida" ? "Registrar salida"
              : "Transferir entre ubicaciones"
          }
          onClose={cerrarAccion}
        >
          <form onSubmit={ejecutar}>
            <label>
              Variante
              <select value={selId ?? ""} onChange={(e) => setSelId(e.target.value ? Number(e.target.value) : null)} required>
                <option value="">— Elegir —</option>
                {exist.map((v) => (
                  <option key={v.variantId} value={v.variantId}>
                    {v.producto} · {v.nombre} ({v.sku})
                  </option>
                ))}
              </select>
            </label>
            {seleccion && (
              <p className="muted small" style={{ margin: "0 0 8px" }}>
                <strong>{seleccion.producto}</strong> · {seleccion.nombre} ({seleccion.sku}) · Stock total: {formatCantidad(seleccion.stockActual)} {seleccion.uom}
              </p>
            )}

            {(accion === "entrada" || accion === "salida") && (
              <label>
                Ubicación
                <select value={ubiId} onChange={(e) => setUbiId(e.target.value)}>
                  {locs.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.nombre}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {accion === "salida" && seleccion && (
              <p className="muted small" style={{ margin: "0 0 8px" }}>
                Disponible en la ubicación: <strong>{formatCantidad(disponible)} {seleccion.uom}</strong>
              </p>
            )}

            {accion === "mover" && (
              <div className="row">
                <label>
                  Origen
                  <select value={origen} onChange={(e) => setOrigen(e.target.value)}>
                    {locs.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.nombre}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Destino
                  <select value={destino} onChange={(e) => setDestino(e.target.value)}>
                    {locs.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.nombre}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}

            <div className="row">
              <label>
                Cantidad
                <input type="number" step="0.001" min="0" value={cantidad} onChange={(e) => setCantidad(e.target.value)} required />
              </label>
              <label>
                Referencia (opcional)
                <input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="ej. venta 001, lote 7" />
              </label>
            </div>

            <div className="row" style={{ justifyContent: "flex-end" }}>
              <button type="button" className="btn ghost" onClick={cerrarAccion}>
                Cancelar
              </button>
              <button className="btn primary" disabled={cargando}>
                {cargando ? "Guardando…" : "Registrar"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* --- Modal: filtros por atributos --- */}
      {showFiltros && productoSel && (
        <Modal title={`Filtrar: ${productoSel.producto}`} onClose={() => setShowFiltros(false)} size="lg">
          {atributosProducto.length === 0 ? (
            <p className="muted small">Este producto no tiene atributos definidos.</p>
          ) : (
            <>
              <p className="muted small" style={{ marginTop: 0 }}>
                Selecciona los valores. Dentro de un atributo es “alguno de”; entre atributos se combinan (Y).
                La tabla de atrás ya está filtrada.
              </p>
              {atributosProducto.map(({ attribute, valores }) => (
                <div key={attribute} className="filtro-attr">
                  <div className="filtro-attr-nombre">{attribute}</div>
                  <div className="filtro-attr-valores">
                    {valores.map((valor) => {
                      const activo = filtros[attribute]?.has(valor) ?? false;
                      return (
                        <button
                          key={valor}
                          type="button"
                          className={`chip-toggle ${activo ? "on" : ""}`}
                          onClick={() => toggleValor(attribute, valor)}
                        >
                          {valor}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </>
          )}
          <div className="row" style={{ marginTop: 12, justifyContent: "flex-end" }}>
            <button type="button" className="btn ghost" onClick={() => setFiltros({})} disabled={nFiltrosActivos === 0}>
              Limpiar filtros
            </button>
            <button type="button" className="btn primary" onClick={() => setShowFiltros(false)}>
              Cerrar
            </button>
          </div>
        </Modal>
      )}

      {/* --- Modal: filtro por ubicación --- */}
      {showUbiFiltro && (
        <Modal title="Filtrar por ubicación" onClose={() => setShowUbiFiltro(false)}>
          {locs.length === 0 ? (
            <p className="muted small">No hay ubicaciones registradas.</p>
          ) : (
            <>
              <p className="muted small" style={{ marginTop: 0 }}>
                Selecciona una ubicación para ver solo su contenido. “Todas” quita el filtro.
              </p>
              <div className="filtro-attr-valores">
                <button
                  type="button"
                  className={`chip-toggle ${ubicacionFiltro === null ? "on" : ""}`}
                  onClick={() => setUbicacionFiltro(null)}
                >
                  Todas
                </button>
                {locs.map((l) => (
                  <button
                    key={l.id}
                    type="button"
                    className={`chip-toggle ${ubicacionFiltro === l.id ? "on" : ""}`}
                    onClick={() => setUbicacionFiltro((prev) => (prev === l.id ? null : l.id))}
                  >
                    {l.nombre}
                  </button>
                ))}
              </div>
            </>
          )}
          <div className="row" style={{ marginTop: 12, justifyContent: "flex-end" }}>
            <button type="button" className="btn ghost" onClick={() => setUbicacionFiltro(null)} disabled={ubicacionFiltro === null}>
              Limpiar filtro
            </button>
            <button type="button" className="btn primary" onClick={() => setShowUbiFiltro(false)}>
              Cerrar
            </button>
          </div>
        </Modal>
      )}

      {/* --- Modal: nueva ubicación --- */}
      {showUbi && (
        <Modal title="Nueva ubicación" onClose={() => setShowUbi(false)} size="sm">
          <form onSubmit={crearUbicacion}>
            <label>
              Nombre
              <input value={ubiNombre} onChange={(e) => setUbiNombre(e.target.value)} placeholder="ej. Almacén 2, Piso producción" required autoFocus />
            </label>
            <label>
              Tipo
              <select value={ubiTipo} onChange={(e) => setUbiTipo(e.target.value)}>
                <option value="almacen">Almacén</option>
                <option value="temporal">Temporal</option>
              </select>
            </label>
            <div className="row" style={{ justifyContent: "flex-end" }}>
              <button type="button" className="btn ghost" onClick={() => setShowUbi(false)}>
                Cancelar
              </button>
              <button className="btn primary">Crear ubicación</button>
            </div>
          </form>
        </Modal>
      )}
    </AppShell>
  );
}
