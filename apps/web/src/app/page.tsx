"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AppShell from "@/components/app-shell";
import PageHeader from "@/components/ui/page-header";
import { api } from "@/lib/api";
import { HOME_BY_ROLE } from "@ppg/shared";
import type { NecesidadesResp, StockBajo } from "@/lib/types";

const MODULES = [
  { href: "/ventas", title: "Ventas", desc: "Órdenes (locales y web), confirmación con desglose/neteo y despacho por línea." },
  { href: "/fabricacion", title: "Fabricación", desc: "Faltantes por mínimo y por ventas; registra la producción conforme llega." },
  { href: "/productos", title: "Productos y variantes", desc: "Catálogo, grid de combos, precios, empaques por variante y listas de materiales (BOM)." },
  { href: "/inventario", title: "Inventario", desc: "Existencia por ubicación, ajustes, transferencias y entrada de producción." },
  { href: "/clientes", title: "Clientes", desc: "Alta, edición e importación por CSV de los clientes." },
];

interface Pendientes {
  ventasAbiertas: number;
  necesidades: number;
  faltantes: number;
  bajoStock: number;
}

export default function Home() {
  const [pend, setPend] = useState<Pendientes | null>(null);

  useEffect(() => {
    (async () => {
      const [ventas, necesidades, faltantes, bajo] = await Promise.all([
        api<unknown[]>("/ventas?estado=abierta").catch(() => []),
        api<NecesidadesResp>("/fabricacion/necesidades").catch(() => null),
        api<unknown[]>("/fabricacion/faltantes").catch(() => []),
        api<StockBajo[]>("/monitor/stock-bajo").catch(() => []),
      ]);
      setPend({
        ventasAbiertas: ventas.length,
        necesidades: (necesidades?.porMinimo.length ?? 0) + (necesidades?.porVentas.length ?? 0),
        faltantes: faltantes.length,
        bajoStock: bajo.length,
      });
    })();
  }, []);

  const stats = [
    { href: "/ventas", value: pend?.ventasAbiertas ?? 0, label: "Ventas abiertas", alert: (pend?.ventasAbiertas ?? 0) > 0 },
    { href: "/fabricacion", value: pend?.necesidades ?? 0, label: "Necesidades de fabricación", alert: (pend?.necesidades ?? 0) > 0 },
    { href: "/fabricacion", value: pend?.faltantes ?? 0, label: "Pendientes de compra", alert: (pend?.faltantes ?? 0) > 0 },
    { href: "/inventario", value: pend?.bajoStock ?? 0, label: "Productos con bajo stock", alert: (pend?.bajoStock ?? 0) > 0 },
  ];

  return (
    <AppShell>
      <PageHeader
        title="Inicio"
        subtitle={
          <>
            Tu área: <strong>{HOME_BY_ROLE["admin"]}</strong> (adaptable por rol en E3).
          </>
        }
      />

      <h3 style={{ marginBottom: 4 }}>Pendientes</h3>
      <div className="stat-grid">
        {stats.map((s) => (
          <Link key={s.label} href={s.href} className={`stat-card ${s.alert ? "alert" : ""}`}>
            <div className="stat-value">{pend ? s.value : "…"}</div>
            <div className="stat-label">{s.label}</div>
          </Link>
        ))}
      </div>

      <h3 style={{ marginBottom: 4 }}>Módulos</h3>
      <div className="grid-2">
        {MODULES.map((m) => (
          <Link key={m.href} href={m.href} style={{ textDecoration: "none", color: "inherit" }}>
            <div className="card" style={{ height: "100%" }}>
              <h3 style={{ marginTop: 0 }}>{m.title}</h3>
              <p className="muted">{m.desc}</p>
            </div>
          </Link>
        ))}
      </div>
    </AppShell>
  );
}
