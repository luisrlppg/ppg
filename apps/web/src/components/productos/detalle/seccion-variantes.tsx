"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import ConfirmDialog from "@/components/ui/confirm-dialog";
import CompletarEjes from "@/components/productos/completar-ejes";
import { api } from "@/lib/api";
import { guardarSeleccion, leerSeleccion } from "@/lib/local-store";
import { useFormatCantidad } from "@/lib/preferences";
import type { Grid, GridCombo, GridVarianteExistente, ProductoDetalle, Variante } from "@/lib/types";

function slugify(valores: string[]): string {
  return valores
    .map((v) =>
      v
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, ""),
    )
    .join("-");
}

interface Props {
  prodId: number;
  d: ProductoDetalle;
  grid: Grid | null;
  cargar: () => Promise<void>;
  notify: (e: Error | null, okMsg: string) => void;
}

export default function SeccionVariantes({ prodId, d, grid, cargar, notify }: Props) {
  const router = useRouter();
  const formatCantidad = useFormatCantidad();

  const [showNuevaVariante, setShowNuevaVariante] = useState(false);
  const [nuevaVarNombre, setNuevaVarNombre] = useState("");
  const [nuevaVarSku, setNuevaVarSku] = useState("");
  const [guardandoVar, setGuardandoVar] = useState(false);
  const [varianteAEliminar, setVarianteAEliminar] = useState<Variante | null>(null);
  const [eliminandoVariante, setEliminandoVariante] = useState(false);
  const [bloqueoVariante, setBloqueoVariante] = useState<string | null>(null);

  const [selValores, setSelValores] = useState<Record<number, number>>({});
  const ejesGrid = grid?.ejes ?? [];
  const faltantesGrid = ejesGrid.filter((e) => !(selValores[e.attributeId] !== undefined)).length;
  const existentesPorKey = useMemo(() => {
    const m = new Map<string, GridVarianteExistente>();
    for (const e of grid?.existentes ?? []) m.set(e.valueIds.join(","), e);
    return m;
  }, [grid]);
  const comboSeleccionado: GridCombo | null = useMemo(() => {
    if (!grid || faltantesGrid > 0) return null;
    const valueIds = grid.ejes.map((e) => selValores[e.attributeId]);
    const valoracion = valueIds.map((id, i) => grid.ejes[i].valores.find((v) => v.id === id)?.valor);
    if (valoracion.some((v) => v === undefined)) return null;
    const existente = existentesPorKey.get(valueIds.join(","));
    return {
      valueIds,
      valoracion: valoracion as string[],
      varianteId: existente?.varianteId ?? null,
      nombre: existente?.nombre ?? (valoracion as string[]).join(" "),
      sku: existente?.sku ?? `${d?.skuBase ?? ""}-${slugify(valoracion as string[])}`,
    };
  }, [grid, faltantesGrid, selValores, existentesPorKey, d?.skuBase]);

  const [selLista, setSelLista] = useState(false);
  useEffect(() => {
    setSelLista(false);
    setSelValores({});
  }, [prodId]);
  useEffect(() => {
    if (!grid || selLista) return;
    const guardada = leerSeleccion(prodId);
    const pruned: Record<number, number> = {};
    for (const eje of grid.ejes) {
      const val = guardada[eje.attributeId];
      if (val !== undefined && eje.valores.some((v) => v.id === val)) pruned[eje.attributeId] = val;
    }
    if (Object.keys(pruned).length > 0) setSelValores(pruned);
    setSelLista(true);
  }, [grid, prodId, selLista]);
  useEffect(() => {
    if (!selLista) return;
    guardarSeleccion(prodId, selValores);
  }, [selValores, prodId, selLista]);

  async function materializar(combo: GridCombo) {
    try {
      await api<number>(`/productos/${prodId}/materializar`, {
        method: "POST",
        body: JSON.stringify({ valueIds: combo.valueIds }),
      });
      await cargar();
      notify(null, `Variante "${combo.nombre}" creada con empaques heredados.`);
    } catch (e) { notify(e as Error, ""); }
  }

  async function crearVariante(e: React.FormEvent) {
    e.preventDefault();
    if (!nuevaVarNombre.trim() || !nuevaVarSku.trim()) return;
    setGuardandoVar(true);
    try {
      await api(`/productos/${prodId}/variantes`, {
        method: "POST",
        body: JSON.stringify({ nombre: nuevaVarNombre.trim(), sku: nuevaVarSku.trim() }),
      });
      setNuevaVarNombre("");
      setNuevaVarSku("");
      setShowNuevaVariante(false);
      await cargar();
      notify(null, "Variante creada con empaques heredados.");
    } catch (err) { notify(err as Error, ""); }
    finally { setGuardandoVar(false); }
  }

  async function toggle(v: Variante, campo: "longLead" | "activo") {
    try {
      await api(`/productos/variantes/${v.id}`, { method: "PATCH", body: JSON.stringify({ [campo]: !v[campo] }) });
      await cargar();
      notify(null, "Variante actualizada.");
    } catch (e) { notify(e as Error, ""); }
  }

  async function eliminarVariante(v: Variante) {
    setEliminandoVariante(true);
    try {
      await api(`/productos/variantes/${v.id}`, { method: "DELETE" });
      await cargar();
      setVarianteAEliminar(null);
      notify(null, `Variante "${v.nombre}" eliminada.`);
    } catch (e) {
      setVarianteAEliminar(null);
      setBloqueoVariante((e as Error).message);
    } finally {
      setEliminandoVariante(false);
    }
  }

  return (
    <div className="card section-anchor" id="variantes">
      {varianteAEliminar && (
        <ConfirmDialog
          title="Eliminar variante"
          message={
            <>
              ¿Seguro que deseas eliminar la variante <strong>{varianteAEliminar.nombre}</strong> ({varianteAEliminar.sku})?
              Esta acción no se puede deshacer.
            </>
          }
          confirmLabel="Eliminar"
          danger
          loading={eliminandoVariante}
          onConfirm={() => eliminarVariante(varianteAEliminar)}
          onClose={() => setVarianteAEliminar(null)}
        />
      )}

      {bloqueoVariante && (
        <ConfirmDialog
          title="No se pudo eliminar"
          message={bloqueoVariante}
          confirmLabel="Cerrar"
          cancelLabel="Cancelar"
          onConfirm={() => setBloqueoVariante(null)}
          onClose={() => setBloqueoVariante(null)}
        />
      )}

      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <h3 style={{ marginTop: 0, marginBottom: 0 }}>Variantes</h3>
        <button type="button" className="btn primary sm" onClick={() => setShowNuevaVariante(!showNuevaVariante)}>
          {showNuevaVariante ? "Cerrar" : "+ Nueva variante"}
        </button>
      </div>

      {showNuevaVariante && (
        <form onSubmit={crearVariante} className="card" style={{ marginTop: 12, background: "#fafafa" }}>
          <div className="row">
            <label style={{ flex: 1 }}>
              Nombre de la variante
              <input value={nuevaVarNombre} onChange={(e) => setNuevaVarNombre(e.target.value)} placeholder="ej. Taparrosca 13mm" required />
            </label>
            <label style={{ flex: 1 }}>
              SKU
              <input value={nuevaVarSku} onChange={(e) => setNuevaVarSku(e.target.value)} placeholder="ej. TP-13" required />
            </label>
            <button type="submit" className="btn primary sm" disabled={guardandoVar} style={{ alignSelf: "flex-end" }}>
              {guardandoVar ? "Creando…" : "Crear"}
            </button>
          </div>
        </form>
      )}

      {grid && grid.ejes.length > 0 && (
        <div className="card" style={{ marginTop: 12, background: "#fafafa" }}>
          <p style={{ margin: "0 0 8px", fontWeight: 600 }}>Materializar combinación</p>
          <p className="muted small" style={{ margin: "0 0 12px" }}>
            Elige un valor por atributo para materializar esa variante específica.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginBottom: 12 }}>
            {ejesGrid.map((eje) => (
              <label key={eje.attributeId} style={{ display: "block" }}>
                {eje.nombre}
                <select
                  style={{ width: "100%", marginTop: 4 }}
                  value={selValores[eje.attributeId] ?? ""}
                  onChange={(ev) =>
                    setSelValores((prev) => {
                      const next = { ...prev };
                      const vid = ev.target.value === "" ? undefined : Number(ev.target.value);
                      if (vid === undefined) delete next[eje.attributeId];
                      else next[eje.attributeId] = vid;
                      return next;
                    })
                  }
                >
                  <option value="">— Elegir —</option>
                  {eje.valores.map((v) => (
                    <option key={v.id} value={v.id}>{v.valor}</option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          {faltantesGrid > 0 ? (
            <p className="muted small">
              Faltan {faltantesGrid} atributo(s) por elegir para formar una combinación.
            </p>
          ) : comboSeleccionado ? (
            <div className="row" style={{ alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <div>
                <strong>{comboSeleccionado.valoracion.join(" · ")}</strong>
                <div className="muted-2 small" style={{ fontFamily: "monospace" }}>{comboSeleccionado.sku}</div>
              </div>
              <div style={{ flex: 1 }} />
              {comboSeleccionado.varianteId ? (
                <span className="badge normal">creada</span>
              ) : (
                <button
                  type="button"
                  className="btn primary sm"
                  style={{ flex: 0 }}
                  onClick={() => materializar(comboSeleccionado)}
                >
                  Materializar esta variante
                </button>
              )}
            </div>
          ) : (
            <p className="muted small">No se encontró esa combinación.</p>
          )}
        </div>
      )}

      {grid && grid.ejes.length > 0 && (
        <CompletarEjes
          productoNombre={d.nombre}
          ejes={grid.ejes}
          variantes={d.variantes}
          onSaved={cargar}
          onNotify={notify}
        />
      )}

      <div className="spacer" />
      <div className="card" style={{ padding: 0, margin: 0 }}>
        <table className="table">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>SKU</th>
              <th>Atributos</th>
              <th>Stock</th>
              <th>Crítico</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {d.variantes.map((v) => (
              <tr
                key={v.id}
                onClick={() => router.push(`/productos/${prodId}/variantes/${v.id}`)}
                style={{ cursor: "pointer" }}
              >
                <td>
                  <strong>{v.nombre}</strong>
                  {v.notas ? <div className="small muted">{v.notas}</div> : null}
                </td>
                <td className="muted-2">{v.sku}</td>
                <td>
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    {(v.valoracion ?? []).map((a) => (
                      <span key={a.attributeId} className="kbd-chip">{a.attribute}: {a.valor}</span>
                    ))}
                    {((v.valoracion ?? []).length === 0) && (
                      <span className="muted small">variante única</span>
                    )}
                  </div>
                </td>
                <td>{formatCantidad(v.stockActual)}</td>
                <td onClick={(e) => e.stopPropagation()}>
                  <input type="checkbox" checked={v.longLead} onChange={() => toggle(v, "longLead")} style={{ width: "auto" }} />
                </td>
                <td onClick={(e) => e.stopPropagation()}>
                  <button type="button" className="btn ghost sm" onClick={() => setVarianteAEliminar(v)}>
                    Eliminar
                  </button>
                </td>
              </tr>
            ))}
            {d.variantes.length === 0 && (
              <tr><td colSpan={6} className="empty">Sin variantes. Crea una desde el grid de combinaciones arriba.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="muted small" style={{ marginTop: 8 }}>
        Clic en una fila para abrir la variante.
      </p>
    </div>
  );
}
