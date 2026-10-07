"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import Modal from "@/components/ui/modal";
import type { Grid, ProductoPublico, VariantePublica } from "@/lib/types";
import type { LineaConfigurada } from "./modal-config-variante";

interface Props {
  producto: ProductoPublico;
  lineaInicial?: LineaConfigurada;
  onConfirmar: (linea: LineaConfigurada) => void;
  onCerrar: () => void;
}

/**
 * Selección de variante para productos SIN pasos guiados (componentes, sin BOM).
 * Carga el grid de ejes (`GET /productos/:id/grid`) y muestra un `<select>` por
 * atributo. Sólo se ofertan valores que correspondan a variantes activas ya
 * materializadas; si no hay ejes, cae a la lista plana de variantes.
 */
export default function ModalSeleccionVariante({ producto, lineaInicial, onConfirmar, onCerrar }: Props) {
  const [grid, setGrid] = useState<Grid | null>(null);
  const [cargando, setCargando] = useState(true);
  const [seleccion, setSeleccion] = useState<Record<number, number | undefined>>({});
  const [variantId, setVariantId] = useState<number>(
    lineaInicial?.configVariantId ?? lineaInicial?.variantId ?? producto.variantes[0]?.id ?? 0,
  );
  const [cantidad, setCantidad] = useState(lineaInicial?.cantidad ?? "1");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancel = false;
    setCargando(true);
    api<Grid>(`/productos/${producto.productId}/grid`)
      .then((g) => {
        if (cancel) return;
        setGrid(g);
        const inicialId = lineaInicial?.configVariantId ?? lineaInicial?.variantId;
        if (inicialId) {
          const ex = g.existentes.find((e) => e.varianteId === inicialId);
          if (ex) {
            const sel: Record<number, number | undefined> = {};
            g.ejes.forEach((eje, i) => { sel[eje.attributeId] = ex.valueIds[i]; });
            setSeleccion(sel);
          }
        }
      })
      .catch(() => { if (!cancel) setGrid(null); })
      .finally(() => { if (!cancel) setCargando(false); });
    return () => { cancel = true; };
  }, [producto.productId, lineaInicial]);

  const ejes = grid?.ejes ?? [];
  // Sólo variantes activas (las que expone la lista pública), alineadas a los ejes.
  const existentes = useMemo(() => {
    const activos = new Set(producto.variantes.map((v) => v.id));
    return (grid?.existentes ?? []).filter((e) => activos.has(e.varianteId));
  }, [grid, producto.variantes]);

  const usaSelectores = ejes.length > 0 && existentes.length > 0;

  const valorLabel = useMemo(() => {
    const m = new Map<number, string>();
    for (const eje of ejes) for (const v of eje.valores) m.set(v.id, v.valor);
    return m;
  }, [ejes]);

  const seleccionValueIds = useMemo(
    () => ejes.map((eje) => seleccion[eje.attributeId]),
    [ejes, seleccion],
  );

  const varianteResuelta = useMemo(() => {
    if (seleccionValueIds.some((v) => v === undefined)) return null;
    return existentes.find((e) => e.valueIds.every((vid, i) => vid === seleccionValueIds[i])) ?? null;
  }, [existentes, seleccionValueIds]);

  /** Valores materializados del eje `i` compatibles con las selecciones de los demás ejes. */
  function opcionesDe(i: number): { id: number; valor: string }[] {
    const ids = new Set<number>();
    for (const e of existentes) {
      const compatible = ejes.every((eje, j) => {
        if (j === i) return true;
        const sel = seleccion[eje.attributeId];
        return sel === undefined || e.valueIds[j] === sel;
      });
      if (compatible) ids.add(e.valueIds[i]);
    }
    return ejes[i].valores
      .filter((v) => ids.has(v.id))
      .sort((a, b) => a.valor.localeCompare(b.valor));
  }

  function elegir(i: number, valueId: number | undefined) {
    const eje = ejes[i];
    setSeleccion((prev) => {
      const next: Record<number, number | undefined> = { ...prev };
      if (valueId === undefined) delete next[eje.attributeId];
      else next[eje.attributeId] = valueId;
      // Limpia en silencio las selecciones de otros ejes que queden sin variante.
      for (let j = 0; j < ejes.length; j++) {
        if (j === i) continue;
        const cur = next[ejes[j].attributeId];
        if (cur === undefined) continue;
        const ok = existentes.some(
          (e) =>
            e.valueIds[j] === cur &&
            ejes.every((ee, k) => {
              const s = next[ee.attributeId];
              return s === undefined || s === e.valueIds[k];
            }),
        );
        if (!ok) delete next[ejes[j].attributeId];
      }
      return next;
    });
    setError("");
  }

  const esPieza = producto.uom === "pieza";

  const varianteFinal: VariantePublica | null = usaSelectores
    ? varianteResuelta
      ? producto.variantes.find((v) => v.id === varianteResuelta.varianteId) ?? {
          id: varianteResuelta.varianteId,
          nombre: varianteResuelta.nombre,
          sku: varianteResuelta.sku,
          precio: producto.basePrice,
        }
      : null
    : producto.variantes.find((v) => v.id === variantId) ?? null;

  function confirmar() {
    if (!varianteFinal) {
      setError(usaSelectores ? "Completa los atributos para elegir una variante." : "Elige una variante.");
      return;
    }
    const qty = Number(cantidad);
    if (!Number.isFinite(qty) || qty <= 0) {
      setError("La cantidad debe ser mayor a 0.");
      return;
    }
    if (esPieza && !Number.isInteger(qty)) {
      setError("La cantidad para piezas debe ser un número entero.");
      return;
    }
    const configuracion = usaSelectores
      ? {
          pasos: ejes.map((eje, i) => ({
            pregunta: eje.nombre,
            opciones: [],
            seleccion: valorLabel.get(seleccionValueIds[i]!) ?? "",
          })),
        }
      : undefined;
    onConfirmar({
      variantId: varianteFinal.id,
      productId: producto.productId,
      sku: varianteFinal.sku,
      nombre: varianteFinal.nombre,
      producto: producto.nombre,
      uom: producto.uom,
      cantidad,
      precio: lineaInicial?.precio ?? String(varianteFinal.precio),
      configuracion,
      configVariantId: varianteFinal.id,
    });
    onCerrar();
  }

  return (
    <Modal title={producto.nombre} onClose={onCerrar}>
      <p className="muted small" style={{ marginTop: 0 }}>
        {usaSelectores ? "Elige el valor de cada atributo para identificar la variante." : "Elige la variante para esta venta."}
      </p>

      {error && <div className="error">{error}</div>}

      {cargando ? (
        <p className="muted">Cargando atributos…</p>
      ) : usaSelectores ? (
        <div style={{ display: "grid", gap: 12 }}>
          {ejes.map((eje, i) => {
            const opciones = opcionesDe(i);
            const sel = seleccion[eje.attributeId];
            return (
              <label key={eje.attributeId}>
                {eje.nombre}
                <select
                  value={sel ?? ""}
                  disabled={opciones.length === 0}
                  onChange={(e) => elegir(i, e.target.value ? Number(e.target.value) : undefined)}
                >
                  <option value="">— Elegir —</option>
                  {opciones.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.valor}
                    </option>
                  ))}
                </select>
              </label>
            );
          })}

          <div
            style={{
              padding: "10px 14px",
              borderRadius: 8,
              border: "1px solid var(--line)",
              background: varianteFinal ? "#eff6ff" : "#fafafa",
            }}
          >
            {varianteFinal ? (
              <>
                <strong>{varianteFinal.nombre}</strong>
                <div className="muted small">
                  {varianteFinal.sku} · ${varianteFinal.precio.toFixed(2)}/{producto.uom}
                </div>
              </>
            ) : (
              <span className="muted small">Completa los atributos para ver la variante.</span>
            )}
          </div>
        </div>
      ) : producto.variantes.length === 0 ? (
        <p className="muted">Este producto no tiene variantes activas.</p>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {producto.variantes.map((v) => {
            const sel = v.id === variantId;
            return (
              <button
                key={v.id}
                type="button"
                onClick={() => setVariantId(v.id)}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 2,
                  textAlign: "left",
                  width: "100%",
                  padding: "10px 14px",
                  borderRadius: 8,
                  border: sel ? "2px solid var(--brand)" : "1px solid var(--line)",
                  background: sel ? "#eff6ff" : "#fff",
                  cursor: "pointer",
                }}
              >
                <strong>{v.nombre}</strong>
                <span className="muted small">{v.sku}</span>
              </button>
            );
          })}
        </div>
      )}

      <label style={{ marginTop: 16 }}>
        Cantidad
        <input
          type="number"
          min={esPieza ? "1" : "0.001"}
          step={esPieza ? "1" : "0.001"}
          value={cantidad}
          onChange={(e) => setCantidad(e.target.value)}
        />
      </label>

      <div className="row" style={{ marginTop: 16, justifyContent: "flex-end" }}>
        <button type="button" className="btn ghost" onClick={onCerrar}>
          Cancelar
        </button>
        <button type="button" className="btn primary" onClick={confirmar} disabled={!varianteFinal || cargando}>
          Agregar
        </button>
      </div>
    </Modal>
  );
}
