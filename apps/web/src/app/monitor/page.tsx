"use client";

import { useCallback, useEffect, useState } from "react";
import AppShell from "@/components/app-shell";
import { api } from "@/lib/api";
import type { EventoNotificacion, StockBajo } from "@/lib/types";

interface EstadoMonitor {
  canales: string[];
  configurados: { email: boolean; telegram: boolean; callmebot: boolean };
  ultimaVerificacion: string | null;
  enAlerta: number;
}

export default function MonitorPage() {
  const [bajo, setBajo] = useState<StockBajo[]>([]);
  const [estado, setEstado] = useState<EstadoMonitor | null>(null);
  const [eventos, setEventos] = useState<EventoNotificacion[]>([]);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [cargando, setCargando] = useState(false);

  const cargar = useCallback(async () => {
    const [b, e, ev] = await Promise.all([
      api<StockBajo[]>("/monitor/stock-bajo"),
      api<EstadoMonitor>("/monitor/estado"),
      api<EventoNotificacion[]>("/monitor/eventos"),
    ]);
    setBajo(b);
    setEstado(e);
    setEventos(ev);
  }, []);

  useEffect(() => {
    cargar().catch((e) => setError(e.message));
  }, [cargar]);

  async function accion(path: string, body?: unknown, okMsg?: string) {
    setCargando(true);
    setError("");
    setMsg("");
    try {
      await api(path, { method: "POST", body: body ? JSON.stringify(body) : undefined });
      await cargar();
      setMsg(okMsg ?? "Listo.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCargando(false);
    }
  }

  return (
    <AppShell>
      <h2>Monitor de stock</h2>
      <p className="muted">
        Sin temporizadores ni esperas: cada movimiento de inventario revisa el umbral y notifica de inmediato solo lo{" "}
        <strong>nuevo</strong>. Aquí puedes revisar el estado y renotificar manualmente.
      </p>
      {error && <div className="error">{error}</div>}
      {msg && <div className="msg-ok">{msg}</div>}

      <div className="grid-2">
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Configuración</h3>
          <p className="small">
            Telegram: <span className="badge normal">{estado?.configurados.telegram ? "listo" : "no configurado"}</span>{" "}
            WhatsApp (CallMeBot):{" "}
            <span className="badge normal">{estado?.configurados.callmebot ? "listo" : "no configurado"}</span>{" "}
            Email: <span className="badge normal">{estado?.configurados.email ? "listo" : "no configurado"}</span>
          </p>
          <p className="small muted">
            Última verificación: {estado?.ultimaVerificacion ? new Date(estado.ultimaVerificacion).toLocaleString("es-MX") : "nunca"}
            <br />
            Variantes en alerta: <strong>{estado?.enAlerta ?? 0}</strong>
          </p>
          <div className="row">
            <button className="btn primary" disabled={cargando} onClick={() => accion("/monitor/check", undefined, "Revisión manual completada.")}>
              Revisar ahora
            </button>
            <button className="btn primary" disabled={cargando} onClick={() => accion("/monitor/notify", undefined, "Notificación forzada enviada a todos los bajos.")}>
              Notificar todo (forzado)
            </button>
          </div>
          <div className="spacer" />
          <button className="btn ghost" disabled={cargando} onClick={() => accion("/monitor/notificar-prueba", undefined, "Prueba enviada.")}>
            Enviar notificación de prueba
          </button>
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0 }}>Eventos de notificación</h3>
          <ul className="step-list" style={{ fontSize: "0.9rem" }}>
            {eventos.slice(0, 8).map((ev) => (
              <li key={ev.id} style={{ padding: "8px 12px" }}>
                <span className={`badge ${ev.ok ? "normal" : "bajo"}`}>{ev.ok ? "enviado" : "sin canal"}</span>{" "}
                {ev.subject}
                <div className="small muted">
                  {ev.channels.join(", ") || "⚠ no se pudo enviar (falta configuración)"} · {new Date(ev.createdAt).toLocaleString("es-MX")}
                </div>
              </li>
            ))}
            {eventos.length === 0 && <li className="muted">Sin eventos todavía.</li>}
          </ul>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <h3 style={{ margin: 16 }}>Bajo stock ({bajo.length})</h3>
        <table className="table" style={{ margin: 0 }}>
          <thead>
            <tr>
              <th>Producto / Variante</th>
              <th>SKU</th>
              <th>Existencia</th>
              <th>Mínimo</th>
              <th>Faltan</th>
              <th>Tipo</th>
            </tr>
          </thead>
          <tbody>
            {bajo.map((v) => (
              <tr key={v.variantId}>
                <td>
                  <strong>{v.producto}</strong>
                  <div className="small muted">{v.nombre}</div>
                </td>
                <td className="muted-2">{v.sku}</td>
                <td>
                  <strong>
                    {v.stockActual} {v.uom}
                  </strong>
                </td>
                <td>
                  {v.stockMin} {v.uom}
                </td>
                <td>
                  {v.deficit} {v.uom}
                </td>
                <td>
                  <span className={`badge ${v.longLead ? "critico" : "bajo"}`}>{v.longLead ? "crítico" : "bajo"}</span>
                </td>
              </tr>
            ))}
            {bajo.length === 0 && (
              <tr>
                <td colSpan={6} className="empty">
                  Todo en nivel normal.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}