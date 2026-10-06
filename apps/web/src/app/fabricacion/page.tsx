"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import AppShell from "@/components/app-shell";
import PageHeader from "@/components/ui/page-header";
import HelpNote from "@/components/ui/help-note";
import Modal from "@/components/ui/modal";
import Segmented from "@/components/ui/segmented";
import StickyBar from "@/components/ui/sticky-bar";
import BuscadorAtributos, { FiltroAtributosModal } from "@/components/ui/buscador-atributos";
import { api } from "@/lib/api";
import { useFiltroAtributos } from "@/lib/filtro-atributos";
import { refrescarPorUbicar } from "@/lib/por-ubicar";
import { useAuth, useFormatCantidad } from "@/lib/preferences";
import type { NecesidadFabricacion, NecesidadesResp, Prioridad } from "@/lib/types";

const RANGO_PRIORIDAD: Record<Prioridad, number> = { alta: 0, media: 1, baja: 2 };
const ETIQUETA_PRIORIDAD: Record<Prioridad, string> = { alta: "Alta", media: "Media", baja: "Baja" };
const CLASE_PRIORIDAD: Record<Prioridad, string> = { alta: "critico", media: "bajo", baja: "normal" };

type Orden = "prioridad" | "necesidad" | "producto";

function ordenarNecesidades(items: NecesidadFabricacion[], orden: Orden): NecesidadFabricacion[] {
  const arr = [...items];
  const porProducto = (a: NecesidadFabricacion, b: NecesidadFabricacion) =>
    a.producto.localeCompare(b.producto) || a.nombre.localeCompare(b.nombre);
  if (orden === "prioridad") {
    arr.sort((a, b) => RANGO_PRIORIDAD[a.prioridad] - RANGO_PRIORIDAD[b.prioridad] || porProducto(a, b));
  } else if (orden === "necesidad") {
    arr.sort((a, b) => b.necesidad - a.necesidad || porProducto(a, b));
  } else {
    arr.sort(porProducto);
  }
  return arr;
}

