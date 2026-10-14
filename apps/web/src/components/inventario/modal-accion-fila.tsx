"use client";

import { useEffect, useMemo, useState } from "react";
import Modal from "@/components/ui/modal";
import Segmented from "@/components/ui/segmented";
import SelectorUbicacion from "@/components/ui/selector-ubicacion";
import { api } from "@/lib/api";
import { useFormatCantidad } from "@/lib/preferences";
import type { Existencia, Ubicacion } from "@/lib/types";

type Modo = "reajustar" | "entrada" | "salida" | "reubicar";

interface Props {
  variante: Existencia;
  ubicacion: Ubicacion;
  cantidad: number;
  locs: Ubicacion[];
  onCerrar: () => void;
  onHecho: (mensaje: string) => void;
}

const MODOS: { value: Modo; label: string }[] = [
  { value: "reajustar", label: "Reajustar cantidad" },
  { value: "entrada", label: "Entrada de material" },
  { value: "salida", label: "Salida de material" },
  { value: "reubicar", label: "Reubicación" },
];

/**
 * Acciones sobre el stock de una variante en una ubicación concreta (fila de
 * Inventario). El origen queda fijado por la fila; la cantidad viene precargada.
 */
export default function ModalAccionFila({ variante, ubicacion, cantidad, locs, onCerrar, onHecho }: Props) {
  const formatCantidad = useFormatCantidad();
  const [modo, setModo] = useState<Modo>("reajustar");
  const [qty, setQty] = useState(String(cantidad));
  const [destino, setDestino] = useState<number | null>(null);
  const [ref, setRef] = useState("");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");

  // Al cambiar de modo, precarga la cantidad según la intención.
  useEffect(() => {
    setQty(modo === "entrada" ? "" : String(cantidad));
    setError("");
  }, [modo, cantidad]);

  const destinos = useMemo(() => locs.filter((l) => l.id !== ubicacion.id), [locs, ubicacion.id]);

  const etiquetaCantidad = modo === "reajustar" ? "Nueva cantidad" : "Cantidad";
  const etiquetaBoton =
    modo === "reajustar" ? "Reajustar"
      : modo === "entrada" ? "Registrar entrada"
      : modo === "salida" ? "Registrar salida"
      : "Reubicar";

  async function ejecutar(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const n = Number(qty);
    if (modo === "reajustar") {
      if (!Number.isFinite(n) || n < 0) {
        setError("La cantidad no puede ser negativa.");
        return;
      }
    } else {
      if (!Number.isFinite(n) || n <= 0) {
        setError("La cantidad debe ser mayor a 0.");
        return;
      }
      if ((modo === "salida" || modo === "reubicar") && n > cantidad) {
        setError(`Stock insuficiente en la ubicación: hay ${formatCantidad(cantidad)} y se intentan ${formatCantidad(n)}.`);
        return;
      }
      if (modo === "reubicar" && destino === null) {
        setError("Selecciona la ubicación de destino.");
        return;
      }
    }

    setCargando(true);
    try {
      if (modo === "reajustar") {
        await api("/inventario/ajuste", {
          method: "POST",
          body: JSON.stringify({ variantId: variante.variantId, locationId: ubicacion.id, nuevaCantidad: n, ref: ref || undefined }),
        });
        onHecho("Cantidad reajustada.");
      } else if (modo === "entrada" || modo === "salida") {
        await api("/inventario/movimiento", {
          method: "POST",
          body: JSON.stringify({
            variantId: variante.variantId,
            locationId: ubicacion.id,
            motivo: modo,
            cantidad: modo === "entrada" ? n : -n,
            ref: ref || undefined,
          }),
        });
        onHecho(modo === "entrada" ? "Entrada registrada." : "Salida registrada.");
      } else {
        await api("/inventario/mover", {
          method: "POST",
          body: JSON.stringify({
            variantId: variante.variantId,
            fromLocationId: ubicacion.id,
            toLocationId: destino,
            cantidad: n,
            ref: ref || undefined,
          }),
        });
        onHecho("Reubicación registrada.");
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setCargando(false);
    }
  }

  return (
    <Modal title="Acción de inventario" onClose={onCerrar}>
      <form onSubmit={ejecutar}>
        {error && <div className="error">{error}</div>}

        <p className="muted small" style={{ margin: "0 0 4px" }}>
          <strong>{variante.producto}</strong> · {variante.nombre} ({variante.sku})
        </p>
        {variante.valoracion.length > 0 && (
          <div className="attr-list" style={{ marginBottom: 4 }}>
            {variante.valoracion.map((a) => (
              <span key={a.attribute} className="attr-item">
                <span className="attr-name">{a.attribute}</span> {a.valor}
              </span>
            ))}
          </div>
        )}
        <p className="muted small" style={{ margin: "0 0 12px" }}>
          Ubicación: <strong>{ubicacion.nombre}</strong> · Disponible:{" "}
          <strong>{formatCantidad(cantidad)} {variante.uom}</strong>
        </p>

        <div style={{ marginBottom: 12 }}>
          <Segmented value={modo} onChange={(v) => setModo(v as Modo)} options={MODOS} />
        </div>

        <div className="row">
          <label>
            {etiquetaCantidad}
            <input
              type="number"
              step="0.001"
              min={modo === "reajustar" ? 0 : undefined}
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              required
            />
          </label>
          <label>
            Referencia (opcional)
            <input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="ej. venta 001, lote 7" />
          </label>
        </div>

        {modo === "reubicar" && (
          <label>
            Destino
            <SelectorUbicacion ubicaciones={destinos} value={destino} onChange={setDestino} placeholder="Buscar destino…" />
          </label>
        )}

        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button type="button" className="btn ghost" onClick={onCerrar}>
            Cancelar
          </button>
          <button className="btn primary" disabled={cargando}>
            {cargando ? "Guardando…" : etiquetaBoton}
          </button>
        </div>
      </form>
    </Modal>
  );
}
