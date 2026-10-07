"use client";

import { useEffect, useState } from "react";
import HelpNote from "@/components/ui/help-note";
import { api } from "@/lib/api";
import type { Atributo, PassoRow } from "@/lib/types";

interface Props {
  prodId: number;
  pasosIniciales?: PassoRow[];
  atributos: Atributo[];
  cargar: () => Promise<void>;
  notify: (e: Error | null, okMsg: string) => void;
}

export default function SeccionPasos({ prodId, pasosIniciales, atributos, cargar, notify }: Props) {
  const [pasosRows, setPasosRows] = useState<PassoRow[]>([]);
  const [guardandoPasos, setGuardandoPasos] = useState(false);
  const [componentes, setComponentes] = useState<{ id: number; nombre: string }[]>([]);

  useEffect(() => {
    if (pasosIniciales) setPasosRows(pasosIniciales.map((p) => ({ ...p })));
  }, [pasosIniciales]);

  useEffect(() => {
    api<{ id: number; nombre: string }[]>("/productos?search=")
      .then((r) => setComponentes(r.map((p) => ({ id: p.id, nombre: p.nombre }))))
      .catch(() => setComponentes([]));
  }, []);

  function addPaso() {
    setPasosRows((rows) => [
      ...rows,
      {
        id: 0,
        sortOrder: rows.length,
        panel: rows.length,
        pregunta: "",
        attributeId: null,
        variantProductId: null,
      },
    ]);
  }

  function updatePaso(i: number, patch: Partial<PassoRow>) {
    setPasosRows((rows) => rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  }

  function removePaso(i: number) {
    setPasosRows((rows) => rows.filter((_, j) => j !== i));
  }

  async function guardarPasos() {
    const limpios = pasosRows.filter((p) => p.pregunta.trim() && p.attributeId != null);
    setGuardandoPasos(true);
    try {
      await api(`/productos/${prodId}/pasos`, {
        method: "PUT",
        body: JSON.stringify({
          pasos: limpios.map((p, i) => ({
            sortOrder: i,
            panel: p.panel ?? i,
            pregunta: p.pregunta.trim(),
            attributeId: p.attributeId,
            variantProductId: p.variantProductId,
          })),
        }),
      });
      await cargar();
      notify(null, "Pasos guiados guardados.");
    } catch (e) { notify(e as Error, ""); }
    finally { setGuardandoPasos(false); }
  }

  return (
    <div className="card section-anchor" id="pasos">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <h3 style={{ marginTop: 0, marginBottom: 0 }}>Pasos guiados</h3>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" className="btn ghost sm" onClick={addPaso}>+ Añadir paso</button>
          <button type="button" className="btn primary sm" onClick={guardarPasos} disabled={guardandoPasos}>
            {guardandoPasos ? "Guardando…" : "Guardar pasos"}
          </button>
        </div>
      </div>
      <HelpNote>
        El wizard pregunta cada paso y toma las opciones de las <strong>variantes activas del componente</strong>{" "}
        seleccionado. Los pasos con el mismo número de <strong>panel</strong> se muestran juntos. Los ejes que no son
        paso (p. ej. <strong>Tamaño rosca</strong>) se derivan del componente elegido.
      </HelpNote>
      <div className="card" style={{ padding: 0, margin: "12px 0" }}>
        <table className="table">
          <thead>
            <tr>
              <th style={{ width: 70 }}>Panel</th>
              <th>Pregunta</th>
              <th>Atributo</th>
              <th>Componente</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {pasosRows.map((p, i) => (
              <tr key={i}>
                <td>
                  <input
                    type="number"
                    min={1}
                    value={p.panel}
                    style={{ width: 60 }}
                    onChange={(e) => updatePaso(i, { panel: Number(e.target.value) })}
                  />
                </td>
                <td>
                  <input
                    value={p.pregunta}
                    placeholder="ej. ¿De qué color quieres la botella?"
                    style={{ width: "100%" }}
                    onChange={(e) => updatePaso(i, { pregunta: e.target.value })}
                  />
                </td>
                <td>
                  <select
                    value={p.attributeId ?? ""}
                    onChange={(e) => updatePaso(i, { attributeId: e.target.value ? Number(e.target.value) : null })}
                  >
                    <option value="">— Sin atributo —</option>
                    {atributos.map((a) => (
                      <option key={a.id} value={a.id}>{a.nombre}</option>
                    ))}
                  </select>
                </td>
                <td>
                  <select
                    value={p.variantProductId ?? ""}
                    onChange={(e) => updatePaso(i, { variantProductId: e.target.value ? Number(e.target.value) : null })}
                  >
                    <option value="">— Este producto —</option>
                    {componentes.map((c) => (
                      <option key={c.id} value={c.id}>{c.nombre}</option>
                    ))}
                  </select>
                </td>
                <td>
                  <button type="button" className="btn ghost sm" onClick={() => removePaso(i)}>Quitar</button>
                </td>
              </tr>
            ))}
            {pasosRows.length === 0 && (
              <tr><td colSpan={5} className="empty">Sin pasos guiados todavía.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
