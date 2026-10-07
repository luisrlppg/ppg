"use client";

import { useEffect, useRef, useState } from "react";
import AppShell from "@/components/app-shell";
import PageHeader from "@/components/ui/page-header";
import Segmented from "@/components/ui/segmented";
import HistorialReportes from "@/components/reportes/historial-reportes";
import StatsProduccion from "@/components/reportes/stats-produccion";
import CapturaReporte, { type CapturaReporteHandle } from "@/components/reportes/captura-reporte";
import { api } from "@/lib/api";
import type { PublicUser } from "@ppg/shared";

type Tab = "reportes" | "stats";
type Vista = "capturar" | "historial";

export default function ReportesPage() {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [tab, setTab] = useState<Tab>("reportes");
  const [vista, setVista] = useState<Vista>("capturar");
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [recargarSenal, setRecargarSenal] = useState(0);
  const capturaRef = useRef<CapturaReporteHandle>(null);

  useEffect(() => {
    api<{ user: PublicUser }>("/auth/me")
      .then((d) => setUser(d.user))
      .catch(() => setUser(null));
  }, []);

  const esGestion = user?.role === "admin";

  function editar(id: number) {
    setTab("reportes");
    setVista("capturar");
    capturaRef.current?.editar(id);
  }

  return (
    <AppShell>
      <PageHeader
        title="Reportes de producción"
        subtitle="Captura de reportes por turno; lo producido se ubica desde la Bandeja."
      />
      {error && <div className="error">{error}</div>}
      {msg && <div className="msg-ok">{msg}</div>}

      <div className="subnav">
        <button className={`btn ${tab === "reportes" ? "primary" : "ghost"}`} onClick={() => { setTab("reportes"); setError(""); setMsg(""); }}>
          Reportes
        </button>
        {esGestion && (
          <button className={`btn ${tab === "stats" ? "primary" : "ghost"}`} onClick={() => { setTab("stats"); setError(""); setMsg(""); }}>
            Estadísticas
          </button>
        )}
      </div>

      {tab === "reportes" && (
        <>
          <div className="row" style={{ marginBottom: 12 }}>
            <Segmented
              value={vista}
              onChange={(v) => {
                setVista(v as Vista);
                setError("");
                setMsg("");
              }}
              options={[
                { value: "capturar", label: "Capturar" },
                { value: "historial", label: "Historial" },
              ]}
            />
          </div>
          {vista === "capturar" ? (
            <CapturaReporte
              ref={capturaRef}
              setError={setError}
              setMsg={setMsg}
              onGuardado={() => {
                setRecargarSenal((s) => s + 1);
                setVista("historial");
              }}
            />
          ) : (
            <HistorialReportes
              recargarSenal={recargarSenal}
              onEditar={editar}
              onError={(m) => setError(m)}
              onMsg={(m) => setMsg(m)}
            />
          )}
        </>
      )}
      {tab === "stats" && esGestion && (
        <StatsProduccion onError={(msg) => setError(msg)} />
      )}
    </AppShell>
  );
}
