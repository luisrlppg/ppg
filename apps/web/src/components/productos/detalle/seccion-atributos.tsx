"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Atributo } from "@/lib/types";

interface Props {
  prodId: number;
  atributos: Atributo[];
  cargarGrid: () => Promise<void>;
  notify: (e: Error | null, okMsg: string) => void;
}

export default function SeccionAtributos({ prodId, atributos, cargarGrid, notify }: Props) {
  const [propios, setPropios] = useState<Atributo[]>([]);
  const [heredados, setHeredados] = useState<Atributo[]>([]);
  const [createAttrNombre, setCreateAttrNombre] = useState("");
  const [createAttrValores, setCreateAttrValores] = useState("");
  const [savingAttr, setSavingAttr] = useState(false);
  const [asigningAttr, setAsigningAttr] = useState(false);
  const [expandedAttr, setExpandedAttr] = useState<number | null>(null);
  const [newValor, setNewValor] = useState("");
  const [showInlineCreate, setShowInlineCreate] = useState(false);
  const [showAddAttrDropdown, setShowAddAttrDropdown] = useState(false);
  const [addAttrSearch, setAddAttrSearch] = useState("");

  const cargarAtributosProducto = useCallback(async () => {
    try {
      const result = await api<{ propios: Atributo[]; heredados: Atributo[] }>(`/catalogos/atributos/producto/${prodId}`);
      setPropios(result.propios);
      setHeredados(result.heredados);
      return result;
    } catch {
      setPropios([]);
      setHeredados([]);
      return { propios: [] as Atributo[], heredados: [] as Atributo[] };
    }
  }, [prodId]);

  useEffect(() => {
    cargarAtributosProducto();
  }, [cargarAtributosProducto]);

  async function guardarValoresPermitidos(attr: Atributo, valueIds: number[]) {
    try {
      await api(`/productos/${prodId}/ejes/${attr.id}/valores`, {
        method: "PUT",
        body: JSON.stringify({ valueIds }),
      });
      await Promise.all([cargarAtributosProducto(), cargarGrid()]);
      notify(null, "Valores del eje actualizados.");
    } catch (e) { notify(e as Error, ""); }
  }

  function toggleValorPermitido(attr: Atributo, valueId: number, checked: boolean) {
    const current = new Set(attr.permitidos ?? attr.valores.map((v) => v.id));
    if (checked) current.add(valueId);
    else current.delete(valueId);
    guardarValoresPermitidos(attr, [...current]);
  }

  async function crearAtributo() {
    if (!createAttrNombre.trim()) return;
    setSavingAttr(true);
    try {
      const valores = createAttrValores.split(",").map((v) => v.trim()).filter(Boolean);
      await api("/catalogos/atributos", {
        method: "POST",
        body: JSON.stringify({ nombre: createAttrNombre.trim(), valores }),
      });
      const allAttrs = await api<Atributo[]>("/catalogos/atributos");
      const created = allAttrs.find((a) => a.nombre === createAttrNombre.trim());
      if (created) {
        const allPropiosIds = [...propios, ...heredados].map((a) => a.id);
        const newEjes = [...allPropiosIds, created.id].map((attrId, i) => ({ attributeId: attrId, sortOrder: i }));
        await api(`/productos/${prodId}/ejes`, {
          method: "PUT",
          body: JSON.stringify({ ejes: newEjes }),
        });
      }
      setCreateAttrNombre("");
      setCreateAttrValores("");
      setShowInlineCreate(false);
      await Promise.all([cargarAtributosProducto(), cargarGrid()]);
      if (created) setExpandedAttr(created.id);
      notify(null, "Atributo creado y asignado.");
    } catch (e) { notify(e as Error, e instanceof Error ? e.message : "Error"); }
    finally { setSavingAttr(false); }
  }

  function abrirValores(attr: Atributo) {
    setExpandedAttr(expandedAttr === attr.id ? null : attr.id);
    setNewValor("");
  }

  async function agregarValor(attr: Atributo) {
    if (!newValor.trim() || !attr) return;
    const nombre = newValor.trim();
    try {
      await api(`/catalogos/atributos/${attr.id}/valores`, {
        method: "POST",
        body: JSON.stringify({ valor: nombre }),
      });
      setNewValor("");
      const { propios: p, heredados: h } = await cargarAtributosProducto();
      if (attr.permitidos !== undefined) {
        const updated = [...p, ...h].find((a) => a.id === attr.id);
        const nuevo = updated?.valores.find((v) => v.valor === nombre);
        if (updated && nuevo) await guardarValoresPermitidos(updated, [...attr.permitidos, nuevo.id]);
      }
      await cargarGrid();
      notify(null, "Valor agregado.");
    } catch (e) { notify(e as Error, ""); }
  }

  async function eliminarValor(attr: Atributo, valorId: number) {
    try {
      await api(`/catalogos/atributos/${attr.id}/valores/${valorId}`, { method: "DELETE" });
      await Promise.all([cargarAtributosProducto(), cargarGrid()]);
      notify(null, "Valor eliminado.");
    } catch (e) { notify(e as Error, ""); }
  }

  async function desasignarAtributo(attrId: number) {
    try {
      await api(`/catalogos/atributos/${attrId}/desasignar/${prodId}`, { method: "DELETE" });
      if (expandedAttr === attrId) setExpandedAttr(null);
      await Promise.all([cargarAtributosProducto(), cargarGrid()]);
      notify(null, "Atributo desasignado del producto.");
    } catch (e) { notify(e as Error, ""); }
  }

  async function asignarAtributoGlobal(attrId: number) {
    setAsigningAttr(true);
    try {
      await api(`/catalogos/atributos/${attrId}/asignar/${prodId}`, { method: "POST" });
      setAddAttrSearch("");
      setShowAddAttrDropdown(false);
      setExpandedAttr(attrId);
      await Promise.all([cargarAtributosProducto(), cargarGrid()]);
      notify(null, "Atributo asignado.");
    } catch (e) { notify(e as Error, ""); }
    finally { setAsigningAttr(false); }
  }

  return (
    <div className="card section-anchor" id="atributos">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <h3 style={{ marginTop: 0, marginBottom: 0 }}>Atributos</h3>
      </div>
      <p className="muted small" style={{ margin: "4px 0 12px" }}>
        Los atributos definen las opciones de venta. Los valores se usan para filtrar variantes.
      </p>

      {propios.length > 0 && (
        <>
          <p className="muted small" style={{ margin: "0 0 8px", fontWeight: 600 }}>PROPIOS</p>
          {propios.map((attr) => {
            const permitidos = attr.permitidos ?? attr.valores.map((v) => v.id);
            const seleccionados = attr.valores.filter((v) => permitidos.includes(v.id));
            const exp = expandedAttr === attr.id;
            return (
              <div key={attr.id} style={{ border: "1px solid var(--line)", borderRadius: 8, padding: "8px 10px", marginBottom: 8 }}>
                <div className="row" style={{ alignItems: "center", flexWrap: "wrap", gap: 6 }}>
                  <strong style={{ minWidth: 140 }}>{attr.nombre}</strong>
                  <div className="row" style={{ flex: 1, flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                    {seleccionados.map((v) => (
                      <span key={v.id} className="kbd-chip" style={{ display: "inline-flex", gap: 5, alignItems: "center" }}>
                        {v.valor}
                        <button
                          type="button"
                          title="Quitar valor del eje"
                          style={{ border: "none", background: "transparent", cursor: "pointer", padding: 0, color: "#999", fontWeight: 700, fontSize: "0.9rem" }}
                          onClick={() => toggleValorPermitido(attr, v.id, false)}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                    {seleccionados.length === 0 && <span className="muted small">Sin valores</span>}
                  </div>
                  <div className="row" style={{ gap: 4 }}>
                    <button type="button" className="btn ghost sm" onClick={() => abrirValores(attr)}>
                      {exp ? "Cerrar" : "+ Valor"}
                    </button>
                    <button type="button" className="btn ghost sm" style={{ color: "red", borderColor: "red" }} title="Desasignar atributo" onClick={() => desasignarAtributo(attr.id)}>
                      Quitar
                    </button>
                  </div>
                </div>

                {exp && (
                  <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid var(--line)" }}>
                    <p className="muted small" style={{ margin: "0 0 6px" }}>
                      Marca los valores disponibles para este producto (ejes). Las variantes se materializan solo con estos valores.
                    </p>
                    <div className="row" style={{ flexWrap: "wrap", gap: 6 }}>
                      {attr.valores.map((v) => {
                        const on = permitidos.includes(v.id);
                        return (
                          <label
                            key={v.id}
                            className="kbd-chip"
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 6,
                              cursor: "pointer",
                              background: on ? "#dceaf5" : "#eee",
                              color: "inherit",
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={on}
                              style={{ width: "auto", margin: 0 }}
                              onChange={(e) => toggleValorPermitido(attr, v.id, e.target.checked)}
                            />
                            {v.valor}
                            <button
                              type="button"
                              title="Eliminar valor del catálogo"
                              style={{ border: "none", background: "transparent", cursor: "pointer", padding: 0, fontWeight: 700, color: "#999" }}
                              onClick={(e) => { e.preventDefault(); e.stopPropagation(); eliminarValor(attr, v.id); }}
                            >
                              ×
                            </button>
                          </label>
                        );
                      })}
                      {attr.valores.length === 0 && <span className="muted small">Sin valores. Agrega uno abajo.</span>}
                    </div>
                    <div className="inline-form" style={{ marginTop: 8 }}>
                      <input
                        value={newValor}
                        onChange={(e) => setNewValor(e.target.value)}
                        placeholder="Nuevo valor"
                        onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), agregarValor(attr))}
                      />
                      <button type="button" className="btn ghost sm" onClick={() => agregarValor(attr)} disabled={!newValor.trim()}>
                        Agregar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </>
      )}

      {heredados.length > 0 && (
        <>
          <p className="muted small" style={{ margin: "8px 0 8px", fontWeight: 600 }}>HEREDADOS (de componentes del BOM)</p>
          {heredados.map((attr) => (
            <div key={attr.id} className="row" style={{ alignItems: "center", padding: "4px 0" }}>
              <span className="muted small" style={{ minWidth: 140 }}>{attr.nombre}</span>
              <span className="muted-2 small">
                {attr.valores.length === 0 ? "sin valores" : attr.valores.map((v) => v.valor).join(", ")}
              </span>
            </div>
          ))}
        </>
      )}

      {propios.length === 0 && heredados.length === 0 && (
        <p className="muted small" style={{ margin: "0 0 12px" }}>Sin atributos asignados.</p>
      )}

      <div className="row" style={{ gap: 8, marginTop: 8 }}>
        <button
          type="button"
          className="btn primary sm"
          onClick={() => { setShowInlineCreate(!showInlineCreate); setShowAddAttrDropdown(false); }}
        >
          + Crear atributo
        </button>
        <button
          type="button"
          className="btn ghost sm"
          onClick={() => { setShowAddAttrDropdown(!showAddAttrDropdown); setShowInlineCreate(false); }}
        >
          + Agregar atributo global ▾
        </button>
      </div>

      {showInlineCreate && (
        <div className="inline-form" style={{ marginTop: 10 }}>
          <input value={createAttrNombre} onChange={(e) => setCreateAttrNombre(e.target.value)} placeholder="Nombre del atributo" />
          <input value={createAttrValores} onChange={(e) => setCreateAttrValores(e.target.value)} placeholder="Valores (separados por coma)" style={{ flex: 2, minWidth: 220 }} />
          <button type="button" className="btn ghost sm" onClick={() => setShowInlineCreate(false)}>Cancelar</button>
          <button type="button" className="btn primary sm" onClick={crearAtributo} disabled={savingAttr || !createAttrNombre.trim()}>
            {savingAttr ? "Creando…" : "Crear"}
          </button>
        </div>
      )}

      {showAddAttrDropdown && (
        <div style={{ marginTop: 10 }}>
          <input
            value={addAttrSearch}
            onChange={(e) => setAddAttrSearch(e.target.value)}
            placeholder="Buscar atributo…"
            style={{ maxWidth: 280 }}
            autoFocus
          />
          <div style={{ maxHeight: 220, overflowY: "auto", border: "1px solid var(--line)", borderRadius: 4, padding: 8, marginTop: 8 }}>
            {atributos
              .filter((a) => {
                const assignedIds = [...propios, ...heredados].map((p) => p.id);
                if (assignedIds.includes(a.id)) return false;
                if (!addAttrSearch) return true;
                return a.nombre.toLowerCase().includes(addAttrSearch.toLowerCase());
              })
              .map((attr) => (
                <div key={attr.id} className="row" style={{ marginBottom: 8, alignItems: "center" }}>
                  <span style={{ flex: 1 }}>
                    <strong>{attr.nombre}</strong>
                    <span className="muted"> — {attr.valores.length} valores</span>
                  </span>
                  <button
                    type="button"
                    className="btn ghost sm"
                    onClick={() => asignarAtributoGlobal(attr.id)}
                    disabled={asigningAttr}
                  >
                    Asignar
                  </button>
                </div>
              ))}
            {atributos.filter((a) => {
              const assignedIds = [...propios, ...heredados].map((p) => p.id);
              if (assignedIds.includes(a.id)) return false;
              if (!addAttrSearch) return true;
              return a.nombre.toLowerCase().includes(addAttrSearch.toLowerCase());
            }).length === 0 && (
              <p className="muted small" style={{ textAlign: "center", padding: 8 }}>
                No hay atributos disponibles para asignar.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
