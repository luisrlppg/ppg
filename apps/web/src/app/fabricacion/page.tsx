"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import AppShell from "@/components/app-shell";
import PageHeader from "@/components/ui/page-header";
import HelpNote from "@/components/ui/help-note";
import Modal from "@/components/ui/modal";
import StickyBar from "@/components/ui/sticky-bar";
import BuscadorAtributos, { FiltroAtributosModal } from "@/components/ui/buscador-atributos";
import { api } from "@/lib/api";
import { useFiltroAtributos } from "@/lib/filtro-atributos";
import { refrescarPorUbicar } from "@/lib/por-ubicar";
import { useFormatCantidad } from "@/lib/preferences";
import type { NecesidadFabricacion, NecesidadesResp } from "@/lib/types";

function TablaNecesidades({
  items,
  conMinMax,
  conPedidos,
  onProducir,
  cargando,
  formatCantidad,
  vacio,
}: {
  items: NecesidadFabricacion[];
  conMinMax?: boolean;
  conPedidos?: boolean;
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
            {conPedidos && <th>Pedidos</th>}
            <th></th>
          </tr>
        </thead>
        <tbody>
          {items.map((n) => (
            <tr key={n.variantId}>
              <td>
                <strong>{n.producto}</strong>
                <div className="small muted">{n.nombre} · {n.sku}</div>
              </td>
              <td className="num">{formatCantidad(n.stockActual)} {n.uom}</td>
              {conMinMax && <td className="num">{formatCantidad(n.stockMin)} / {n.stockMax > 0 ? formatCantidad(n.stockMax) : "—"}</td>}
              <td className="num">{formatCantidad(n.necesidad)} {n.uom}</td>
              <td>
                <span className={`badge ${n.ensamble ? "bajo" : "normal"}`}>{n.ensamble ? "Ensamble" : "Fabricar"}</span>
              </td>
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
  const [data, setData] = useState<NecesidadesResp | null>(null);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [cargando, setCargando] = useState(false);
  const [minimoOpen, setMinimoOpen] = useState(false);

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

  const porVentas = (data?.porVentas ?? []).filter(pasaFiltro);
  const porMinimo = (data?.porMinimo ?? []).filter(pasaFiltro);
  const porComprar = (data?.porComprar ?? []).filter(pasaFiltro);
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

  const totalMin = porMinimo.length;
  const totalVen = porVentas.length;
  const totalComprar = porComprar.length;

  return (
    <AppShell>
      <PageHeader
        title="Fabricación"
        subtitle="Faltantes por ventas y por stock mínimo. Registra la producción conforme llegue a la ubicación que elijas."
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
          <p className="muted small" style={{ marginTop: 0 }}>Variantes fabricables por debajo de su stock objetivo.</p>
          <div className="card" style={{ padding: 0 }}>
            <TablaNecesidades
              items={porMinimo}
              conMinMax
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

      {ingreso && paso === 1 && (
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
          <div className="row" style={{ justifyContent: "flex-end" }}>
            <button type="button" className="btn ghost" onClick={() => setIngreso(null)}>
              Cancelar
            </button>
            <button type="button" className="btn primary" disabled={!(Number(cantidad) > 0)} onClick={() => setPaso(2)}>
              Continuar
            </button>
          </div>
        </Modal>
      )}

      {ingreso && paso === 2 && (
        <Modal title="Ubicación de la producción" onClose={() => setIngreso(null)} size="sm">
          <p className="muted small" style={{ marginTop: 0 }}>
            Registrar <strong>{formatCantidad(Number(cantidad))} {ingreso.uom}</strong> de {ingreso.producto} · {ingreso.nombre}
          </p>
          <label>
            Ubicación destino
            <select value={locationId} onChange={(e) => setLocationId(e.target.value)} autoFocus>
              <option value="">Selecciona una ubicación…</option>
              {ubicaciones.map((u) => (
                <option key={u.id} value={u.id}>{u.nombre}{u.tipo === "temporal" ? " (temporal)" : ""}</option>
              ))}
            </select>
          </label>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <button type="button" className="btn ghost" onClick={() => setPaso(1)}>
              Atrás
            </button>
            <button type="button" className="btn primary" disabled={cargando || !locationId} onClick={registrar}>
              {cargando ? "Registrando…" : "Registrar producción"}
            </button>
          </div>
        </Modal>
      )}

      <FiltroAtributosModal filtro={filtroAtributos} />
    </AppShell>
  );
}
