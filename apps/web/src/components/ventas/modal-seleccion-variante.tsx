"use client";

import { useState } from "react";
import Modal from "@/components/ui/modal";
import type { ProductoPublico } from "@/lib/types";
import type { LineaConfigurada } from "./modal-config-variante";

interface Props {
  producto: ProductoPublico;
  lineaInicial?: LineaConfigurada;
  onConfirmar: (linea: LineaConfigurada) => void;
  onCerrar: () => void;
}

/**
 * Selección de variante para productos SIN pasos guiados (ejes simples, p. ej.
 * color). Los productos configurables usan `ModalConfigVariante` (wizard).
 */
export default function ModalSeleccionVariante({ producto, lineaInicial, onConfirmar, onCerrar }: Props) {
  const [variantId, setVariantId] = useState<number>(
    lineaInicial?.configVariantId ?? lineaInicial?.variantId ?? producto.variantes[0]?.id ?? 0,
  );
  const [cantidad, setCantidad] = useState(lineaInicial?.cantidad ?? "1");
  const [error, setError] = useState("");

  const esPieza = producto.uom === "pieza";
  const variante = producto.variantes.find((v) => v.id === variantId) ?? null;

  function confirmar() {
    if (!variante) {
      setError("Elige una variante.");
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
    onConfirmar({
      variantId: variante.id,
      productId: producto.productId,
      sku: variante.sku,
      nombre: variante.nombre,
      producto: producto.nombre,
      uom: producto.uom,
      cantidad,
      configVariantId: variante.id,
    });
    onCerrar();
  }

  return (
    <Modal title={producto.nombre} onClose={onCerrar}>
      <p className="muted small" style={{ marginTop: 0 }}>
        Elige la variante para esta venta.
      </p>

      {error && <div className="error">{error}</div>}

      {producto.variantes.length === 0 ? (
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
        <button type="button" className="btn primary" onClick={confirmar} disabled={!variante}>
          Agregar
        </button>
      </div>
    </Modal>
  );
}
