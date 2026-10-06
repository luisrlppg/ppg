"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import AppShell from "@/components/app-shell";
import PageHeader from "@/components/ui/page-header";
import HelpNote from "@/components/ui/help-note";
import Modal from "@/components/ui/modal";
import ConfirmDialog from "@/components/ui/confirm-dialog";
import StickyBar from "@/components/ui/sticky-bar";
import NuevaVenta from "@/components/ventas/nueva-venta";
import DocumentoVenta from "@/components/ventas/documento-venta";
import ModalEtiqueta from "@/components/ventas/modal-etiqueta";
import { api } from "@/lib/api";
import { useFormatCantidad } from "@/lib/preferences";
import type { Desglose, DesgloseNodo, Venta, VentaLinea } from "@/lib/types";

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

export default function VentasPage() {
  const formatCantidad = useFormatCantidad();
  const [ventas, setVentas] = useState<VentaLista[]>([]);
  const [fEstado, setFEstado] = useState("");
  const [fOrigen, setFOrigen] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [vista, setVista] = useState<"lista" | "detalle">("lista");
  const [nuevaOpen, setNuevaOpen] = useState(false);
  const [detalle, setDetalle] = useState<Venta | null>(null);
  const [desglose, setDesglose] = useState<Desglose | null>(null);
  const [desgloseColapsados, setDesgloseColapsados] = useState<Set<string>>(new Set());
  const [imprimirVenta, setImprimirVenta] = useState<Venta | null>(null);
  const [etiquetaLinea, setEtiquetaLinea] = useState<{ venta: Venta; linea: VentaLinea } | null>(null);
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
    setDesgloseColapsados(new Set());
    try {
      setDesglose(await api<Desglose>(`/ventas/${id}/desglose`));
    } catch {
      setDesglose(null);
    }
    return d;
  }

  // ------------------------------------------------------- Acciones sobre venta
  const [cargando, setCargando] = useState(false);
  const [confirmarOpen, setConfirmarOpen] = useState(false);
  const [cancelarOpen, setCancelarOpen] = useState(false);
  const [despacho, setDespacho] = useState<{ lineaId: number; max: number; producto: string; sku: string } | null>(null);
  const [despachoQty, setDespachoQty] = useState("");

  async function confirmar(id: number) {
    setCargando(true);
    setError("");
    try {
      await api(`/ventas/${id}/confirmar`, { method: "POST", body: "{}" });
      setConfirmarOpen(false);
      await abrirDetalle(id);
      setMsg("Venta confirmada. Revisa el desglose; la producción faltante se registra desde Fabricación.");
    } catch (e) {
      setError((e as Error).message);
      setConfirmarOpen(false);
    } finally {
      setCargando(false);
    }
  }

  function abrirDespacho(id: number, lineaId: number, max: number, producto: string, sku: string) {
    setDespacho({ lineaId, max, producto, sku });
    setDespachoQty(String(max));
    setError("");
  }

  async function despachar(id: number) {
    if (!despacho) return;
    const qty = Number(despachoQty);
    if (!(qty > 0) || qty > despacho.max) {
      setError(`Cantidad inválida (máx ${despacho.max}).`);
      return;
    }
    setCargando(true);
    setError("");
    try {
      await api(`/ventas/${id}/lineas/${despacho.lineaId}/despachar`, { method: "POST", body: JSON.stringify({ cantidad: qty }) });
      setDespacho(null);
      await abrirDetalle(id);
      setMsg("Despacho registrado.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCargando(false);
    }
  }

  async function cancelar(id: number) {
    setCargando(true);
    setError("");
    try {
      await api(`/ventas/${id}/cancelar`, { method: "POST", body: "{}" });
      setCancelarOpen(false);
      setVista("lista");
      cargarLista();
    } catch (e) {
      setError((e as Error).message);
      setCancelarOpen(false);
    } finally {
      setCargando(false);
    }
  }

  const badgeVenta = (e: string) => (e === "despachada" ? "normal" : e === "abierta" ? "bajo" : "critico");
  const badgeEntrega = (e: string) => (e === "entregado" ? "normal" : e === "parcial" ? "bajo" : "critico");

  const claveRaiz = (n: DesgloseNodo) => `r${n.salesOrderLineId ?? n.variantId}`;

  function toggleDesglose(key: string) {
    setDesgloseColapsados((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function aplanarComponentes(n: DesgloseNodo, depth = 1): { nodo: DesgloseNodo; depth: number }[] {
    const out: { nodo: DesgloseNodo; depth: number }[] = [];
    for (const h of n.componentes) {
      out.push({ nodo: h, depth });
      out.push(...aplanarComponentes(h, depth + 1));
    }
    return out;
  }

  const badgeDesglose = (l: DesgloseNodo) =>
    l.suficiente ? (
      <span className="badge normal">Suficiente</span>
    ) : l.fabricable ? (
      <span className={`badge ${l.tipo === "ensamble" ? "bajo" : "critico"}`}>{l.tipo === "ensamble" ? "Ensamblar" : "Fabricar"}</span>
    ) : (
      <span className="badge bajo">Comprar</span>
    );

  // ------------------------------------------------------------------ UI
  if (vista === "detalle" && detalle) {
    const d = detalle;
    const pendientes = d.lines.filter((l) => l.cantidad - (l.qtyDelivered ?? 0) > 0).length;
    const etapaFinal = d.estado === "despachada";
    const entregaPorLinea = new Map(d.lines.map((l) => [l.id, l.estadoEntrega]));
    return (
      <AppShell>
        <PageHeader
          breadcrumb={[{ label: "Ventas", href: "/ventas" }, { label: d.numero }]}
          title={
            <>
              {d.numero}{" "}
              <span className={`badge ${badgeVenta(d.estado)}`}>{d.estado}</span>{" "}
              <span className="badge info">{d.origen === "web" ? "Web" : "Local"}</span>
            </>
          }
          subtitle={
            <>
              Cliente: <strong>{d.partner?.nombre ?? "—"}</strong> · Fecha: {new Date(d.fecha).toLocaleDateString("es-MX")}
              {d.fechaEntregaDeseada ? ` · Entrega deseada: ${new Date(d.fechaEntregaDeseada).toLocaleDateString("es-MX")}` : ""}
              {d.notas ? ` · Notas: ${d.notas}` : ""}
            </>
          }
          actions={
            <>
              <button className="btn primary" style={{ flex: 0 }} onClick={() => setImprimirVenta(d)}>
                Imprimir
              </button>
              <button className="btn ghost" style={{ flex: 0 }} onClick={() => { setVista("lista"); cargarLista(); }}>
                Volver
              </button>
            </>
          }
        />

        <div className="stepper">
          <div className={`step done`}>
            <span className="num">1</span> Registrada
          </div>
          <div className={`step ${d.confirmadaAt ? "done" : "current"}`}>
            <span className="num">2</span> Confirmada (desglose + neteo)
          </div>
          <div className={`step ${etapaFinal ? "done" : d.confirmadaAt ? "current" : ""}`}>
            <span className="num">3</span> Despachada
          </div>
        </div>

        {error && <div className="error">{error}</div>}
        {msg && <div className="msg-ok">{msg}</div>}

        {d.estado === "abierta" && (
          <div className="row" style={{ marginBottom: 12 }}>
            {!d.confirmadaAt ? (
              <>
                <button className="btn primary" disabled={cargando} onClick={() => setConfirmarOpen(true)}>
                  Confirmar venta (desglose)
                </button>
                <span className="muted small" style={{ flex: 1 }}>
                  Al confirmar se calcula y guarda el desglose. La producción faltante se registra desde Fabricación.
                </span>
              </>
            ) : (
              <span className="muted small" style={{ flex: 1 }}>
                Siguiente paso: despacha cada línea desde la tabla de abajo.
              </span>
            )}
            <button className="btn ghost" style={{ flex: 0 }} disabled={cargando} onClick={() => setCancelarOpen(true)}>
              Cancelar venta
            </button>
          </div>
        )}

        {d.estado === "abierta" && d.confirmadaAt && pendientes === 0 && (
          <HelpNote>Todas las líneas están despachadas.</HelpNote>
        )}

        <div className="card" style={{ padding: 0 }}>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Producto / Variante</th>
                  <th className="num">Cant.</th>
                  <th className="num">Precio</th>
                  <th className="num">Subtotal</th>
                  <th>Despachado</th>
                  <th>Entrega</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {d.lines.map((l) => {
                  const pendiente = Math.max(0, l.cantidad - (l.qtyDelivered ?? 0));
                  return (
                    <tr key={l.id}>
                      <td>
                        <strong>{l.producto}</strong>
                        <div className="small muted">{l.nombre} · {l.sku}</div>
                      </td>
                      <td className="num">{formatCantidad(l.cantidad)} {l.uom}</td>
                      <td className="num">${(l.precioUnitario ?? 0).toFixed(2)}</td>
                      <td className="num">${(l.subtotal ?? 0).toFixed(2)}</td>
                      <td>
                        {formatCantidad(l.qtyDelivered ?? 0)}/{formatCantidad(l.cantidad)}
                      </td>
                      <td>
                        <span className={`badge ${badgeEntrega(l.estadoEntrega)}`}>{l.estadoEntrega}</span>
                      </td>
                      <td>
                        <div className="row-actions">
                          <button className="btn ghost sm" onClick={() => setEtiquetaLinea({ venta: d, linea: l })}>
                            Etiqueta
                          </button>
                          {d.estado === "abierta" && pendiente > 0 && (
                            <button className="btn ghost sm" disabled={cargando} onClick={() => abrirDespacho(d.id, l.id, pendiente, l.producto, l.sku)}>
                              Despachar
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3}>Total</td>
                  <td colSpan={4} className="num">${d.lines.reduce((a, l) => a + l.subtotal, 0).toFixed(2)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {desglose && desglose.arbol.length > 0 && (
          <>
            <h3 style={{ margin: "16px 0 8px", fontSize: "1.1rem" }}>
              Desglose de componentes ({desglose.lineas.length})
            </h3>
            <HelpNote>
              Cálculo en vivo de lo que consume este pedido según su lista de materiales, descontando
              stock nivel por nivel. Lo que falte se produce y registra desde <a href="/fabricacion">Fabricación</a>.
            </HelpNote>
            <div className="card" style={{ padding: 0 }}>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Producto / Variante</th>
                      <th className="num">Necesita</th>
                      <th className="num">En stock</th>
                      <th className="num">Falta</th>
                      <th>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {desglose.arbol.map((raiz) => {
                      const key = claveRaiz(raiz);
                      const colapsado = desgloseColapsados.has(key);
                      const entregado = raiz.salesOrderLineId != null && entregaPorLinea.get(raiz.salesOrderLineId) === "entregado";
                      const hijos = entregado ? [] : aplanarComponentes(raiz);
                      const tieneHijos = hijos.length > 0;
                      return (
                        <Fragment key={key}>
                          <tr style={{ background: entregado ? "#f0fdf4" : "#fafafa" }}>
                            <td>
                              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                {tieneHijos ? (
                                  <button
                                    type="button"
                                    onClick={() => toggleDesglose(key)}
                                    aria-expanded={!colapsado}
                                    title={colapsado ? "Expandir componentes" : "Colapsar componentes"}
                                    style={{
                                      display: "inline-flex",
                                      alignItems: "center",
                                      justifyContent: "center",
                                      width: 18,
                                      height: 18,
                                      padding: 0,
                                      border: 0,
                                      background: "transparent",
                                      cursor: "pointer",
                                      color: "var(--brand)",
                                      fontSize: "0.8rem",
                                    }}
                                  >
                                    <span aria-hidden="true">{colapsado ? "▸" : "▾"}</span>
                                  </button>
                                ) : (
                                  <span style={{ width: 18, display: "inline-block" }} />
                                )}
                                <div>
                                  <strong>{raiz.producto}</strong>
                                  <span className="badge info" style={{ marginLeft: 6 }}>Vendido</span>
                                  <div className="small muted">{raiz.nombre} · {raiz.sku}</div>
                                </div>
                              </div>
                            </td>
                            <td className="num">{entregado ? "—" : `${formatCantidad(raiz.requerido)} ${raiz.uom}`}</td>
                            <td className="num">{entregado ? "—" : `${formatCantidad(raiz.stockActual)} ${raiz.uom}`}</td>
                            <td className="num">{entregado ? "—" : raiz.faltante > 0 ? formatCantidad(raiz.faltante) : "—"}</td>
                            <td>{entregado ? <span className="badge normal">Entregado</span> : badgeDesglose(raiz)}</td>
                          </tr>
                          {tieneHijos &&
                            !colapsado &&
                            hijos.map(({ nodo: h, depth }, i) => (
                              <tr key={`${key}-${h.variantId}-${i}`}>
                                <td style={{ paddingLeft: 12 + depth * 20 }}>
                                  <strong>{h.producto}</strong>
                                  <div className="small muted">{h.nombre} · {h.sku}</div>
                                </td>
                                <td className="num">{formatCantidad(h.requerido)} {h.uom}</td>
                                <td className="num">{formatCantidad(h.stockActual)} {h.uom}</td>
                                <td className="num">{h.faltante > 0 ? formatCantidad(h.faltante) : "—"}</td>
                                <td>{badgeDesglose(h)}</td>
                              </tr>
                            ))}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {confirmarOpen && (
          <ConfirmDialog
            title="Confirmar venta"
            message="Se calculará y guardará el desglose (fabricar vs comprar). La producción faltante se registra desde Fabricación."
            confirmLabel="Confirmar venta"
            loading={cargando}
            onConfirm={() => confirmar(d.id)}
            onClose={() => setConfirmarOpen(false)}
          />
        )}

        {cancelarOpen && (
          <ConfirmDialog
            title="Cancelar venta"
            message="Esta acción no se puede deshacer."
            confirmLabel="Cancelar venta"
            danger
            loading={cargando}
            onConfirm={() => cancelar(d.id)}
            onClose={() => setCancelarOpen(false)}
          />
        )}

        {imprimirVenta && (
          <DocumentoVenta venta={imprimirVenta} onCerrar={() => setImprimirVenta(null)} />
        )}

        {etiquetaLinea && (
          <ModalEtiqueta
            key={`${etiquetaLinea.venta.id}-${etiquetaLinea.linea.id}`}
            venta={etiquetaLinea.venta}
            linea={etiquetaLinea.linea}
            onCerrar={() => setEtiquetaLinea(null)}
          />
        )}

        {despacho && (
          <Modal title="Despachar línea" onClose={() => setDespacho(null)} size="sm">
            <p className="muted small" style={{ marginTop: 0 }}>
              <strong>{despacho.producto}</strong> · {despacho.sku}
            </p>
            <label>
              Cantidad a despachar (máx {formatCantidad(despacho.max)})
              <input
                type="number"
                step="0.001"
                min="0.001"
                max={despacho.max}
                value={despachoQty}
                onChange={(e) => setDespachoQty(e.target.value)}
                autoFocus
              />
            </label>
            <div className="row" style={{ justifyContent: "flex-end" }}>
              <button type="button" className="btn ghost" onClick={() => setDespacho(null)}>
                Cancelar
              </button>
              <button type="button" className="btn primary" disabled={cargando} onClick={() => despachar(d.id)}>
                {cargando ? "Despachando…" : "Despachar"}
              </button>
            </div>
          </Modal>
        )}
      </AppShell>
    );
  }

  // ------------------------------------------------------------- Lista
  return (
    <AppShell>
      <PageHeader
        title="Ventas"
        subtitle="Órdenes locales y web. Revisa el desglose de componentes y crea las OFs que falten; luego despacha por línea."
        actions={
          <button className="btn primary" onClick={() => { setNuevaOpen(true); setError(""); setMsg(""); }}>
            + Nueva venta
          </button>
        }
      />
      {error && <div className="error">{error}</div>}
      {msg && <div className="msg-ok">{msg}</div>}

      <StickyBar>
      <div className="toolbar">
        <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Nº o cliente…" style={{ maxWidth: 240 }} />
        <select value={fEstado} onChange={(e) => setFEstado(e.target.value)} style={{ maxWidth: 180 }}>
          <option value="">Todos los estados</option>
          <option value="abierta">Abierta</option>
          <option value="despachada">Despachada</option>
          <option value="cancelada">Cancelada</option>
        </select>
        <select value={fOrigen} onChange={(e) => setFOrigen(e.target.value)} style={{ maxWidth: 150 }}>
          <option value="">Todos</option>
          <option value="interno">Local</option>
          <option value="web">Web</option>
        </select>
      </div>
      </StickyBar>

      <div className="card" style={{ padding: 0 }}>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Nº</th>
                <th>Fecha</th>
                <th>Cliente</th>
                <th>Origen</th>
                <th className="num">Líneas</th>
                <th className="num">Total</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {ventas.map((v) => (
                <tr key={v.id} onClick={() => abrirDetalle(v.id)} style={{ cursor: "pointer" }}>
                  <td><strong>{v.numero}</strong></td>
                  <td>{new Date(v.fecha).toLocaleDateString("es-MX")}</td>
                  <td>{v.cliente}</td>
                  <td>
                    <span className={`badge ${v.origen === "web" ? "info" : "normal"}`}>{v.origen === "web" ? "Web" : "Local"}</span>
                  </td>
                  <td className="num">{v.lineas}</td>
                  <td className="num">${v.total.toFixed(2)}</td>
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
      </div>

      {nuevaOpen && (
        <Modal
          title="Nueva venta"
          onClose={() => { setNuevaOpen(false); setError(""); setMsg(""); }}
          size="lg"
        >
          {error && <div className="error">{error}</div>}
          {msg && <div className="msg-ok">{msg}</div>}
          <NuevaVenta
            onCreada={(id) => {
              setNuevaOpen(false);
              abrirDetalle(id).then(setImprimirVenta).catch((e) => setError((e as Error).message));
            }}
            onError={(m) => setError(m)}
            onMsg={(m) => setMsg(m)}
          />
        </Modal>
      )}
    </AppShell>
  );
}
