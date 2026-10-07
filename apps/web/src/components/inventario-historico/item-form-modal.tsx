"use client";

import { useState } from "react";
import Modal from "@/components/ui/modal";
import { api } from "@/lib/api";
import type { Atributo, AtributosProducto, InventarioHistoricoItem } from "@/lib/types";

interface Props {
  item: InventarioHistoricoItem | null;
  productos: { id: number; nombre: string }[];
  onGuardado: () => void;
  onEliminar?: () => void;
  onCerrar: () => void;
}

interface AtributoFila {
  nombre: string;
  valor: string;
  sugerencias?: string[];
}

function sugerenciasDe(a: Atributo): string[] {
  const permitidos = a.permitidos ?? [];
  const valores = permitidos.length > 0 ? a.valores.filter((v) => permitidos.includes(v.id)) : a.valores;
  return valores.map((v) => v.valor);
}

export default function ItemFormModal({ item, productos, onGuardado, onEliminar, onCerrar }: Props) {
  const [nombre, setNombre] = useState(item?.nombre ?? "");
  const [sku, setSku] = useState(item?.sku ?? "");
  const [tipo, setTipo] = useState(item?.tipo ?? "descontinuado");
  const [cantidad, setCantidad] = useState(String(item?.cantidad ?? 0));
  const [ubicacion, setUbicacion] = useState(item?.ubicacion ?? "");
  const [notas, setNotas] = useState(item?.notas ?? "");
  const [familiaProductoId, setFamiliaProductoId] = useState(
    item?.familiaProductoId ? String(item.familiaProductoId) : "",
  );
  const [atributos, setAtributos] = useState<AtributoFila[]>(
    item?.atributos?.length ? item.atributos.map((a) => ({ ...a })) : [],
  );
  const [cargandoSugerencias, setCargandoSugerencias] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  function setAtributo(i: number, campo: "nombre" | "valor", valor: string) {
    setAtributos((prev) => prev.map((a, idx) => (idx === i ? { ...a, [campo]: valor } : a)));
  }

  /** Al elegir familia se reemplazan las filas por sus ejes "propios" (valores en blanco). */
  async function cambiarFamilia(value: string) {
    setFamiliaProductoId(value);
    if (!value) {
      setAtributos([]);
      return;
    }
    setCargandoSugerencias(true);
    setError("");
    try {
      const data = await api<AtributosProducto>(`/catalogos/atributos/producto/${value}`);
      setAtributos(
        data.propios.map((a) => ({
          nombre: a.nombre,
          valor: "",
          sugerencias: sugerenciasDe(a),
        })),
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setCargandoSugerencias(false);
    }
  }

  async function guardar() {
    if (!nombre.trim()) {
      setError("El nombre es obligatorio.");
      return;
    }
    if (!ubicacion.trim()) {
      setError("La ubicación es obligatoria.");
      return;
    }
    setGuardando(true);
    setError("");
    try {
      const payload = {
        nombre: nombre.trim(),
        sku: sku.trim() || null,
        tipo,
        cantidad: Number(cantidad.replace(/[^0-9.-]/g, "")) || 0,
        ubicacion: ubicacion.trim(),
        notas: notas.trim() || null,
        familiaProductoId: familiaProductoId ? Number(familiaProductoId) : null,
        atributos: atributos
          .map((a) => ({ nombre: a.nombre.trim(), valor: a.valor.trim() }))
          .filter((a) => a.nombre && a.valor),
      };
      if (item) {
        await api(`/inventario-historico/${item.id}`, { method: "PATCH", body: JSON.stringify(payload) });
      } else {
        await api("/inventario-historico", { method: "POST", body: JSON.stringify(payload) });
      }
      onGuardado();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Modal
      title={item ? "Editar registro" : "Nuevo registro histórico"}
      onClose={onCerrar}
      size="lg"
      footer={
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, width: "100%" }}>
          {item && onEliminar ? (
            <button type="button" className="btn danger" onClick={onEliminar}>
              Eliminar
            </button>
          ) : (
            <span />
          )}
          <span style={{ display: "flex", gap: 12 }}>
            <button type="button" className="btn ghost" onClick={onCerrar}>
              Cancelar
            </button>
            <button type="button" className="btn primary" disabled={guardando} onClick={guardar}>
              {guardando ? "Guardando…" : "Guardar"}
            </button>
          </span>
        </div>
      }
    >
      {error && <div className="error">{error}</div>}
      <div className="grid-2">
        <label>
          Nombre / descripción
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Vastago · 82mm · Negro…" />
        </label>
        <label>
          SKU (opcional)
          <input value={sku} onChange={(e) => setSku(e.target.value)} placeholder="VST-0014" />
        </label>
        <label>
          Tipo
          <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
            <option value="descontinuado">Descontinuado</option>
            <option value="subensamble">Subensamble</option>
          </select>
        </label>
        <label>
          Cantidad
          <input value={cantidad} onChange={(e) => setCantidad(e.target.value)} inputMode="decimal" />
        </label>
        <label>
          Ubicación
          <input value={ubicacion} onChange={(e) => setUbicacion(e.target.value)} placeholder="H3" />
        </label>
        <label>
          Familia (opcional)
          <select value={familiaProductoId} onChange={(e) => cambiarFamilia(e.target.value)}>
            <option value="">— Sin familia —</option>
            {productos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label>
        Notas
        <input value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Observaciones…" />
      </label>

      <div style={{ marginTop: 12 }}>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <strong className="small">Atributos</strong>
          <button
            type="button"
            className="btn ghost sm"
            onClick={() => setAtributos((prev) => [...prev, { nombre: "", valor: "" }])}
          >
            + Agregar atributo
          </button>
        </div>
        {cargandoSugerencias ? (
          <p className="muted small">Cargando ejes de la familia…</p>
        ) : (
          <>
            <p className="muted small" style={{ marginTop: 4 }}>
              Al elegir una familia se cargan sus ejes; los valores se pueden dejar en blanco si no se conocen.
            </p>
            {atributos.length === 0 && (
              <p className="muted small">
                Sin atributos. Elige una familia para sugerir ejes o agrégalos manualmente.
              </p>
            )}
            {atributos.map((a, i) => {
              const listId = `inv-histo-attr-${i}`;
              return (
                <div key={i} className="row" style={{ gap: 8, marginTop: 6 }}>
                  <input
                    style={{ flex: 1 }}
                    value={a.nombre}
                    onChange={(e) => setAtributo(i, "nombre", e.target.value)}
                    placeholder="Atributo (ej. Color de Vastago)"
                  />
                  <input
                    style={{ flex: 1 }}
                    value={a.valor}
                    list={a.sugerencias?.length ? listId : undefined}
                    onChange={(e) => setAtributo(i, "valor", e.target.value)}
                    placeholder="Valor (ej. Blanco)"
                  />
                  {a.sugerencias?.length ? (
                    <datalist id={listId}>
                      {a.sugerencias.map((v) => (
                        <option key={v} value={v} />
                      ))}
                    </datalist>
                  ) : null}
                  <button
                    type="button"
                    className="btn ghost sm"
                    onClick={() => setAtributos((prev) => prev.filter((_, idx) => idx !== i))}
                    aria-label="Quitar atributo"
                  >
                    ×
                  </button>
                </div>
              );
            })}
          </>
        )}
      </div>
    </Modal>
  );
}
