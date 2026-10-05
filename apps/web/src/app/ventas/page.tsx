"use client";

import { useCallback, useEffect, useState } from "react";
import AppShell from "@/components/app-shell";
import PageHeader from "@/components/ui/page-header";
import HelpNote from "@/components/ui/help-note";
import Modal from "@/components/ui/modal";
import ConfirmDialog from "@/components/ui/confirm-dialog";
import StickyBar from "@/components/ui/sticky-bar";
import NuevaVenta from "@/components/ventas/nueva-venta";
import DocumentoVenta from "@/components/ventas/documento-venta";
import { api } from "@/lib/api";
import { useFormatCantidad } from "@/lib/preferences";
import type { Venta } from "@/lib/types";

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
  const [imprimirVenta, setImprimirVenta] = useState<Venta | null>(null);
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
      setMsg("Venta confirmada: se generaron las órdenes de fabricación necesarias.");
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

  // ------------------------------------------------------------------ UI
  if (vista === "detalle" && detalle) {
    const d = detalle;
    const pendientes = d.lines.filter((l) => l.cantidad - (l.qtyDelivered ?? 0) > 0).length;
    const etapa = !d.confirmadaAt ? 1 : (d.ordenesFabricacion ?? []).length > 0 ? 3 : 2;
    const etapaFinal = d.estado === "despachada";
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
          <div className={`step ${etapa > 2 ? "done" : etapa === 2 && d.confirmadaAt ? "current" : ""}`}>
            <span className="num">3</span> OFs generadas
          </div>
          <div className={`step ${etapaFinal ? "done" : etapa === 3 ? "current" : ""}`}>
            <span className="num">4</span> Despachada
          </div>
        </div>

        {error && <div className="error">{error}</div>}
        {msg && <div className="msg-ok">{msg}</div>}

        {d.estado === "abierta" && (
          <div className="row" style={{ marginBottom: 12 }}>
            {!d.confirmadaAt ? (
              <>
                <button className="btn primary" disabled={cargando} onClick={() => setConfirmarOpen(true)}>
                  Confirmar venta (desglose + neteo)
                </button>
                <span className="muted small" style={{ flex: 1 }}>
                  Al confirmar se genera el desglose, el neteo (fabricar vs comprar) y las OFs necesarias.
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
                        {d.estado === "abierta" && pendiente > 0 && (
                          <div className="row-actions">
                            <button className="btn ghost sm" disabled={cargando} onClick={() => abrirDespacho(d.id, l.id, pendiente, l.producto, l.sku)}>
                              Despachar
                            </button>
                          </div>
                        )}
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

        {d.confirmadaAt && (
          <>
            <h4>Resultado de confirmación (neteo)</h4>
            <div className="grid-2">
              <div className="card">
                <h4 style={{ marginTop: 0 }}>Fabricar / Ensamblar</h4>
                {(d.resumen?.fabricar ?? []).length ? (
                  <ul className="step-list">
                    {d.resumen!.fabricar.map((f) => (
                      <li key={`F${f.variantId}`}>
                        <span className={`badge ${f.tipo === "ensamble" ? "bajo" : "normal"}`}>{f.tipo}</span>{" "}
                        <strong>{f.producto}</strong> {f.nombre} ({f.sku}) × {formatCantidad(f.cantidad)}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="muted">Todo está cubierto por el stock existente.</p>
                )}
              </div>
              <div className="card">
                <h4 style={{ marginTop: 0 }}>Pendientes de compra</h4>
                <p className="muted small" style={{ marginTop: 0 }}>Solo informativo: no genera órdenes de compra.</p>
                {(d.resumen?.comprar ?? []).length ? (
                  <ul className="step-list">
                    {d.resumen!.comprar.map((c) => (
                      <li key={`C${c.variantId}`}>
                        <strong>{c.producto}</strong> {c.nombre} ({c.sku}) × {formatCantidad(c.cantidad)}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="muted">Sin pendientes de compra.</p>
                )}
              </div>
            </div>

            {(d.ordenesFabricacion ?? []).length > 0 && (
              <>
                <HelpNote>
                  Los ensambles (2+ componentes) se arman contra pedido: para despacharlos, primero
                  <strong> concluye</strong> su orden de ensamble desde <a href="/fabricacion">Fabricación</a>.
                </HelpNote>
                <div className="card" style={{ padding: 0 }}>
                <h4 style={{ padding: "12px 16px", margin: 0 }}>Órdenes de fabricación generadas</h4>
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>OF</th>
                        <th>Producto</th>
                        <th className="num">Cant.</th>
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
                          <td className="num">{formatCantidad(of.cantidad)}</td>
                          <td>
                            <span className={`badge ${of.tipo === "ensamble" ? "bajo" : "normal"}`}>{of.tipo}</span>
                          </td>
                          <td>{of.estado}</td>
                          <td className="small muted">{(of.lines ?? []).map((l) => `${l.nombre} ×${formatCantidad(l.cantidadRequerida)}`).join(" · ")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              </>
            )}
          </>
        )}

        {confirmarOpen && (
          <ConfirmDialog
            title="Confirmar venta"
            message="Se hará el desglose, el neteo (fabricar vs comprar) y se generarán las órdenes de fabricación necesarias."
            confirmLabel="Confirmar venta"
            loading={cargando}
            onConfirm={() => confirmar(d.id)}
            onClose={() => setConfirmarOpen(false)}
          />
        )}

        {cancelarOpen && (
          <ConfirmDialog
            title="Cancelar venta"
            message="Las órdenes de fabricación asociadas también se cancelarán. Esta acción no se puede deshacer."
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
        subtitle="Órdenes locales y web. Confirma para generar el desglose/neteo y las OFs; luego despacha por línea."
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