function TablaNecesidades({
  items,
  conMinMax,
  conPedidos,
  conPrioridad,
  esAdmin,
  onPrioridad,
  onProducir,
  cargando,
  formatCantidad,
  vacio,
}: {
  items: NecesidadFabricacion[];
  conMinMax?: boolean;
  conPedidos?: boolean;
  conPrioridad?: boolean;
  esAdmin?: boolean;
  onPrioridad?: (item: NecesidadFabricacion, prioridad: Prioridad) => void;
  onProducir: (item: NecesidadFabricacion) => void;
  cargando: boolean;
  formatCantidad: (n: number) => string;
  vacio: string;
}) {
  if (items.length === 0) return <p className="muted">{vacio}</p>;
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Producto / Variante</th>
            <th className="num">En stock</th>
            {conMinMax && <th className="num">Mín / Máx</th>}
            <th className="num">Necesita</th>
            <th>Tipo</th>
            {conPrioridad && <th>Prioridad</th>}
            {conPedidos && <th>Pedidos</th>}
            <th></th>
          </tr>
        </thead>
        <tbody>
          {items.map((n) => (
            <tr key={n.variantId}>
              <td>
                <strong>{n.producto}</strong>
                <div className="attr-list">
                  {n.valoracion.length > 0
                    ? n.valoracion.map((a) => (
                        <span key={a.attribute} className="attr-item">
                          <span className="attr-name">{a.attribute}</span> {a.valor}
                        </span>
                      ))
                    : <span className="muted small">—</span>}
                </div>
                <div className="small muted">{n.nombre} · {n.sku}</div>
              </td>
              <td className="num">{formatCantidad(n.stockActual)} {n.uom}</td>
              {conMinMax && <td className="num">{formatCantidad(n.stockMin)} / {n.stockMax > 0 ? formatCantidad(n.stockMax) : "—"}</td>}
              <td className="num">{formatCantidad(n.necesidad)} {n.uom}</td>
              <td>
                <span className={`badge ${n.ensamble ? "bajo" : "normal"}`}>{n.ensamble ? "Ensamble" : "Fabricar"}</span>
              </td>
              {conPrioridad && (
                <td>
                  {esAdmin && onPrioridad ? (
                    <select
                      className={`prioridad-select ${n.prioridad}`}
                      value={n.prioridad}
                      aria-label={`Prioridad de ${n.nombre}`}
                      onChange={(e) => onPrioridad(n, e.target.value as Prioridad)}
                    >
                      {(["alta", "media", "baja"] as Prioridad[]).map((p) => (
                        <option key={p} value={p}>{ETIQUETA_PRIORIDAD[p]}</option>
                      ))}
                    </select>
                  ) : (
                    <span className={`badge ${CLASE_PRIORIDAD[n.prioridad]}`}>{ETIQUETA_PRIORIDAD[n.prioridad]}</span>
                  )}
                </td>
              )}
              {conPedidos && <td className="small muted">{n.pedidos.join(", ") || "—"}</td>}
              <td>
                {n.ensamble ? (
                  <span className="muted small">Armar contra pedido</span>
                ) : (
                  <div className="row-actions">
                    <button className="btn ghost sm" disabled={cargando} onClick={() => onProducir(n)}>
                      Ingresar producción
                    </button>
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function FabricacionPage() {
  const formatCantidad = useFormatCantidad();
  const { user } = useAuth();
  const esAdmin = user?.role === "admin";
  const [data, setData] = useState<NecesidadesResp | null>(null);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [cargando, setCargando] = useState(false);
  const [minimoOpen, setMinimoOpen] = useState(false);
  const [orden, setOrden] = useState<Orden>("prioridad");

  const cargar = useCallback(async () => {
    setData(await api<NecesidadesResp>("/fabricacion/necesidades"));
  }, []);

  useEffect(() => {
    cargar().catch((e) => setError((e as Error).message));
  }, [cargar]);

  // ------------------------------------------------- Filtro producto/atributos
  const todos = useMemo(
    () => [...(data?.porVentas ?? []), ...(data?.porMinimo ?? []), ...(data?.porComprar ?? [])],
    [data],
  );
  const filtroAtributos = useFiltroAtributos(todos);
  const { pasaFiltro, hayFiltro } = filtroAtributos;

  const porVentas = ordenarNecesidades((data?.porVentas ?? []).filter(pasaFiltro), orden);
  const porMinimo = ordenarNecesidades((data?.porMinimo ?? []).filter(pasaFiltro), orden);
  const porComprar = ordenarNecesidades((data?.porComprar ?? []).filter(pasaFiltro), orden);
  const sinCoincidencias = "Sin coincidencias con el filtro.";

  // ---------------------------------------------- Ingreso de producción
  const [ingreso, setIngreso] = useState<NecesidadFabricacion | null>(null);
  const [cantidad, setCantidad] = useState("");

  function abrirIngreso(item: NecesidadFabricacion) {
    setIngreso(item);
    setCantidad(String(item.necesidad));
    setError("");
  }

  async function registrar() {
    if (!ingreso) return;
    const qty = Number(cantidad);
    if (!(qty > 0)) {
      setError("La cantidad debe ser mayor a 0");
      return;
    }
    setCargando(true);
    setError("");
    try {
      await api("/fabricacion/produccion", {
        method: "POST",
        body: JSON.stringify({ variantId: ingreso.variantId, cantidad: qty }),
      });
      const nombre = ingreso.nombre;
      setIngreso(null);
      await cargar();
      refrescarPorUbicar();
      setMsg(`Producción registrada: ${formatCantidad(qty)} de ${nombre}. Queda pendiente de ubicar.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCargando(false);
    }
  }

  async function cambiarPrioridad(item: NecesidadFabricacion, prioridad: Prioridad) {
    setError("");
    try {
      await api(`/fabricacion/variantes/${item.variantId}/prioridad`, {
        method: "PATCH",
        body: JSON.stringify({ prioridad }),
      });
      const aplicar = (lista: NecesidadFabricacion[]) =>
        lista.map((n) => (n.variantId === item.variantId ? { ...n, prioridad } : n));
      setData((prev) =>
        prev ? { porMinimo: aplicar(prev.porMinimo), porVentas: aplicar(prev.porVentas), porComprar: aplicar(prev.porComprar) } : prev,
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const totalMin = porMinimo.length;
  const totalVen = porVentas.length;
  const totalComprar = porComprar.length;

  return (
    <AppShell>
      <PageHeader
        title="Fabricación"
        subtitle="Faltantes por ventas y por stock mínimo. Al registrar producción, entra a 'Recibo de Producción' y queda pendiente de ubicar."
      />
      {error && <div className="error">{error}</div>}
      {msg && <div className="msg-ok">{msg}</div>}

      <HelpNote>
        Esta vista muestra solo lo que <strong>falta</strong>: cubrir las ventas confirmadas (explosión
        neta del BOM) y reponer hasta el mínimo. Los <strong>ensambles</strong> se arman contra pedido y sus
        componentes aparecen por separado. Al producir, el faltante se recalcula solo.
      </HelpNote>

      <StickyBar>
        <div className="toolbar">
          <div className="row" style={{ gap: 8, alignItems: "center" }}>
            <span className="small muted">Ordenar por</span>
            <Segmented
              value={orden}
              onChange={(v) => setOrden(v as Orden)}
              options={[
                { value: "prioridad", label: "Prioridad" },
                { value: "necesidad", label: "Cantidad" },
                { value: "producto", label: "Producto" },
              ]}
            />
          </div>
          <div className="grow" />
          <BuscadorAtributos filtro={filtroAtributos} />
        </div>
      </StickyBar>

      <h4 style={{ marginBottom: 4 }}>Por ventas ({totalVen})</h4>
      <p className="muted small" style={{ marginTop: 0 }}>Faltante neto de las ventas confirmadas abiertas.</p>
      <div className="card" style={{ padding: 0 }}>
        <TablaNecesidades
          items={porVentas}
          conPedidos
          conPrioridad
          esAdmin={esAdmin}
          onPrioridad={cambiarPrioridad}
          onProducir={abrirIngreso}
          cargando={cargando}
          formatCantidad={formatCantidad}
          vacio={hayFiltro ? sinCoincidencias : "Todas las ventas confirmadas están cubiertas por stock."}
        />
      </div>

      <button
        type="button"
        onClick={() => setMinimoOpen((v) => !v)}
        aria-expanded={minimoOpen}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          margin: "24px 0 0",
          padding: 0,
          border: 0,
          background: "transparent",
          cursor: "pointer",
          fontWeight: 700,
          fontSize: "1.1rem",
          color: "inherit",
        }}
      >
        <span aria-hidden="true" style={{ fontSize: "0.8em", color: "var(--brand)" }}>
          {minimoOpen ? "▾" : "▸"}
        </span>
        Por mínimo ({totalMin})
      </button>
      {minimoOpen && (
        <>
          <p className="muted small" style={{ marginTop: 0 }}>Variantes fabricables por debajo de su stock mínimo.</p>
          <div className="card" style={{ padding: 0 }}>
            <TablaNecesidades
              items={porMinimo}
              conMinMax
              conPrioridad
              esAdmin={esAdmin}
              onPrioridad={cambiarPrioridad}
              onProducir={abrirIngreso}
              cargando={cargando}
              formatCantidad={formatCantidad}
              vacio={hayFiltro ? sinCoincidencias : "Nada bajo mínimo."}
            />
          </div>
        </>
      )}

      <h4 style={{ marginBottom: 4, marginTop: 24 }}>Pendientes de compra ({totalComprar})</h4>
      <p className="muted small" style={{ marginTop: 0 }}>Solo informativo: no genera órdenes de compra.</p>
      <div className="card" style={{ padding: 0 }}>
        <TablaNecesidades
          items={porComprar}
          conPedidos
          onProducir={abrirIngreso}
          cargando={cargando}
          formatCantidad={formatCantidad}
          vacio={hayFiltro ? sinCoincidencias : "Sin pendientes de compra."}
        />
      </div>

      {ingreso && (
        <Modal title="Ingresar producción" onClose={() => setIngreso(null)} size="sm">
          <p className="muted small" style={{ marginTop: 0 }}>
            <strong>{ingreso.producto}</strong> · {ingreso.nombre} ({ingreso.sku})
          </p>
          <p className="muted small" style={{ marginTop: 0 }}>
            Necesidad actual: {formatCantidad(ingreso.necesidad)} {ingreso.uom}
          </p>
          <label>
            Cantidad producida
            <input
              type="number"
              step="0.001"
              min="0.001"
              value={cantidad}
              onChange={(e) => setCantidad(e.target.value)}
              autoFocus
            />
          </label>
          <p className="muted small">Entra a “Recibo de Producción” y queda pendiente de ubicar.</p>
          <div className="row" style={{ justifyContent: "flex-end" }}>
            <button type="button" className="btn ghost" onClick={() => setIngreso(null)}>
              Cancelar
            </button>
            <button type="button" className="btn primary" disabled={cargando || !(Number(cantidad) > 0)} onClick={registrar}>
              {cargando ? "Registrando…" : "Registrar producción"}
            </button>
          </div>
        </Modal>
      )}

      <FiltroAtributosModal filtro={filtroAtributos} />
    </AppShell>
  );
}
