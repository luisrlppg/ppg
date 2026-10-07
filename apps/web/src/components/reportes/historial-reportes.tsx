"use client";

import { useCallback, useEffect, useState } from "react";
import Modal from "@/components/ui/modal";
import ConfirmDialog from "@/components/ui/confirm-dialog";
import StickyBar from "@/components/ui/sticky-bar";
import { api } from "@/lib/api";
import { useFormatCantidad } from "@/lib/preferences";
import type { Reporte, ReporteDetalle } from "@/lib/types";

interface Props {
  recargarSenal: number;
  onEditar: (id: number) => void;
  onError: (msg: string) => void;
  onMsg: (msg: string) => void;
}

const SECCION_LABEL: Record<string, string> = {
  maquina1: "Máquina 1",
  maquina2: "Máquina 2",
  maquina3: "Máquina 3",
  ensamble: "Ensamble",
  ensartado: "Ensartado",
  pegado: "Pegado",
  perforado: "Perforado",
  fabricacion: "Fabricación",
};

const TIPO_LABEL: Record<string, string> = {
  final: "Final",
  consumo: "Consumo",
  informativo: "Informativo",
};

const TURNOS: { value: string; label: string }[] = [
  { value: "", label: "Todos" },
  { value: "matutino", label: "Matutino" },
  { value: "vespertino", label: "Vespertino" },
  { value: "nocturno", label: "Nocturno" },
];

const ESTADOS: { value: string; label: string }[] = [
  { value: "", label: "Todos" },
  { value: "pendiente", label: "Pendiente" },
  { value: "aplicado", label: "Aplicado" },
  { value: "cancelado", label: "Cancelado" },
];

