"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { StatsReporte } from "@/lib/types";

interface Props {
  onError: (msg: string) => void;
}

export default function StatsProduccion({ onError }: Props) {
  const [stats, setStats] = useState<StatsReporte | null>(null);
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");

  const cargarStats = useCallback(async () => {
    try {
      const qs = new URLSearchParams();
      if (desde) qs.set("desde", desde);
      if (hasta) qs.set("hasta", hasta);
      setStats(await api<StatsReporte>(`/reportes/stats?${qs}`));
    } catch (err) {
      onError((err as Error).message);
    }
  }, [desde, hasta, onError]);

  useEffect(() => {
    cargarStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="card">
      <h4 style={{ marginTop: 0 }}>Estadísticas de producción</h4>
      <div className="row" style={{ alignItems: "end" }}>
        <label>
          Desde
          <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
        </label>
        <label>
          Hasta
          <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
        </label>
        <button className="btn primary" style={{ flex: 0 }} onClick={cargarStats}>
          Calcular
        </button>
        <a
          className="btn"
          style={{ flex: 0 }}
          href={`/api/reportes/exportar?${(() => {
            const q = new URLSearchParams();
            if (desde) q.set("desde", desde);
            if (hasta) q.set("hasta", hasta);
            return q.toString();
          })()}`}
        >
          Descargar CSV
        </a>
      </div>

      {stats && (
        <>
          <div className="grid-2" style={{ marginTop: 10 }}>
            <div className="card" style={{ margin: 0 }}>
              <p className="muted small" style={{ margin: 0 }}>Total producido (final)</p>
              <strong style={{ fontSize: "1.4rem" }}>{stats.totalFinal}</strong>
            </div>
            <div className="card" style={{ margin: 0 }}>
              <p className="muted small" style={{ margin: 0 }}>Consumos registrados</p>
              <strong style={{ fontSize: "1.4rem" }}>{stats.totalConsumo}</strong>
            </div>
            <div className="card" style={{ margin: 0 }}>
              <p className="muted small" style={{ margin: 0 }}>Reportes aplicados</p>
              <strong style={{ fontSize: "1.4rem" }}>{stats.reportesAplicados}</strong>
            </div>
            <div className="card" style={{ margin: 0 }}>
              <p className="muted small" style={{ margin: 0 }}>Rango</p>
              <strong>
                {stats.desde} → {stats.hasta}
              </strong>
            </div>
          </div>

          <h5 style={{ marginTop: 16 }}>Producción por sección (unidades / persona-hora)</h5>
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            <table className="table" style={{ margin: 0 }}>
              <thead>
                <tr>
                  <th>Sección</th>
                  <th>Unidades</th>
                  <th>Unidades / persona-hora</th>
                  <th style={{ width: "30%" }}>Gráfica</th>
                </tr>
              </thead>
              <tbody>
                {stats.porSeccion.map((s) => {
                  const maxU = Math.max(1, ...stats.porSeccion.map((x) => x.unidades));
                  return (
                    <tr key={s.seccion}>
                      <td>{s.seccion}</td>
                      <td>{s.unidades}</td>
                      <td>{s.unidadesPorPersonaHora}</td>
                      <td>
                        <div style={{ background: "#eee", borderRadius: 6, overflow: "hidden", height: 14 }}>
                          <div style={{ width: `${Math.max(2, (s.unidades / maxU) * 100)}%`, background: "#1a3a8a", height: "100%" }} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {stats.porSeccion.length === 0 && (
                  <tr>
                    <td colSpan={4} className="empty">Sin datos en el rango.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <h5 style={{ marginTop: 16 }}>Consumo por variante</h5>
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            <table className="table" style={{ margin: 0 }}>
              <thead>
                <tr>
                  <th>Producto</th>
                  <th>Variante</th>
                  <th>Unidades</th>
                </tr>
              </thead>
              <tbody>
                {stats.consumo.map((c) => (
                  <tr key={c.variantId}>
                    <td>{c.producto}</td>
                    <td>{c.nombre}</td>
                    <td>{c.unidades}</td>
                  </tr>
                ))}
                {stats.consumo.length === 0 && (
                  <tr>
                    <td colSpan={3} className="empty">Sin consumos en el rango.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
