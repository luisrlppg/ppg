"use client";

import { useState } from "react";
import Modal from "@/components/ui/modal";
import SelectorVariante from "@/components/ui/selector-variante";
import { api } from "@/lib/api";
import { useFormatCantidad } from "@/lib/preferences";
import type { Existencia, Ubicacion } from "@/lib/types";

export type Accion = "entrada" | "salida" | "mover";

interface Props {
  accion: Accion;
  exist: Existencia[];
  locs: Ubicacion[];
  variantInicial?: number | null;
  onCerrar: () => void;
  onHecho: (mensaje: string) => void;
}

/** Modal de entrada, salida y transferencia de stock entre ubicaciones. */
export default function ModalMovimiento({ accion, exist, locs, variantInicial = null, onCerrar, onHecho }: Props) {
  const formatCantidad = useFormatCantidad();
  const [selId, setSelId] = useState<number | null>(variantInicial);
  const [cantidad, setCantidad] = useState("");
  const [ubiId, setUbiId] = useState(String(locs[0]?.id ?? ""));
  const [ref, setRef] = useState("");
  const [origen, setOrigen] = useState(String(locs[0]?.id ?? ""));
  const [destino, setDestino] = useState(String(locs[1]?.id ?? locs[0]?.id ?? ""));
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");

  const seleccion = exist.find((x) => x.variantId === selId) ?? null;
  const disponible = seleccion?.porUbicacion[Number(ubiId)]?.qty ?? 0;

  const titulo =
    accion === "entrada" ? "Registrar entrada"
      : accion === "salida" ? "Registrar salida"
      : "Transferir entre ubicaciones";

  async function ejecutar(e: React.FormEvent) {
    e.preventDefault();
    if (selId === null) {
      setError("Selecciona una variante.");
      return;
    }
    setCargando(true);
    setError("");
    try {
      const qty = Number(cantidad);
      if (accion === "entrada" || accion === "salida") {
        if (!Number.isFinite(qty) || qty <= 0) {
          setError("La cantidad debe ser mayor a 0.");
          return;
        }
        if (accion === "salida") {
          const disp = exist.find((x) => x.variantId === selId)?.porUbicacion[Number(ubiId)]?.qty ?? 0;
          if (qty > disp) {
            setError(`Stock insuficiente en la ubicación: hay ${formatCantidad(disp)} y se intentan sacar ${formatCantidad(qty)}.`);
            return;
          }
        }
        await api("/inventario/movimiento", {
          method: "POST",
          body: JSON.stringify({
            variantId: selId,
            locationId: Number(ubiId),
            motivo: accion,
            cantidad: accion === "salida" ? -qty : qty,
            ref: ref || undefined,
          }),
        });
        onHecho(accion === "entrada" ? "Entrada registrada." : "Salida registrada.");
      } else if (accion === "mover") {
        await api("/inventario/mover", {
          method: "POST",
          body: JSON.stringify({ variantId: selId, fromLocationId: Number(origen), toLocationId: Number(destino), cantidad: qty, ref: ref || undefined }),
        });
        onHecho("Transferencia registrada.");
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCargando(false);
    }
  }

  return (
    <Modal title={titulo} onClose={onCerrar}>
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
            <strong>{seleccion.producto}</strong> · {seleccion.nombre} ({seleccion.sku}) · Stock total: {formatCantidad(seleccion.stockActual)} {seleccion.uom}
          </p>
        )}

        {(accion === "entrada" || accion === "salida") && (
          <label>
            Ubicación
            <select value={ubiId} onChange={(e) => setUbiId(e.target.value)}>
              {locs.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.nombre}
                </option>
              ))}
            </select>
          </label>
        )}

        {accion === "salida" && seleccion && (
          <p className="muted small" style={{ margin: "0 0 8px" }}>
            Disponible en la ubicación: <strong>{formatCantidad(disponible)} {seleccion.uom}</strong>
          </p>
        )}

        {accion === "mover" && (
          <div className="row">
            <label>
              Origen
              <select value={origen} onChange={(e) => setOrigen(e.target.value)}>
                {locs.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.nombre}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Destino
              <select value={destino} onChange={(e) => setDestino(e.target.value)}>
                {locs.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.nombre}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}

        <div className="row">
          <label>
            Cantidad
            <input type="number" step="0.001" min="0" value={cantidad} onChange={(e) => setCantidad(e.target.value)} required />
          </label>
          <label>
            Referencia (opcional)
            <input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="ej. venta 001, lote 7" />
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
