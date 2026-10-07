"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import AppShell from "@/components/app-shell";
import PageHeader from "@/components/ui/page-header";
import StickyBar from "@/components/ui/sticky-bar";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/preferences";
import type { CostoFila } from "@/lib/types";

const money = (n: number | null | undefined) => `$${Number(n ?? 0).toFixed(2)}`;
const pct = (n: number | null | undefined) =>
  n === null || n === undefined ? "—" : `${n.toFixed(1)}%`;

function tipoLabel(f: CostoFila): string {
  if (f.fabricable && f.comprable) return "Fabricable + Comprable";
  if (f.fabricable) return "Fabricado";
  if (f.comprable) return "Comprado";
  return "—";
}

export default function CostosPage() {
  const { user } = useAuth();
  const [filas, setFilas] = useState<CostoFila[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [error, setError] = useState("");

  const cargar = useCallback(async () => {
    const qs = busqueda ? `?search=${encodeURIComponent(busqueda)}` : "";
    setFilas(await api<CostoFila[]>(`/costos${qs}`));
  }, [busqueda]);

  useEffect(() => {
    const t = setTimeout(() => cargar().catch((e) => setError(e.message)), 150);
    return () => clearTimeout(t);
  }, [cargar]);

  if (user && user.role !== "admin") {
    return (
      <AppShell>
        <div className="card empty">No tienes permiso para ver esta sección.</div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <PageHeader
        title="Costos"
        subtitle="Cada producto define su propio cálculo: valores/factores + una fórmula. El costo total es calculado; desde la ficha del producto ajustas el precio de venta y la utilidad."
      />
      {error && <div className="error">{error}</div>}

      <StickyBar>
        <div className="card" style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <label style={{ flex: 2, minWidth: 200 }}>
            Buscar
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Nombre o SKU…"
            />
          </label>
          <span className="muted small" style={{ flex: 1, textAlign: "right" }}>
            {filas.length} producto(s)
          </span>
        </div>
      </StickyBar>

      <div className="card" style={{ padding: 0 }}>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Producto</th>
                <th>SKU</th>
                <th>Tipo</th>
                <th className="num">Costo total</th>
                <th className="num">Precio</th>
                <th className="num">Margen</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f.productId}>
                  <td>
                    <Link href={`/costos/${f.productId}`}>{f.nombre}</Link>
                    {!f.tieneReceta && <span className="badge" style={{ marginLeft: 8 }}>sin costo</span>}
                    {f.tieneReceta && !f.tieneFormula && (
                      <span className="badge" style={{ marginLeft: 8 }}>suma de valores</span>
                    )}
                    {f.avisos.length > 0 && (
                      <span className="badge critico" style={{ marginLeft: 8 }} title={f.avisos.join(" · ")}>
                        revisar
                      </span>
                    )}
                  </td>
                  <td className="muted-2">{f.skuBase}</td>
                  <td className="small">{tipoLabel(f)}</td>
                  <td className="num">
                    <strong>{money(f.total)}</strong>
                  </td>
                  <td className="num">{f.precio > 0 ? money(f.precio) : "—"}</td>
                  <td className="num">
                    {f.margen === null ? "—" : `${money(f.margen)} (${pct(f.margenPct)})`}
                  </td>
                  <td className="row-actions">
                    <Link className="btn sm" href={`/costos/${f.productId}`}>
                      Abrir
                    </Link>
                  </td>
                </tr>
              ))}
              {filas.length === 0 && (
                <tr>
                  <td colSpan={7} className="empty">
                    Sin productos.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}
