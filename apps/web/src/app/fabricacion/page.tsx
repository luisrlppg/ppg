"use client";

import { useCallback, useEffect, useState } from "react";
import AppShell from "@/components/app-shell";
import { api } from "@/lib/api";
import type { FaltanteCompra, OrdenFabricacion } from "@/lib/types";

const badgeEstado = (e: string) => (e === "hecha" ? "normal" : e === "en_progreso" ? "bajo" : e === "cancelada" ? "critico" : "");

export default function FabricacionPage() {
  const [ofs, setOfs] = useState<OrdenFabricacion[]>([]);
  const [faltantes, setFaltantes] = useState<FaltanteCompra[]>([]);
  const [fEstado, setFEstado] = useState("");
  const [fTipo, setFTipo] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [selId, setSelId] = useState<number | null>(null);
  const [detalle, setDetalle] = useState<OrdenFabricacion | null>(null);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [cargando, setCargando] = useState(false);

  const cargar = useCallback(async () => {
    const [o, f] = await Promise.all([
      api<OrdenFabricacion[]>(
        `/fabricacion?${new URLSearchParams({
          ...(fEstado ? { estado: fEstado } : {}),
          ...(fTipo ? { tipo: fTipo } : {}),
          ...(busqueda ? { search: busqueda } : {}),
        })}`,
      ),
      api<FaltanteCompra[]>("/fabricacion/faltantes"),
    ]);
    setOfs(o);
    setFaltantes(f);
  }, [fEstado, fTipo, busqueda]);

  useEffect(() => {
    const t = setTimeout(() => cargar().catch((e) => setError(e.message)), 150);
    return () => clearTimeout(t);
  }, [cargar]);

  const abrirDetalle = useCallback(async (id: number) => {
    try {
      const d = await api<OrdenFabricacion>(`/fabricacion/${id}`);
      setDetalle(d);
      setSelId(id);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    if (selId !== null) abrirDetalle(selId);
  }, [selId, abrirDetalle, cargar]);

  async function iniciar(id: number) {
    setCargando(true);
    setError("");
    try {
      await api(`/fabricacion/${id}/iniciar`, { method: "POST", body: "{}" });
      setMsg("Orden en progreso.");
      cargar();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCargando(false);
    }
  }

  async function cancelar(id: number) {
    if (!window.confirm("¿Cancelar esta orden de fabricación?")) return;
    setCargando(true);
    setError("");
    try {
      await api(`/fabricacion/${id}/cancelar`, { method: "POST", body: "{}" });
      setMsg("Orden cancelada.");
      cargar();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCargando(false);
    }
  }

  return (
    <AppShell>
      <h2>Fabricación</h2>
      {error && <div className="error">{error}</div>}
      {msg && <div className="msg-ok">{msg}</div>}

      <div className="grid-2">
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Órdenes de fabricación</h3>
          {detalle && (
            <div style={{ background: "#fff8e6", border: "1px solid #f5e0a0", borderRadius: 10, padding: "12px 16px", marginBottom: 12 }}>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <strong>
                  {detalle.numero} · {detalle.producto} {detalle.nombre} ({detalle.sku}) × {detalle.cantidad}
                </strong>
                <span style={{ flex: 0 }}>
                  <span className={`badge ${detalle.tipo === "ensamble" ? "bajo" : "normal"}`}>{detalle.tipo}</span>{" "}
                  <span className={`badge ${badgeEstado(detalle.estado) || "bajo"}`}>{detalle.estado}</span>
                </span>
              </div>
              {detalle.generatedFrom && <p className="muted small" style={{ margin: "6px 0" }}>Origen: {detalle.generatedFrom}</p>}
              <ul className="step-list">
                {detalle.lines.map((l) => (
                  <li key={l.id}>
                    <strong>{l.producto}</strong> {l.nombre} ({l.sku}) × {l.cantidadRequerida} {l.uom}
                    {l.cantidadReservada > 0 ? ` · reservado: ${l.cantidadReservada}` : ""}
                  </li>
                ))}
              </ul>
              <div className="row">
                {detalle.estado === "confirmada" && (
                  <button className="btn primary" disabled={cargando} onClick={() => iniciar(detalle.id)}>
                    Iniciar
                  </button>
                )}
                {(detalle.estado === "borrador" || detalle.estado === "confirmada" || detalle.estado === "en_progreso") && (
                  <button className="btn ghost" style={{ flex: 0 }} disabled={cargando} onClick={() => cancelar(detalle.id)}>
                    Cancelar
                  </button>
                )}
                <span className="muted small">El cierre a <em>hecha</em> se registra al confirmar los reportes de producción (E3).</span>
              </div>
            </div>
          )}
          <div className="row" style={{ marginBottom: 8 }}>
            <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Nº o producto…" style={{ flex: 2 }} />
            <select value={fTipo} onChange={(e) => setFTipo(e.target.value)} style={{ flex: 1 }}>
              <option value="">Todos los tipos</option>
              <option value="fabricacion">Fabricación</option>
              <option value="ensamble">Ensamble</option>
            </select>
            <select value={fEstado} onChange={(e) => setFEstado(e.target.value)} style={{ flex: 1 }}>
              <option value="">Todos los estados</option>
              <option value="confirmada">Confirmada</option>
              <option value="en_progreso">En progreso</option>
              <option value="hecha">Hecha</option>
              <option value="cancelada">Cancelada</option>
            </select>
          </div>
          <ul className="step-list">
            {ofs.map((of) => (
              <li key={of.id} onClick={() => setSelId(of.id)} style={{ cursor: "pointer", background: selId === of.id ? "#fff8e6" : undefined }}>
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <span>
                    <strong>{of.numero}</strong> · {of.producto} {of.nombre} ({of.sku}) × {of.cantidad}
                    <div className="small muted">
                      {of.generatedFrom ? `de ${of.generatedFrom} · ` : ""}
                      {of.componenteVariantes ?? 0} componentes
                    </div>
                  </span>
                  <span style={{ flex: 0 }}>
                    <span className={`badge ${of.tipo === "ensamble" ? "bajo" : "normal"}`}>{of.tipo}</span>{" "}
                    <span className={`badge ${badgeEstado(of.estado) || "bajo"}`}>{of.estado}</span>
                  </span>
                </div>
              </li>
            ))}
            {ofs.length === 0 && <li className="muted">Sin órdenes todavía.</li>}
          </ul>
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0 }}>Pendientes de compra</h3>
          <p className="muted small">Faltantes no fabricables (sin BOM o sin componentes exactos) de las ventas confirmadas.</p>
          {faltantes.length === 0 && <p className="muted">Nada pendiente de compra.</p>}
          <ul className="step-list">
            {faltantes.map((f) => (
              <li key={f.variantId}>
                <strong>{f.producto}</strong> {f.nombre} ({f.sku}) × {f.cantidad}
                <div className="small muted">Pedidos: {f.pedidos.join(", ")}</div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </AppShell>
  );
}