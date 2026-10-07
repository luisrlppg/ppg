"use client";

import { api } from "@/lib/api";
import type { Categoria, ProductoDetalle } from "@/lib/types";

interface Props {
  prodId: number;
  d: ProductoDetalle;
  categorias: Categoria[];
  cargar: () => Promise<void>;
  notify: (e: Error | null, okMsg: string) => void;
}

export default function SeccionDatos({ prodId, d, categorias, cargar, notify }: Props) {
  return (
    <div className="card section-anchor" id="datos">
      <div className="row" style={{ alignItems: "flex-end" }}>
        <label style={{ flex: 1 }}>
          Categoría
          <select
            value={d.categoryId ?? ""}
            onChange={(e) => {
              const val = e.target.value ? Number(e.target.value) : null;
              api(`/productos/${prodId}`, { method: "PATCH", body: JSON.stringify({ categoryId: val }) })
                .then(() => cargar()).catch((err) => notify(err as Error, ""));
            }}
          >
            <option value="">— Sin categoría —</option>
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>{c.nombre}</option>
            ))}
          </select>
        </label>
      </div>
      <label className="row" style={{ gap: 8, alignItems: "center", marginTop: 12 }}>
        <input
          type="checkbox"
          checked={d.vendible}
          onChange={(e) => {
            api(`/productos/${prodId}`, { method: "PATCH", body: JSON.stringify({ vendible: e.target.checked }) })
              .then(() => cargar())
              .catch((err) => notify(err as Error, ""));
          }}
          style={{ width: "auto", margin: 0 }}
        />
        <span>A la venta</span>
        <span className="muted small">Se ofrece en el modal de nueva venta con sus variantes activas.</span>
      </label>
      <label className="row" style={{ gap: 8, alignItems: "center", marginTop: 8 }}>
        <input
          type="checkbox"
          checked={d.fabricable}
          onChange={(e) => {
            api(`/productos/${prodId}`, { method: "PATCH", body: JSON.stringify({ fabricable: e.target.checked }) })
              .then(() => cargar())
              .catch((err) => notify(err as Error, ""));
          }}
          style={{ width: "auto", margin: 0 }}
        />
        <span>Fabricable</span>
        <span className="muted small">Se puede producir: genera orden de fabricación (con o sin BOM).</span>
      </label>
      <label className="row" style={{ gap: 8, alignItems: "center", marginTop: 8 }}>
        <input
          type="checkbox"
          checked={d.comprable}
          onChange={(e) => {
            api(`/productos/${prodId}`, { method: "PATCH", body: JSON.stringify({ comprable: e.target.checked }) })
              .then(() => cargar())
              .catch((err) => notify(err as Error, ""));
          }}
          style={{ width: "auto", margin: 0 }}
        />
        <span>Comprable</span>
        <span className="muted small">Se puede adquirir por compra.</span>
      </label>
    </div>
  );
}
