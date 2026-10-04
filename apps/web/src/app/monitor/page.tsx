"use client";

import { useCallback, useEffect, useState } from "react";
import AppShell from "@/components/app-shell";
import PageHeader from "@/components/ui/page-header";
import Modal from "@/components/ui/modal";
import { api } from "@/lib/api";
import { formatCantidad } from "@ppg/shared";
import type { EventoNotificacion, StockBajo } from "@/lib/types";

export default function MonitorPage() {
  const [bajo, setBajo] = useState<StockBajo[]>([]);
  const [eventos, setEventos] = useState<EventoNotificacion[]>([]);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

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

  // -------------------------------------------------------- Crear OF
  const [ofPara, setOfPara] = useState<StockBajo | null>(null);
  const [ofCantidad, setOfCantidad] = useState("1");
  const [ofNotas, setOfNotas] = useState("");
  const [creando, setCreando] = useState(false);

  function abrirOF(v: StockBajo) {
    const sugerida = Math.max(v.objetivo - v.stockActual, 0);
    setOfPara(v);
    setOfCantidad(String(Number(sugerida.toFixed(3))));
    setOfNotas("");
    setError("");
    setMsg("");
  }

  async function crearOF(e: React.FormEvent) {
    e.preventDefault();
    if (!ofPara) return;
    const cantidad = Number(ofCantidad);
    if (!(cantidad > 0)) {
      setError("La cantidad debe ser mayor a 0.");
      return;
    }
    setCreando(true);
    setError("");
    try {
      const r = await api<{ creadas: { numero: string }[] }>("/fabricacion", {
        method: "POST",
        body: JSON.stringify({ variantId: ofPara.variantId, cantidad, notas: ofNotas.trim() || undefined }),
      });
      setOfPara(null);
      setMsg(`Se crearon ${r.creadas.length} OF(s): ${r.creadas.map((c) => c.numero).join(", ")}.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCreando(false);
    }
  }

  return (
    <AppShell>
      <PageHeader
        title="Monitor de stock"
        subtitle="Sin temporizadores ni esperas: cada movimiento de inventario revisa el umbral y notifica de inmediato solo lo nuevo. Aquí puedes revisar el estado y renotificar manualmente."
      />
      {error && <div className="error">{error}</div>}
      {msg && <div className="msg-ok">{msg}</div>}

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
                <td>{formatCantidad(v.deficit)}</td>
                <td>
                  <span className={`badge ${v.longLead ? "critico" : "bajo"}`}>{v.longLead ? "crítico" : "bajo"}</span>
                </td>
                <td style={{ textAlign: "right" }}>
                  {(() => {
                    const cubierto = v.stockActual + v.cantidadEnOF >= v.objetivo;
                    return (
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
                        <button
                          className="btn secondary sm"
                          disabled={cubierto}
                          title={cubierto ? `Ya hay ${formatCantidad(v.cantidadEnOF)} en OF` : undefined}
                          onClick={() => abrirOF(v)}
                        >
                          {cubierto ? "OF en curso" : "Crear OF"}
                        </button>
                        {v.cantidadEnOF > 0 && <span className="small muted">En OF: {formatCantidad(v.cantidadEnOF)}</span>}
                      </div>
                    );
                  })()}
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

      {ofPara && (
        <Modal title="Crear orden de fabricación" onClose={() => setOfPara(null)}>
          <form onSubmit={crearOF}>
            <p className="muted small" style={{ marginTop: 0 }}>
              <strong>{ofPara.producto}</strong> · {ofPara.nombre} ({ofPara.sku})
              <br />
              Existencia: {formatCantidad(ofPara.stockActual)} · Mínimo: {formatCantidad(ofPara.stockMin)} · Objetivo:{" "}
              {formatCantidad(ofPara.objetivo)}
              {ofPara.cantidadEnOF > 0 && (
                <>
                  <br />
                  En OF (en curso): {formatCantidad(ofPara.cantidadEnOF)}
                </>
              )}
            </p>
            <div className="row">
              <label>
                Cantidad
                <input
                  type="number"
                  step="0.001"
                  min="0"
                  value={ofCantidad}
                  onChange={(e) => setOfCantidad(e.target.value)}
                  autoFocus
                  required
                />
              </label>
              <label>
                Notas (opcional)
                <input value={ofNotas} onChange={(e) => setOfNotas(e.target.value)} placeholder="motivo, lote…" />
              </label>
            </div>
            <div className="row" style={{ justifyContent: "flex-end" }}>
              <button type="button" className="btn ghost" onClick={() => setOfPara(null)}>
                Cancelar
              </button>
              <button className="btn primary" disabled={creando}>
                {creando ? "Creando…" : "Crear OF"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </AppShell>
  );
}