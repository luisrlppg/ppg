"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import type { Grid, Variante } from "@/lib/types";
import { DERIVACIONES, DEFAULTS, normalizar } from "./completar-ejes.config";

interface Props {
  productoNombre: string;
  ejes: Grid["ejes"];
  variantes: Variante[];
  onSaved: () => void;
  onNotify: (e: Error | null, okMsg: string) => void;
}

export default function CompletarEjes({ productoNombre, ejes, variantes, onSaved, onNotify }: Props) {
  const [sel, setSel] = useState<Record<number, Record<number, number>>>({});
  const [savingId, setSavingId] = useState<number | null>(null);

  const referencia = useMemo(() => {
    let best: Variante | null = null;
    for (const v of variantes) {
      if (!best || (v.valoracion?.length ?? 0) > (best.valoracion?.length ?? 0)) best = v;
    }
    return best;
  }, [variantes]);

  const faltantesPorVariante = useMemo(() => {
    const m = new Map<number, Grid["ejes"]>();
    for (const v of variantes) {
      const tiene = new Set((v.valoracion ?? []).map((x) => x.attributeId));
      const faltan = ejes.filter((e) => !tiene.has(e.attributeId));
      if (faltan.length) m.set(v.id, faltan);
    }
    return m;
  }, [variantes, ejes]);

  function sugerir(v: Variante, eje: Grid["ejes"][number]): number | undefined {
    for (const rule of DERIVACIONES[productoNombre] ?? []) {
      if (rule.to !== eje.nombre) continue;
      const src = (v.valoracion ?? []).find((x) => x.attribute === rule.from);
      if (src) {
        const target = rule.map[src.valor];
        const opt = eje.valores.find((o) => normalizar(o.valor) === normalizar(target ?? ""));
        if (opt) return opt.id;
      }
    }
    if (referencia) {
      const refVa = (referencia.valoracion ?? []).find((x) => x.attributeId === eje.attributeId);
      if (refVa && eje.valores.some((o) => o.id === refVa.valueId)) return refVa.valueId;
    }
    const d = DEFAULTS[productoNombre]?.[eje.nombre];
    if (d) {
      const opt = eje.valores.find((o) => normalizar(o.valor) === normalizar(d));
      if (opt) return opt.id;
    }
    return undefined;
  }

  useEffect(() => {
    setSel((prev) => {
      const next: Record<number, Record<number, number>> = {};
      for (const [vid, faltan] of faltantesPorVariante) {
        next[vid] = { ...(prev[vid] ?? {}) };
        const v = variantes.find((x) => x.id === vid);
        if (!v) continue;
        for (const eje of faltan) {
          if (next[vid][eje.attributeId] !== undefined) continue;
          const s = sugerir(v, eje);
          if (s !== undefined) next[vid][eje.attributeId] = s;
        }
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [faltantesPorVariante, productoNombre, referencia?.id]);

  async function guardar(v: Variante) {
    const faltan = faltantesPorVariante.get(v.id) ?? [];
    const assigned = sel[v.id] ?? {};
    const pend = faltan.filter((e) => assigned[e.attributeId] !== undefined);
    if (!pend.length) return;
    setSavingId(v.id);
    try {
      for (const eje of pend) {
        await api(`/productos/variantes/${v.id}/atributos/${eje.attributeId}`, {
          method: "PUT",
          body: JSON.stringify({ valueId: assigned[eje.attributeId] }),
        });
      }
      onNotify(null, `Ejes de ${v.sku} actualizados.`);
      onSaved();
    } catch (e) {
      onNotify(e as Error, "");
    } finally {
      setSavingId(null);
    }
  }

  if (faltantesPorVariante.size === 0) return null;

  return (
    <div className="card" style={{ marginTop: 12, background: "#fff8e6", border: "1px solid #f0e0b0" }}>
      <p style={{ margin: "0 0 4px", fontWeight: 600 }}>
        Completar ejes ({faltantesPorVariante.size} variante(s) incompleta(s))
      </p>
      <p className="muted small" style={{ margin: "0 0 12px" }}>
        Estas variantes no tienen un valor para todos los ejes. Elige los faltantes y guarda. Las que no apliquen se
        pueden dejar así.
      </p>
      <div style={{ overflowX: "auto" }}>
        <table className="table">
          <thead>
            <tr>
              <th>Variante</th>
              <th>Actual</th>
              <th>Faltantes</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {[...faltantesPorVariante].map(([vid, faltan]) => {
              const v = variantes.find((x) => x.id === vid)!;
              const assigned = sel[vid] ?? {};
              const puede = faltan.some((e) => assigned[e.attributeId] !== undefined);
              return (
                <tr key={vid}>
                  <td className="muted-2" style={{ fontFamily: "monospace", whiteSpace: "nowrap" }}>{v.sku}</td>
                  <td className="muted small">
                    {(v.valoracion ?? []).map((a) => `${a.attribute}: ${a.valor}`).join(" · ") || "—"}
                  </td>
                  <td>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {faltan.map((eje) => (
                        <label key={eje.attributeId} className="row" style={{ gap: 8, alignItems: "center" }}>
                          <span style={{ minWidth: 160 }}>{eje.nombre}</span>
                          <select
                            value={assigned[eje.attributeId] ?? ""}
                            onChange={(ev) =>
                              setSel((prev) => {
                                const next = { ...prev, [vid]: { ...(prev[vid] ?? {}) } };
                                const val = ev.target.value === "" ? undefined : Number(ev.target.value);
                                if (val === undefined) delete next[vid][eje.attributeId];
                                else next[vid][eje.attributeId] = val;
                                return next;
                              })
                            }
                          >
                            <option value="">— Elegir —</option>
                            {eje.valores.map((o) => (
                              <option key={o.id} value={o.id}>{o.valor}</option>
                            ))}
                          </select>
                        </label>
                      ))}
                    </div>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="btn primary sm"
                      disabled={!puede || savingId === vid}
                      onClick={() => guardar(v)}
                    >
                      {savingId === vid ? "Guardando…" : "Guardar"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
