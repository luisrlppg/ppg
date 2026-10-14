"use client";

import { useEffect, useMemo, useState } from "react";
import Modal from "@/components/ui/modal";
import SelectorVariante from "@/components/ui/selector-variante";
import SelectorUbicacion from "@/components/ui/selector-ubicacion";
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
  const [ubiId, setUbiId] = useState<number | null>(null);
  const [ref, setRef] = useState("");
  const [origen, setOrigen] = useState<number | null>(null);
  const [destino, setDestino] = useState<number | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");

  const seleccion = exist.find((x) => x.variantId === selId) ?? null;
  const disponible = seleccion && ubiId !== null ? seleccion.porUbicacion[ubiId]?.qty ?? 0 : 0;

  // Ubicaciones donde la variante tiene existencia: candidatas a Origen.
  const origenes = useMemo(() => {
    if (!seleccion) return [];
    return Object.entries(seleccion.porUbicacion)
      .filter(([, l]) => l.qty > 0)
      .map(([id, l]) => ({ id: Number(id), nombre: l.location }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [seleccion]);

  // Destino: cualquier ubicación salvo el origen.
  const destinos = useMemo(() => locs.filter((l) => l.id !== origen), [locs, origen]);

  // Origen: se conserva si sigue valiendo; si sólo hay una opción, se autoselecciona.
  useEffect(() => {
    setOrigen((prev) => {
      if (prev !== null && origenes.some((o) => o.id === prev)) return prev;
      return origenes.length === 1 ? origenes[0].id : null;
    });
  }, [origenes]);

  useEffect(() => {
    if (destino !== null && !destinos.some((d) => d.id === destino)) setDestino(null);
  }, [destinos, destino]);

  const disponibleOrigen = seleccion && origen !== null ? seleccion.porUbicacion[origen]?.qty ?? 0 : 0;

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
        if (ubiId === null) {
          setError("Selecciona una ubicación.");
          return;
        }
        if (!Number.isFinite(qty) || qty <= 0) {
          setError("La cantidad debe ser mayor a 0.");
          return;
        }
        if (accion === "salida" && qty > disponible) {
          setError(`Stock insuficiente en la ubicación: hay ${formatCantidad(disponible)} y se intentan sacar ${formatCantidad(qty)}.`);
          return;
        }
        await api("/inventario/movimiento", {
          method: "POST",
          body: JSON.stringify({
            variantId: selId,
            locationId: ubiId,
            motivo: accion,
            cantidad: accion === "salida" ? -qty : qty,
            ref: ref || undefined,
          }),
        });
        onHecho(accion === "entrada" ? "Entrada registrada." : "Salida registrada.");
      } else if (accion === "mover") {
        if (origen === null || destino === null) {
          setError("Selecciona la ubicación de origen y de destino.");
          return;
        }
        if (!Number.isFinite(qty) || qty <= 0) {
          setError("La cantidad debe ser mayor a 0.");
          return;
        }
        if (qty > disponibleOrigen) {
          setError(`Stock insuficiente en el origen: hay ${formatCantidad(disponibleOrigen)} y se intentan mover ${formatCantidad(qty)}.`);
          return;
        }
        await api("/inventario/mover", {
          method: "POST",
          body: JSON.stringify({ variantId: selId, fromLocationId: origen, toLocationId: destino, cantidad: qty, ref: ref || undefined }),
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
            <SelectorUbicacion ubicaciones={locs} value={ubiId} onChange={setUbiId} />
          </label>
        )}

        {accion === "salida" && seleccion && ubiId !== null && (
          <p className="muted small" style={{ margin: "0 0 8px" }}>
            Disponible en la ubicación: <strong>{formatCantidad(disponible)} {seleccion.uom}</strong>
          </p>
        )}

        {accion === "mover" &&
          (selId === null ? (
            <p className="muted small" style={{ margin: "0 0 8px" }}>
              Selecciona una variante para ver desde qué ubicación puedes transferirla.
            </p>
          ) : origenes.length === 0 ? (
            <p className="muted small" style={{ margin: "0 0 8px" }}>
              Esta variante no tiene existencia en ninguna ubicación.
            </p>
          ) : (
            <>
              <div className="row">
                <label>
                  Origen
                  <SelectorUbicacion ubicaciones={origenes} value={origen} onChange={setOrigen} placeholder="Buscar origen…" />
                </label>
                <label>
                  Destino
                  <SelectorUbicacion ubicaciones={destinos} value={destino} onChange={setDestino} placeholder="Buscar destino…" />
                </label>
              </div>
              {origen !== null && seleccion && (
                <p className="muted small" style={{ margin: "0 0 8px" }}>
                  Disponible en origen: <strong>{formatCantidad(disponibleOrigen)} {seleccion.uom}</strong>
                </p>
              )}
            </>
          ))}

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