function fechaCorta(iso: string): string {
  return new Date(iso).toLocaleDateString("es-MX", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export default function HistorialReportes({ recargarSenal, onEditar, onError, onMsg }: Props) {
  const formatCantidad = useFormatCantidad();
  const [reportes, setReportes] = useState<Reporte[]>([]);
  const [cargando, setCargando] = useState(false);
  const [fecha, setFecha] = useState("");
  const [turno, setTurno] = useState("");
  const [estado, setEstado] = useState("");
  const [search, setSearch] = useState("");

  const [detalle, setDetalle] = useState<ReporteDetalle | null>(null);
  const [cancelar, setCancelar] = useState<Reporte | null>(null);
  const [procesando, setProcesando] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const qs = new URLSearchParams();
      if (fecha) qs.set("fecha", fecha);
      if (turno) qs.set("turno", turno);
      if (estado) qs.set("estado", estado);
      if (search.trim()) qs.set("search", search.trim());
      setReportes(await api<Reporte[]>(`/reportes?${qs}`));
    } catch (err) {
      onError((err as Error).message);
    } finally {
      setCargando(false);
    }
  }, [fecha, turno, estado, search, onError]);

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recargarSenal]);

  async function verDetalle(id: number) {
    try {
      setDetalle(await api<ReporteDetalle>(`/reportes/${id}`));
    } catch (err) {
      onError((err as Error).message);
    }
  }

  async function confirmarCancelar() {
    if (!cancelar) return;
    setProcesando(true);
    try {
      await api(`/reportes/${cancelar.id}/cancelar`, { method: "POST" });
      onMsg(`Reporte ${cancelar.numero} cancelado.`);
      setCancelar(null);
      await cargar();
    } catch (err) {
      onError((err as Error).message);
    } finally {
      setProcesando(false);
    }
  }

  return (
    <>
      <StickyBar>
        <div className="toolbar">
          <label style={{ width: 160 }}>
            Fecha
            <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </label>
          <label style={{ width: 150 }}>
            Turno
            <select value={turno} onChange={(e) => setTurno(e.target.value)}>
              {TURNOS.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </label>
          <label style={{ width: 150 }}>
            Estado
            <select value={estado} onChange={(e) => setEstado(e.target.value)}>
              {ESTADOS.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </label>
          <label style={{ flex: 1, minWidth: 180 }}>
            Buscar
            <input value={search} placeholder="Número de reporte…" onChange={(e) => setSearch(e.target.value)} />
          </label>
          <button type="button" className="btn primary" style={{ flex: 0 }} onClick={cargar} disabled={cargando}>
            {cargando ? "Cargando…" : "Filtrar"}
          </button>
        </div>
      </StickyBar>

      <div className="card" style={{ padding: 0 }}>
        <table className="table" style={{ margin: 0 }}>
          <thead>
            <tr>
              <th>Reporte</th>
              <th>Fecha</th>
              <th>Turno</th>
              <th>Pers.</th>
              <th>Estado</th>
              <th>Final</th>
              <th>Consumo</th>
              <th>Info</th>
              <th>Secciones</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {reportes.map((r) => (
              <tr key={r.id}>
                <td><strong>{r.numero}</strong></td>
                <td>{fechaCorta(r.fecha)}</td>
                <td style={{ textTransform: "capitalize" }}>{r.turno}</td>
                <td>{r.personas}</td>
                <td><span className={`badge ${r.estado === "aplicado" ? "normal" : r.estado === "cancelado" ? "critico" : "bajo"}`}>{r.estado}</span></td>
                <td>{formatCantidad(r.totalFinal)}</td>
                <td>{formatCantidad(r.totalConsumo)}</td>
                <td>{formatCantidad(r.totalInformativo)}</td>
                <td className="small muted">{r.secciones.map((s) => SECCION_LABEL[s] ?? s).join(", ")}</td>
                <td>
                  <div className="row" style={{ flex: 0, gap: 6, justifyContent: "flex-end" }}>
                    <button type="button" className="btn ghost" style={{ flex: 0 }} onClick={() => verDetalle(r.id)}>
                      Ver
                    </button>
                    {r.estado === "pendiente" && (
                      <>
                        <button type="button" className="btn" style={{ flex: 0 }} onClick={() => onEditar(r.id)}>
                          Editar
                        </button>
                        <button type="button" className="btn danger" style={{ flex: 0 }} onClick={() => setCancelar(r)}>
                          Cancelar
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {reportes.length === 0 && (
              <tr>
                <td colSpan={10} className="empty">
                  {cargando ? "Cargando…" : "Sin reportes."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {detalle && (
        <Modal title={`Reporte ${detalle.numero}`} onClose={() => setDetalle(null)} size="lg">
          <p className="muted small" style={{ marginTop: 0 }}>
            {fechaCorta(detalle.fecha)} · <span style={{ textTransform: "capitalize" }}>{detalle.turno}</span> ·{" "}
            {detalle.personas} persona(s) · {detalle.horasTrabajadas ?? "—"} h · <strong>{detalle.estado}</strong>
          </p>
          {detalle.notas && <p className="small">{detalle.notas}</p>}
          <div className="card" style={{ padding: 0, marginTop: 8 }}>
            <table className="table" style={{ margin: 0 }}>
              <thead>
                <tr>
                  <th>Sección</th>
                  <th>Tipo</th>
                  <th>Producto</th>
                  <th>Variante</th>
                  <th>SKU</th>
                  <th>Cantidad</th>
                </tr>
              </thead>
              <tbody>
                {detalle.lines.map((l) => (
                  <tr key={l.id}>
                    <td>{SECCION_LABEL[l.seccion] ?? l.seccion}</td>
                    <td>{TIPO_LABEL[l.tipo] ?? l.tipo}</td>
                    <td>{l.producto ?? "—"}</td>
                    <td>{l.nombre ?? "—"}</td>
                    <td className="muted small">{l.sku ?? "—"}</td>
                    <td>{formatCantidad(l.ok)} {l.uom ?? ""}</td>
                  </tr>
                ))}
                {detalle.lines.length === 0 && (
                  <tr>
                    <td colSpan={6} className="empty">Sin líneas.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Modal>
      )}

      {cancelar && (
        <ConfirmDialog
          title="Cancelar reporte"
          danger
          confirmLabel="Cancelar reporte"
          loading={procesando}
          message={
            <>
              ¿Cancelar el reporte <strong>{cancelar.numero}</strong>? Un reporte cancelado no toca inventario.
            </>
          }
          onConfirm={confirmarCancelar}
          onClose={() => !procesando && setCancelar(null)}
        />
      )}
    </>
  );
}
