"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import AppShell from "@/components/app-shell";
import PageHeader from "@/components/ui/page-header";
import HelpNote from "@/components/ui/help-note";
import StickyBar from "@/components/ui/sticky-bar";
import Modal from "@/components/ui/modal";
import BuscadorAtributos, { FiltroAtributosModal } from "@/components/ui/buscador-atributos";
import { api } from "@/lib/api";
import { useFiltroAtributos } from "@/lib/filtro-atributos";
import { refrescarPorUbicar } from "@/lib/por-ubicar";
import { useFormatCantidad } from "@/lib/preferences";
import type { LoteUbicar, Ubicacion } from "@/lib/types";

function DetalleLote({ l }: { l: LoteUbicar }) {
  return (
    <>
      <div className="small muted">
        {l.valoracion.map((v) => `${v.attribute}: ${v.valor}`).join(" · ") || `del reporte ${l.reporte}`}
      </div>
      <div className="small muted">
        {l.origen === "reporte" ? `Reporte ${l.reporte}` : "Producción desde Fabricación"} · lo registró{" "}
        <strong>{l.usuario ?? "—"}</strong>
      </div>
    </>
  );
}

function SeccionLotes({
  titulo,
  descripcion,
  lotes,
  onAbrir,
  formatCantidad,
  vacio,
}: {
  titulo: string;
  descripcion: string;
  lotes: LoteUbicar[];
  onAbrir: (l: LoteUbicar) => void;
  formatCantidad: (n: number) => string;
  vacio: string;
}) {
  return (
    <>
      <h4 style={{ marginBottom: 4 }}>{titulo} ({lotes.length})</h4>
      <p className="muted small" style={{ marginTop: 0 }}>{descripcion}</p>
      <div className="card" style={{ padding: 0 }}>
        {lotes.length === 0 ? (
          <p className="muted" style={{ padding: 16 }}>{vacio}</p>
        ) : (
          <ul className="step-list" style={{ padding: 12 }}>
            {lotes.map((l) => (
              <li
                key={l.lineaId}
                className="lote-row"
                role="button"
                tabIndex={0}
                onClick={() => onAbrir(l)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onAbrir(l);
                  }
                }}
              >
                <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
                  <span>
                    <strong>{l.producto}</strong> {l.nombre}
                    <span className="muted small"> ({l.sku})</span>
                    {l.estadoReporte === "pendiente" && (
                      <span className="badge bajo" style={{ marginLeft: 8 }}>Por aplicar</span>
                    )}
                    <DetalleLote l={l} />
                  </span>
                  <span className="badge normal">
                    {formatCantidad(l.pendiente)} {l.uom}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

function ModalUbicarLote({
  lote,
  ubicaciones,
  cargando,
  onClose,
  onUbicar,
  formatCantidad,
}: {
  lote: LoteUbicar;
  ubicaciones: Ubicacion[];
  cargando: boolean;
  onClose: () => void;
  onUbicar: (locationId: number, cantidad: number) => void;
  formatCantidad: (n: number) => string;
}) {
  const [busqueda, setBusqueda] = useState("");
  const [locationId, setLocationId] = useState<number | null>(null);
  const [cantidad, setCantidad] = useState(String(lote.pendiente));
  const [mostrarLista, setMostrarLista] = useState(false);

  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return ubicaciones;
    return ubicaciones.filter((u) => u.nombre.toLowerCase().includes(q));
  }, [busqueda, ubicaciones]);

  function elegir(u: Ubicacion) {
    setLocationId(u.id);
    setBusqueda(u.nombre);
    setMostrarLista(false);
  }

  const cantidadNum = Number(cantidad);
  const valido = locationId !== null && cantidadNum > 0 && cantidadNum <= lote.pendiente;

  return (
    <Modal
      title={`Ubicar ${lote.producto} ${lote.nombre}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn ghost" onClick={onClose} disabled={cargando}>
            Cancelar
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={cargando || !valido}
            onClick={() => locationId !== null && onUbicar(locationId, cantidadNum)}
          >
            Ubicar
          </button>
        </>
      }
    >
      <p className="muted small" style={{ marginTop: 0 }}>
        {lote.sku} · pendiente {formatCantidad(lote.pendiente)} {lote.uom}
      </p>
      <DetalleLote l={lote} />
      {lote.estadoReporte === "pendiente" && (
        <p className="small" style={{ marginTop: 8 }}>
          Al ubicar este lote se <strong>aplica el reporte</strong>: lo terminado entra al almacén y se descuentan
          los consumos.
        </p>
      )}

      <div style={{ marginTop: 12 }}>
        <div className="small" style={{ marginBottom: 4 }}>Buscar compartimento</div>
        <div className="buscador-wrap" style={{ maxWidth: "100%" }}>
          <input
            autoFocus
            value={busqueda}
            placeholder="Escribe el nombre de la ubicación…"
            onChange={(e) => {
              setBusqueda(e.target.value);
              setLocationId(null);
              setMostrarLista(true);
            }}
            onFocus={() => setMostrarLista(true)}
            onBlur={() => setTimeout(() => setMostrarLista(false), 120)}
          />
          {mostrarLista && (
            <ul className="buscador-lista">
              {filtradas.length === 0 ? (
                <li className="muted small" style={{ padding: "8px 10px" }}>
                  Sin coincidencias.
                </li>
              ) : (
                filtradas.map((u) => (
                  <li key={u.id}>
                    <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => elegir(u)}>
                      {u.nombre}
                    </button>
                  </li>
                ))
              )}
            </ul>
          )}
        </div>
      </div>

      <label style={{ display: "block", marginTop: 12 }}>
        Cantidad a mover
        <input
          type="number"
          step="0.001"
          min="0.001"
          max={lote.pendiente}
          value={cantidad}
          onChange={(e) => setCantidad(e.target.value)}
        />
      </label>
    </Modal>
  );
}

export default function BandejaPage() {
  const formatCantidad = useFormatCantidad();
  const [lotes, setLotes] = useState<LoteUbicar[]>([]);
  const [ubicaciones, setUbicaciones] = useState<Ubicacion[]>([]);
  const [loteModal, setLoteModal] = useState<LoteUbicar | null>(null);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [cargando, setCargando] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const [ls, us] = await Promise.all([
        api<LoteUbicar[]>("/reportes/lotes"),
        api<Ubicacion[]>("/inventario/ubicaciones"),
      ]);
      setLotes(ls);
      setUbicaciones(us.filter((u) => u.tipo === "almacen"));
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  // ------------------------------------------------------ Filtro por atributos
  const filtroAtributos = useFiltroAtributos(lotes);
  const { pasaFiltro, hayFiltro } = filtroAtributos;
  const deReporte = useMemo(() => lotes.filter((l) => l.origen === "reporte").filter(pasaFiltro), [lotes, pasaFiltro]);
  const deFabricacion = useMemo(() => lotes.filter((l) => l.origen === "fabricacion").filter(pasaFiltro), [lotes, pasaFiltro]);
  const sinCoincidencias = "Sin coincidencias con el filtro.";
  const totalPendiente = lotes.reduce((a, l) => a + l.pendiente, 0);

  async function ubicarLote(locationId: number, cantidad: number) {
    if (!loteModal) return;
    setCargando(true);
    setError("");
    try {
      await api(`/reportes/lotes/${loteModal.lineaId}/ubicar`, {
        method: "POST",
        body: JSON.stringify({ cantidad, locationId }),
      });
      setMsg(`Lote de ${loteModal.producto} ${loteModal.nombre} ubicado.`);
      setLoteModal(null);
      await cargar();
      refrescarPorUbicar();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setCargando(false);
    }
  }

  return (
    <AppShell>
      <PageHeader
        title="Bandeja"
        subtitle="Lo producido por reportes de turno y por Fabricación, listo para asignarle su compartimento."
      />
      {error && <div className="error">{error}</div>}
      {msg && <div className="msg-ok">{msg}</div>}

      <HelpNote>
        Aquí llega lo producido por <strong>reporte de turno</strong> y lo registrado en <strong>Fabricación</strong>.
        Haz clic en un producto para asignar el compartimento y la cantidad que se mueve del Recibo de Producción al
        almacén. Ubicar un reporte pendiente equivale a aplicarlo: entra el producto terminado y se descuentan los
        consumos.
      </HelpNote>

      <StickyBar>
        <div className="toolbar">
          <span className="muted small">
            {lotes.length} pendiente(s) · {formatCantidad(totalPendiente)} unidades
          </span>
          <div className="grow" />
          <BuscadorAtributos filtro={filtroAtributos} />
        </div>
      </StickyBar>

      <SeccionLotes
        titulo="Por reporte de producción"
        descripcion="Productos terminados de reportes de turno (pendientes de aplicar o ya aplicados)."
        lotes={deReporte}
        onAbrir={setLoteModal}
        formatCantidad={formatCantidad}
        vacio={hayFiltro ? sinCoincidencias : "Nada pendiente de reportes."}
      />

      <SeccionLotes
        titulo="Por fabricación"
        descripcion="Producción registrada desde el panel de Fabricación."
        lotes={deFabricacion}
        onAbrir={setLoteModal}
        formatCantidad={formatCantidad}
        vacio={hayFiltro ? sinCoincidencias : "Nada pendiente de fabricación."}
      />

      <FiltroAtributosModal filtro={filtroAtributos} />

      {loteModal && (
        <ModalUbicarLote
          lote={loteModal}
          ubicaciones={ubicaciones}
          cargando={cargando}
          onClose={() => !cargando && setLoteModal(null)}
          onUbicar={ubicarLote}
          formatCantidad={formatCantidad}
        />
      )}
    </AppShell>
  );
}
