"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import AppShell from "@/components/app-shell";
import PageHeader from "@/components/ui/page-header";
import { api } from "@/lib/api";
import { formatCantidad } from "@ppg/shared";
import type { EventoNotificacion, StockBajo } from "@/lib/types";

export default function MonitorPage() {
  const [bajo, setBajo] = useState<StockBajo[]>([]);
  const [eventos, setEventos] = useState<EventoNotificacion[]>([]);
  const [error, setError] = useState("");

  const cargar = useCallback(async () => {
    const [b, ev] = await Promise.all([
      api<StockBajo[]>("/monitor/stock-bajo"),
      api<EventoNotificacion[]>("/monitor/eventos"),
    ]);
    setBajo(b);
    setEventos(ev);
  }, []);

  useEffect(() => {
    cargar().catch((e) => setError(e.message));
  }, [cargar]);

  return (
    <AppShell>
      <PageHeader
        title="Monitor de stock"
        subtitle="Sin temporizadores ni esperas: cada movimiento de inventario revisa el umbral y notifica de inmediato solo lo nuevo. Aquí puedes revisar el estado y renotificar manualmente."
      />
      {error && <div className="error">{error}</div>}

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

      <div className="card" style={{ padding: 0 }}>
        <h3 style={{ margin: 16 }}>Bajo stock ({bajo.length})</h3>
        <table className="table" style={{ margin: 0 }}>
          <thead>
            <tr>
              <th>Producto / Variante</th>
              <th>SKU</th>
              <th>Existencia</th>
              <th>Mínimo</th>
              <th>Máximo</th>
              <th>Tipo</th>
              <th></th>
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
                  <strong>{formatCantidad(v.stockActual)}</strong>
                </td>
                <td>{formatCantidad(v.stockMin)}</td>
                <td>{formatCantidad(v.stockMax)}</td>
                <td>
                  <span className={`badge ${v.longLead ? "critico" : "bajo"}`}>{v.longLead ? "crítico" : "bajo"}</span>
                </td>
                <td style={{ textAlign: "right" }}>
                  <Link className="btn ghost sm" href="/fabricacion">
                    Ir a Fabricación
                  </Link>
                </td>
              </tr>
            ))}
            {bajo.length === 0 && (
              <tr>
                <td colSpan={7} className="empty">
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
