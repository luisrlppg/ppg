"use client";

import { useEffect, useState } from "react";
import Modal from "@/components/ui/modal";
import SelectorVariante from "@/components/ui/selector-variante";
import SelectorUbicacion from "@/components/ui/selector-ubicacion";
import { api } from "@/lib/api";
import { useFormatCantidad } from "@/lib/preferences";
import type { Existencia, Ubicacion } from "@/lib/types";

interface Props {
  exist: Existencia[];
  locs: Ubicacion[];
  onCerrar: () => void;
  onHecho: (mensaje: string) => void;
}

/** Modal para registrar entradas de stock: elegir variante, ubicación y cantidad. */
export default function ModalEntrada({ exist, locs, onCerrar, onHecho }: Props) {
  const formatCantidad = useFormatCantidad();
  const [selId, setSelId] = useState<number | null>(null);
  const [ubiId, setUbiId] = useState<number | null>(null);
  const [cantidad, setCantidad] = useState("");
  const [ref, setRef] = useState("");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");

  const seleccion = exist.find((x) => x.variantId === selId) ?? null;

  // Ubicación: se conserva si sigue valiendo; si sólo hay una, se autoselecciona.
  useEffect(() => {
    setUbiId((prev) => {
      if (prev !== null && locs.some((l) => l.id === prev)) return prev;
      return locs.length === 1 ? locs[0].id : null;
    });
  }, [locs]);

  async function ejecutar(e: React.FormEvent) {
    e.preventDefault();
    if (selId === null) {
      setError("Selecciona una variante.");
      return;
    }
    if (ubiId === null) {
      setError("Selecciona una ubicación.");
      return;
    }
    const qty = Number(cantidad);
    if (!Number.isFinite(qty) || qty <= 0) {
      setError("La cantidad debe ser mayor a 0.");
      return;
    }
    setCargando(true);
    setError("");
    try {
      await api("/inventario/movimiento", {
        method: "POST",
        body: JSON.stringify({ variantId: selId, locationId: ubiId, motivo: "entrada", cantidad: qty, ref: ref || undefined }),
      });
      onHecho("Entrada registrada.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCargando(false);
    }
  }

  return (
    <Modal title="Registrar entrada" onClose={onCerrar}>
      <form onSubmit={ejecutar}>
        {error && <div className="error">{error}</div>}

        <div style={{ margin: "12px 0", fontWeight: 600 }}>
          Variante
          <div style={{ fontWeight: 400, marginTop: 4 }}>
            <SelectorVariante items={exist} value={selId} onChange={setSelId} />
          </div>
        </div>
        {seleccion && (
          <p className="muted small" style={{ margin: "8px 0" }}>
            <strong>{seleccion.producto}</strong> · {seleccion.nombre} ({seleccion.sku}) · Stock total:{" "}
            {formatCantidad(seleccion.stockActual)} {seleccion.uom}
          </p>
        )}

        <label>
          Ubicación
          <SelectorUbicacion ubicaciones={locs} value={ubiId} onChange={setUbiId} />
        </label>

        <div className="row">
          <label>
            Cantidad
            <input type="number" step="0.001" min="0" value={cantidad} onChange={(e) => setCantidad(e.target.value)} required />
          </label>
          <label>
            Referencia (opcional)
            <input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="ej. compra 001, lote 7" />
          </label>
        </div>

        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button type="button" className="btn ghost" onClick={onCerrar}>
            Cancelar
          </button>
          <button className="btn primary" disabled={cargando}>
            {cargando ? "Guardando…" : "Registrar"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
