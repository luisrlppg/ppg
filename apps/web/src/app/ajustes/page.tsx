"use client";

import { useState } from "react";
import AppShell from "@/components/app-shell";
import PageHeader from "@/components/ui/page-header";
import Segmented from "@/components/ui/segmented";
import { usePreferences } from "@/lib/preferences";
import type { SeparadorMiles } from "@ppg/shared";

export default function AjustesPage() {
  const { separadorMiles, setSeparadorMiles, formatCantidad } = usePreferences();
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  async function cambiar(valor: string) {
    const s = valor as SeparadorMiles;
    if (s === separadorMiles) return;
    setGuardando(true);
    setError("");
    setMsg("");
    try {
      await setSeparadorMiles(s);
      setMsg("Preferencia guardada.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <AppShell>
      <PageHeader title="Ajustes" subtitle="Preferencias personales de visualización." />
      {error && <div className="error">{error}</div>}
      {msg && <div className="msg-ok">{msg}</div>}

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Separador de miles</h3>
        <p className="muted small">Cómo se agrupan las cantidades en toda la aplicación.</p>
        <Segmented
          value={separadorMiles}
          onChange={cambiar}
          options={[
            { value: "coma", label: "Coma · 1,234.56" },
            { value: "espacio", label: "Espacio · 1 234.56" },
          ]}
        />
        <p className="muted small" style={{ marginTop: 12 }}>
          Ejemplo: <strong>{formatCantidad(1234567.89)}</strong>
          {guardando ? " · Guardando…" : ""}
        </p>
      </div>
    </AppShell>
  );
}
