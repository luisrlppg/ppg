"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { ProductoDetalle } from "@/lib/types";

interface BomRow {
  componentId: number;
  nombre: string;
  cantidad: number;
  tipo: string;
}

interface Props {
  prodId: number;
  componentes: ProductoDetalle["componentes"];
  notify: (e: Error | null, okMsg: string) => void;
}

export default function SeccionBom({ prodId, componentes, notify }: Props) {
  const [bomRows, setBomRows] = useState<BomRow[]>([]);
  const [buscaComp, setBuscaComp] = useState("");
  const [resultComp, setResultComp] = useState<{ id: number; nombre: string; sku: string; producto: string }[]>([]);

  useEffect(() => {
    setBomRows(componentes.map((c) => ({ ...c })));
  }, [componentes]);

  async function buscarComponentes(q: string) {
    setBuscaComp(q);
    if (!q.trim()) { setResultComp([]); return; }
    const r = await api<{ id: number; nombre: string; sku: string; producto: string }[]>(`/productos/variantes?search=${encodeURIComponent(q)}`);
    setResultComp(r);
  }

  function agregarComp(v: { id: number; nombre: string; sku: string; producto: string }) {
    setBomRows((rows) => [...rows, { componentId: v.id, nombre: `${v.producto} · ${v.nombre}`, cantidad: 1, tipo: "exacto" }]);
    setBuscaComp("");
    setResultComp([]);
  }

  async function guardarBom() {
    try {
      await api(`/productos/${prodId}/componentes`, {
        method: "PUT",
        body: JSON.stringify({ componentes: bomRows.map((r) => ({ componentId: r.componentId, cantidad: r.cantidad, tipo: r.tipo })) }),
      });
      notify(null, "Lista de materiales guardada.");
    } catch (e) { notify(e as Error, ""); }
  }

  return (
    <div className="card section-anchor" id="bom">
      <h3 style={{ marginTop: 0 }}>Lista de materiales (BOM)</h3>
      <div className="inline-form">
        <label>
          Agregar componente (variante)
          <input value={buscaComp} onChange={(e) => buscarComponentes(e.target.value)} placeholder="Buscar por nombre o SKU…" />
        </label>
      </div>
      {resultComp.length > 0 && (
        <div className="card" style={{ margin: "8px 0", padding: 8 }}>
          {resultComp.slice(0, 6).map((v) => (
            <button key={v.id} type="button" className="btn ghost sm" style={{ margin: 4 }} onClick={() => agregarComp(v)}>
              + {v.producto} · {v.nombre} ({v.sku})
            </button>
          ))}
        </div>
      )}
      <div className="card" style={{ padding: 0, margin: "12px 0" }}>
        <table className="table">
          <thead>
            <tr>
              <th>Componente</th>
              <th>Cantidad</th>
              <th>Tipo</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {bomRows.map((r, i) => (
              <tr key={`${r.componentId}-${i}`}>
                <td>{r.nombre}</td>
                <td>
                  <input type="number" step="0.001" value={r.cantidad}
                    style={{ width: 100 }}
                    onChange={(e) => setBomRows(bomRows.map((x, j) => j === i ? { ...x, cantidad: Number(e.target.value) } : x))}
                  />
                </td>
                <td>
                  <select value={r.tipo} onChange={(e) => setBomRows(bomRows.map((x, j) => j === i ? { ...x, tipo: e.target.value } : x))}>
                    <option value="exacto">exacto (se consume al ensamblar)</option>
                    <option value="consumible">consumible (solo vigilado por umbral)</option>
                  </select>
                </td>
                <td>
                  <button type="button" className="btn ghost sm" onClick={() => setBomRows(bomRows.filter((_, j) => j !== i))}>Quitar</button>
                </td>
              </tr>
            ))}
            {bomRows.length === 0 && (
              <tr><td colSpan={4} className="empty">Sin componentes todavía.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <button type="button" className="btn primary" onClick={guardarBom}>Guardar BOM</button>
      <span className="muted small"> El tipo "exacto" se descuenta del stock al registrar un ensamble; el "consumible" solo genera alerta de umbral.</span>
    </div>
  );
}
