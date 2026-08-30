"use client";

import { useCallback, useEffect, useState } from "react";
import AppShell from "@/components/app-shell";
import { api } from "@/lib/api";
import type { Partner, Venta, VarianteBuscada } from "@/lib/types";

interface VentaLista {
  id: number;
  numero: string;
  fecha: string;
  estado: "abierta" | "despachada" | "cancelada";
  origen: "interno" | "web";
  cliente: string;
  lineas: number;
  total: number;
}

interface LineaForm {
  variantId: number;
  sku: string;
  nombre: string;
  producto: string;
  cantidad: string;
  precio: string;
}

export default function VentasPage() {
  const [ventas, setVentas] = useState<VentaLista[]>([]);
  const [fEstado, setFEstado] = useState("");
  const [fOrigen, setFOrigen] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [vista, setVista] = useState<"lista" | "nueva" | "detalle">("lista");
  const [detalle, setDetalle] = useState<Venta | null>(null);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  const cargarLista = useCallback(async () => {
    const qs = new URLSearchParams();
    if (fEstado) qs.set("estado", fEstado);
    if (fOrigen) qs.set("origen", fOrigen);
    if (busqueda) qs.set("search", busqueda);
    setVentas(await api(`/ventas?${qs.toString()}`));
  }, [fEstado, fOrigen, busqueda]);

  useEffect(() => {
    const t = setTimeout(() => cargarLista().catch((e) => setError(e.message)), 150);
    return () => clearTimeout(t);
  }, [cargarLista]);

  async function abrirDetalle(id: number) {
    const d = await api<Venta>(`/ventas/${id}`);
    setDetalle(d);
    setVista("detalle");
    setError("");
    setMsg("");
  }

  // ---------------------------------------------------------------- Alta
  const [clientes, setClientes] = useState<Partner[]>([]);
  const [partnerId, setPartnerId] = useState("");
  const [fechaEntrega, setFechaEntrega] = useState("");
  const [notas, setNotas] = useState("");
  const [lineas, setLineas] = useState<LineaForm[]>([]);
  const [busqVar, setBusqVar] = useState("");
  const [resultados, setResultados] = useState<VarianteBuscada[]>([]);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    api<Partner[]>("/clientes").then(setClientes).catch(() => setClientes([]));
  }, []);

  useEffect(() => {
    if (!busqVar.trim()) {
      setResultados([]);
      return;
    }
    const t = setTimeout(() => {
      api<VarianteBuscada[]>(`/productos/variantes?search=${encodeURIComponent(busqVar)}`)
        .then(setResultados)
        .catch(() => setResultados([]));
    }, 200);
    return () => clearTimeout(t);
  }, [busqVar]);

  function agregarLinea(v: VarianteBuscada) {
    if (lineas.some((l) => l.variantId === v.id)) return;
    setLineas([
      ...lineas,
      { variantId: v.id, sku: v.sku, nombre: v.nombre, producto: v.producto, cantidad: "1", precio: String(v.precio) },
    ]);
    setBusqVar("");
    setResultados([]);
  }

  function cambiarLinea(i: number, campo: string, valor: string) {
    setLineas(lineas.map((l, j) => (j === i ? { ...l, [campo]: valor } : l)));
  }

  async function crearVenta(e: React.FormEvent) {
    e.preventDefault();
    if (lineas.length === 0) {
      setError("Agrega al menos una variante.");
      return;
    }
    setGuardando(true);
    setError("");
    try {
      const v = await api<{ id: number }>("/ventas", {
        method: "POST",
        body: JSON.stringify({
          partnerId: partnerId ? Number(partnerId) : undefined,
          fechaEntregaDeseada: fechaEntrega || undefined,
          notas: notas || undefined,
          lines: lineas.map((l) => ({ variantId: l.variantId, cantidad: Number(l.cantidad), precioUnitario: l.precio === "" ? undefined : Number(l.precio) })),
        }),
      });
      setMsg(`Venta registrada. Revisa el seguimiento y confírmala cuando esté lista.`);
      setLineas([]);
      setPartnerId("");
      setFechaEntrega("");
      setNotas("");
      await abrirDetalle(v.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGuardando(false);
    }
  }

  // ------------------------------------------------------- Acciones sobre venta
  const [cargando, setCargando] = useState(false);

  async function confirmar(id: number) {
    if (!window.confirm("¿Confirmar esta venta? Se hará el desglose, el neteo y se generarán las órdenes de fabricación necesarias.")) return;
    setCargando(true);
    setError("");
    try {
      await api(`/ventas/${id}/confirmar`, { method: "POST", body: "{}" });
      await abrirDetalle(id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCargando(false);
    }
  }

  async function despachar(id: number, lineaId: number, max: number) {
    const cantidad = window.prompt(`¿Cuántas piezas despachar de esta línea? (máx ${max})`, String(max));
    if (cantidad === null) return;
    const qty = Number(cantidad);
    if (!(qty > 0) || qty > max) {
      setError(`Cantidad inválida (máx ${max}).`);
      return;
    }
    setCargando(true);
    setError("");
    try {
      await api(`/ventas/${id}/lineas/${lineaId}/despachar`, { method: "POST", body: JSON.stringify({ cantidad: qty }) });
      await abrirDetalle(id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCargando(false);
    }
  }

  async function cancelar(id: number) {
    if (!window.confirm("¿Cancelar esta venta? Las órdenes de fabricación asociadas también se cancelarán.")) return;
    setCargando(true);
    setError("");
    try {
      await api(`/ventas/${id}/cancelar`, { method: "POST", body: "{}" });
      setVista("lista");
      cargarLista();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCargando(false);
    }
  }

  const badgeVenta = (e: string) => (e === "despachada" ? "normal" : e === "abierta" ? "bajo" : "critico");
  const badgeEntrega = (e: string) => (e === "entregado" ? "normal" : e === "parcial" ? "bajo" : "critico");

  // ------------------------------------------------------------------ UI
  if (vista === "nueva") {
    return (
      <AppShell>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2>Nueva venta</h2>
          <button className="btn ghost" style={{ flex: 0 }} onClick={() => { setVista("lista"); setError(""); }}>
            Volver
          </button>
        </div>
        {error && <div className="error">{error}</div>}
        {msg && <div className="msg-ok">{msg}</div>}
        <form onSubmit={crearVenta} className="card">
          <div className="row">
            <label>
              Cliente
              <select value={partnerId} onChange={(e) => setPartnerId(e.target.value)}>
                <option value="">— Sin asignar —</option>
                {clientes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Entrega deseada
              <input type="date" value={fechaEntrega} onChange={(e) => setFechaEntrega(e.target.value)} />
            </label>
          </div>
          <label>
            Notas
            <input value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="opcional" />
          </label>

          <h4 style={{ marginBottom: 4 }}>Variantes a vender</h4>
          <label>
            Buscar producto o variante…
            <input value={busqVar} onChange={(e) => setBusqVar(e.target.value)} placeholder="ej. pincel, espiral…" />
          </label>
          {resultados.length > 0 && (
            <div className="card" style={{ padding: 8, margin: "4px 0 12px" }}>
              {resultados.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  className="row gh s"
                  style={{ width: "100%", textAlign: "left", marginBottom: 2, background: "#fff", border: "1px solid #eee", borderRadius: 8, padding: "8px 12px" }}
                  onClick={() => agregarLinea(r)}
                >
                  <span>
                    <strong>{r.producto}</strong> — {r.nombre}
                    <span className="muted small"> ({r.sku}) · stock {r.stockActual} · ${r.precio}</span>
                  </span>
                </button>
              ))}
            </div>
          )}

          {lineas.map((l, i) => (
            <div key={l.variantId} className="row" style={{ background: "#fafafa", padding: "8px 12px", borderRadius: 8, marginBottom: 6 }}>
              <span style={{ flex: 2 }}>
                <strong>{l.producto}</strong> — {l.nombre} <span className="muted small">({l.sku})</span>
              </span>
              <label style={{ flex: 0.7 }}>
                Cantidad
                <input type="number" step="0.001" min="0.001" value={l.cantidad} onChange={(e) => cambiarLinea(i, "cantidad", e.target.value)} />
              </label>
              <label style={{ flex: 0.9 }}>
                Precio ($)
                <input type="number" step="0.01" value={l.precio} onChange={(e) => cambiarLinea(i, "precio", e.target.value)} />
              </label>
              <button type="button" className="btn ghost" style={{ flex: 0 }} onClick={() => setLineas(lineas.filter((_, j) => j !== i))}>
                Quitar
              </button>
            </div>
          ))}
          {lineas.length === 0 && <p className="muted">Busca y agrega las variantes.</p>}

          <div className="row">
            <button className="btn primary block" disabled={guardando}>
              {guardando ? "Guardando…" : "Guardar venta"}
            </button>
          </div>
        </form>
      </AppShell>
    );
  }

  if (vista === "detalle" && detalle) {
    const d = detalle;
    return (
      <AppShell>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2 style={{ margin: 0 }}>
            {d.numero}{" "}
            <span className={`badge ${badgeVenta(d.estado)}`}>{d.estado}</span>{" "}
            <span className="badge" style={{ background: d.origen === "web" ? "#e0e8ff" : "#eee", color: d.origen === "web" ? "#1a3a8a" : "#444" }}>
              {d.origen === "web" ? "Web" : "Local"}
            </span>
          </h2>
          <button className="btn ghost" style={{ flex: 0 }} onClick={() => { setVista("lista"); cargarLista(); }}>
            Volver
          </button>
        </div>
        {error && <div className="error">{error}</div>}
        {msg && <div className="msg-ok">{msg}</div>}

        <p className="muted">
          Cliente: <strong>{d.partner?.nombre ?? "—"}</strong> · Fecha: {new Date(d.fecha).toLocaleDateString("es-MX")}
          {d.fechaEntregaDeseada ? ` · Entrega deseada: ${new Date(d.fechaEntregaDeseada).toLocaleDateString("es-MX")}` : ""}
          {d.notas ? ` · Notas: ${d.notas}` : ""}
        </p>

        {d.estado === "abierta" && (
          <div className="row" style={{ marginBottom: 12 }}>
            {!d.confirmadaAt && (
              <button className="btn primary" disabled={cargando} onClick={() => confirmar(d.id)}>
                Confirmar venta (desglose + neteo)
              </button>
            )}
            <button className="btn ghost" style={{ flex: 0 }} disabled={cargando || !d.confirmadaAt} onClick={() => window.alert("Para despachar, usa el botón de cada línea de abajo.")}>
              Despachar por línea
            </button>
            <button className="btn ghost" style={{ flex: 0 }} disabled={cargando} onClick={() => cancelar(d.id)}>
              Cancelar venta
            </button>
          </div>
        )}

        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <table className="table">
            <thead>
              <tr>
                <th>Producto / Variante</th>
                <th>Cant.</th>
                <th>Precio</th>
                <th>Subtotal</th>
                <th>Despachado</th>
                <th>Entrega</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {d.lines.map((l) => {
                const pendiente = Math.max(0, l.cantidad - l.qtyDelivered);
                return (
                  <tr key={l.id}>
                    <td>
                      <strong>{l.producto}</strong>
                      <div className="small muted">{l.nombre} · {l.sku}</div>
                    </td>
                    <td>{l.cantidad} {l.uom}</td>
                    <td>${l.precioUnitario.toFixed(2)}</td>
                    <td>${l.subtotal.toFixed(2)}</td>
                    <td>
                      {l.qtyDelivered}/{l.cantidad}
                    </td>
                    <td>
                      <span className={`badge ${badgeEntrega(l.estadoEntrega)}`}>{l.estadoEntrega}</span>
                    </td>
                    <td>
                      {d.estado === "abierta" && pendiente > 0 && (
                        <button className="btn s" disabled={cargando} onClick={() => despachar(d.id, l.id, pendiente)}>
                          Despachar
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3}>Total</td>
                <td colSpan={4}>${d.lines.reduce((a, l) => a + l.subtotal, 0).toFixed(2)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        {d.confirmadaAt && (
          <>
            <h4>Resultado de confirmación (neteo)</h4>
            <div className="grid-2">
              <div className="card">
                <h4 style={{ marginTop: 0 }}>Fabricar / Ensamblar</h4>
                {d.resumen?.fabricar.length ? (
                  <ul className="step-list">
                    {d.resumen.fabricar.map((f) => (
                      <li key={`F${f.variantId}`}>
                        <span className={`badge ${f.tipo === "ensamble" ? "bajo" : "normal"}`}>{f.tipo}</span>{" "}
                        <strong>{f.producto}</strong> {f.nombre} ({f.sku}) × {f.cantidad}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="muted">Todo está cubierto por el stock existente.</p>
                )}
              </div>
              <div className="card">
                <h4 style={{ marginTop: 0 }}>Pendientes de compra</h4>
                {d.resumen?.comprar.length ? (
                  <ul className="step-list">
                    {d.resumen.comprar.map((c) => (
                      <li key={`C${c.variantId}`}>
                        <strong>{c.producto}</strong> {c.nombre} ({c.sku}) × {c.cantidad}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="muted">Sin pendientes de compra.</p>
                )}
              </div>
            </div>

            {d.ordenesFabricacion.length > 0 && (
              <div className="card" style={{ padding: 0, overflow: "hidden" }}>
                <h4 style={{ padding: "12px 16px", margin: 0 }}>Órdenes de fabricación generadas</h4>
                <table className="table">
                  <thead>
                    <tr>
                      <th>OF</th>
                      <th>Producto</th>
                      <th>Cant.</th>
                      <th>Tipo</th>
                      <th>Estado</th>
                      <th>Componentes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.ordenesFabricacion.map((of) => (
                      <tr key={of.id}>
                        <td>{of.numero}</td>
                        <td>
                          <strong>{of.producto}</strong> <span className="muted small">({of.sku})</span>
                        </td>
                        <td>{of.cantidad}</td>
                        <td>
                          <span className={`badge ${of.tipo === "ensamble" ? "bajo" : "normal"}`}>{of.tipo}</span>
                        </td>
                        <td>{of.estado}</td>
                        <td className="small muted">{of.lines.map((l) => `${l.nombre} ×${l.cantidadRequerida}`).join(" · ")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </AppShell>
    );
  }

  // ------------------------------------------------------------- Lista
  return (
    <AppShell>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h2 style={{ margin: 0 }}>Ventas</h2>
        <div className="row" style={{ flex: 0 }}>
          <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Nº o cliente…" style={{ flex: 1 }} />
          <select value={fEstado} onChange={(e) => setFEstado(e.target.value)} style={{ flex: 0.8 }}>
            <option value="">Todos los estados</option>
            <option value="abierta">Abierta</option>
            <option value="despachada">Despachada</option>
            <option value="cancelada">Cancelada</option>
          </select>
          <select value={fOrigen} onChange={(e) => setFOrigen(e.target.value)} style={{ flex: 0.6 }}>
            <option value="">Todos</option>
            <option value="interno">Local</option>
            <option value="web">Web</option>
          </select>
          <button className="btn primary" style={{ flex: 0 }} onClick={() => { setVista("nueva"); setError(""); setMsg(""); }}>
            Nueva venta
          </button>
        </div>
      </div>
      {error && <div className="error">{error}</div>}
      {msg && <div className="msg-ok">{msg}</div>}

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <table className="table">
          <thead>
            <tr>
              <th>Nº</th>
              <th>Fecha</th>
              <th>Cliente</th>
              <th>Origen</th>
              <th>Líneas</th>
              <th>Total</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {(ventas).map((v) => (
              <tr key={v.id} onClick={() => abrirDetalle(v.id)} style={{ cursor: "pointer" }}>
                <td><strong>{v.numero}</strong></td>
                <td>{new Date(v.fecha).toLocaleDateString("es-MX")}</td>
                <td>{v.cliente}</td>
                <td>
                  <span className={`badge ${v.origen === "web" ? "" : "normal"}`} style={v.origen === "web" ? { background: "#e0e8ff", color: "#1a3a8a" } : undefined}>
                    {v.origen === "web" ? "Web" : "Local"}
                  </span>
                </td>
                <td>{v.lineas}</td>
                <td>${v.total.toFixed(2)}</td>
                <td>
                  <span className={`badge ${badgeVenta(v.estado)}`}>{v.estado}</span>
                </td>
              </tr>
            ))}
            {ventas.length === 0 && (
              <tr>
                <td colSpan={7} className="empty">Sin ventas todavía.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}