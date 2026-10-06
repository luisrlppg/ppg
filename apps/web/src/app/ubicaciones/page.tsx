"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import AppShell from "@/components/app-shell";
import PageHeader from "@/components/ui/page-header";
import HelpNote from "@/components/ui/help-note";
import StickyBar from "@/components/ui/sticky-bar";
import BuscadorAtributos, { FiltroAtributosModal } from "@/components/ui/buscador-atributos";
import { api } from "@/lib/api";
import { useFiltroAtributos } from "@/lib/filtro-atributos";
import { refrescarPorUbicar } from "@/lib/por-ubicar";
import { useFormatCantidad } from "@/lib/preferences";
import type { LoteUbicar, Ubicacion } from "@/lib/types";

function SeccionLotes({
  titulo,
  descripcion,
  lotes,
  ubicaciones,
  asig,
  setAsigLote,
  onUbicar,
  cargando,
  formatCantidad,
  vacio,
}: {
  titulo: string;
  descripcion: string;
  lotes: LoteUbicar[];
  ubicaciones: Ubicacion[];
  asig: Record<number, { locationId: string; cantidad: string }>;
  setAsigLote: (lineaId: number, campo: "locationId" | "cantidad", valor: string) => void;
  onUbicar: (l: LoteUbicar) => void;
  cargando: boolean;
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
            {lotes.map((l) => {
              const a = asig[l.lineaId];
              return (
                <li key={l.lineaId} style={{ background: "#fafafa", borderRadius: 8, padding: "8px 12px" }}>
                  <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
                    <span>
                      <strong>{l.producto}</strong> {l.nombre}
                      <span className="muted small"> ({l.sku})</span>
                      <div className="small muted">
                        {l.valoracion.map((v) => `${v.attribute}: ${v.valor}`).join(" · ") || `del reporte ${l.reporte}`}
                      </div>
                      <div className="small muted">
                        {l.origen === "reporte" ? `Reporte ${l.reporte}` : "Producción desde Fabricación"} · lo registró{" "}
                        <strong>{l.usuario ?? "—"}</strong>
                      </div>
                    </span>
                    <span className="badge normal">
                      {formatCantidad(l.pendiente)} {l.uom}
                    </span>
                  </div>
                  <div className="row" style={{ alignItems: "end", marginTop: 6 }}>
                    <label style={{ flex: 1.4 }}>
                      Compartimento
                      <select value={a?.locationId ?? ""} onChange={(e) => setAsigLote(l.lineaId, "locationId", e.target.value)}>
                        <option value="">— Elegir —</option>
                        {ubicaciones.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.nombre}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label style={{ width: 110 }}>
                      Cantidad
                      <input
                        type="number"
                        step="0.001"
                        min="0.001"
                        max={l.pendiente}
                        value={a?.cantidad ?? String(l.pendiente)}
                        onChange={(e) => setAsigLote(l.lineaId, "cantidad", e.target.value)}
                      />
                    </label>
                    <button className="btn primary" style={{ flex: 0 }} disabled={cargando} onClick={() => onUbicar(l)}>
                      Ubicar
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}

export default function UbicacionesPage() {
  const formatCantidad = useFormatCantidad();
  const [lotes, setLotes] = useState<LoteUbicar[]>([]);
  const [ubicaciones, setUbicaciones] = useState<Ubicacion[]>([]);
  const [asig, setAsig] = useState<Record<number, { locationId: string; cantidad: string }>>({});
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

  function setAsigLote(lineaId: number, campo: "locationId" | "cantidad", valor: string) {
    setAsig((a) => ({
      ...a,
      [lineaId]: { locationId: a[lineaId]?.locationId ?? "", cantidad: a[lineaId]?.cantidad ?? "", [campo]: valor },
    }));
  }

  async function ubicarLote(l: LoteUbicar) {
    const a = asig[l.lineaId];
    if (!a?.locationId) {
      setError("Elige un compartimento para el lote.");
      return;
    }
    const cantidad = Number(a.cantidad || l.pendiente);
    if (!(cantidad > 0)) {
      setError("Cantidad inválida.");
      return;
    }
    setCargando(true);
    setError("");
    try {
      await api(`/reportes/lotes/${l.lineaId}/ubicar`, {
        method: "POST",
        body: JSON.stringify({ cantidad, locationId: Number(a.locationId) }),
      });
      setMsg(`Lote de ${l.producto} ${l.nombre} ubicado.`);
      setAsig((s) => {
        const { [l.lineaId]: _omit, ...rest } = s;
        return rest;
      });
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
        title="Ubicaciones de producción"
        subtitle="Todo lo producido queda en 'Recibo de Producción' esperando que le asignes su compartimento."
      />
      {error && <div className="error">{error}</div>}
      {msg && <div className="msg-ok">{msg}</div>}

      <HelpNote>
        Aquí llega lo producido por <strong>reporte de turno</strong> (tras aceptarlo en la bandeja de
        Reportes) y lo registrado en <strong>Fabricación</strong>. Asigna el compartimento y la cantidad
        que se mueve del Recibo de Producción al almacén.
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
        descripcion="Productos terminados de reportes de turno ya aceptados."
        lotes={deReporte}
        ubicaciones={ubicaciones}
        asig={asig}
        setAsigLote={setAsigLote}
        onUbicar={ubicarLote}
        cargando={cargando}
        formatCantidad={formatCantidad}
        vacio={hayFiltro ? sinCoincidencias : "Nada pendiente de reportes."}
      />

      <SeccionLotes
        titulo="Por fabricación"
        descripcion="Producción registrada desde el panel de Fabricación."
        lotes={deFabricacion}
        ubicaciones={ubicaciones}
        asig={asig}
        setAsigLote={setAsigLote}
        onUbicar={ubicarLote}
        cargando={cargando}
        formatCantidad={formatCantidad}
        vacio={hayFiltro ? sinCoincidencias : "Nada pendiente de fabricación."}
      />

      <FiltroAtributosModal filtro={filtroAtributos} />
    </AppShell>
  );
}
