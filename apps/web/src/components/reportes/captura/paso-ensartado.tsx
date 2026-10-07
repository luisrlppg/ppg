"use client";

import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { api } from "@/lib/api";
import type { EnsartadoCombinacion, EnsartadoData } from "@/lib/types";
import type { EnsartadoForm } from "./comun";

interface Props {
  ensartadoLines: EnsartadoForm[];
  setEnsartadoLines: Dispatch<SetStateAction<EnsartadoForm[]>>;
  turno: string;
  fecha: string;
  personas: string;
  onContinuar: () => void;
  onAtras: () => void;
  setError: (m: string) => void;
  setMsg: (m: string) => void;
}

export default function PasoEnsartado({
  ensartadoLines,
  setEnsartadoLines,
  turno,
  fecha,
  personas,
  onContinuar,
  onAtras,
  setError,
  setMsg,
}: Props) {
  const [ensartado, setEnsartado] = useState<EnsartadoData | null>(null);
  const [cargando, setCargando] = useState(true);
  const [mangoSeleccion, setMangoSeleccion] = useState<number[]>([]);
  const [cerdaColorId, setCerdaColorId] = useState<number | null>(null);
  const [cantidadPincel, setCantidadPincel] = useState("1");

  useEffect(() => {
    let vivo = true;
    api<EnsartadoData>("/reportes/ensartado")
      .then((d) => {
        if (vivo) setEnsartado(d);
      })
      .catch((err) => {
        if (vivo) setError((err as Error).message);
      })
      .finally(() => {
        if (vivo) setCargando(false);
      });
    return () => {
      vivo = false;
    };
  }, [setError]);

  function coloresDeMango(mid: number): { id: number; valor: string }[] {
    if (!ensartado) return [];
    const ids = new Set(ensartado.combinaciones.filter((c) => c.mangoVariantId === mid).map((c) => c.colorId));
    return ensartado.colores.filter((c) => ids.has(c.id));
  }

  function resolverPincel(mid: number, cid: number): EnsartadoCombinacion | null {
    return ensartado?.combinaciones.find((c) => c.mangoVariantId === mid && c.colorId === cid) ?? null;
  }

  const ejesMango = ensartado?.ejes ?? [];

  function mangosCompatibles(sel: number[]) {
    if (!ensartado) return [];
    return ensartado.mangos.filter((m) => sel.every((v, i) => m.valueIds[i] === v));
  }

  function autoCompletarMango(sel: number[]): number[] {
    if (!ensartado) return sel;
    const s = [...sel];
    let compat = mangosCompatibles(s);
    while (compat.length > 1 && s.length < ejesMango.length) {
      const ids = new Set(compat.map((m) => m.valueIds[s.length]));
      if (ids.size !== 1) break;
      s.push([...ids][0]);
      compat = mangosCompatibles(s);
    }
    return s;
  }

  const seleccionAuto = autoCompletarMango(mangoSeleccion);
  const mangosDisponibles = mangosCompatibles(seleccionAuto);
  const mangoResuelto = mangosDisponibles.length === 1 ? mangosDisponibles[0] : null;
  const pasoMango = mangoResuelto ? null : seleccionAuto.length;
  let opcionesPaso: { id: number; valor: string }[] = [];
  if (pasoMango !== null) {
    const ids = new Set(mangosDisponibles.map((m) => m.valueIds[pasoMango]));
    opcionesPaso = ejesMango[pasoMango]?.valores.filter((v) => ids.has(v.id)) ?? [];
  }

  function etiquetaValorMango(paso: number, valueId: number): string {
    return ejesMango[paso]?.valores.find((v) => v.id === valueId)?.valor ?? "—";
  }

  function elegirMangoPaso(valueId: number) {
    setMangoSeleccion([...seleccionAuto, valueId]);
    setCerdaColorId(null);
  }

  function retrocederMango() {
    let s = [...mangoSeleccion];
    while (s.length > 0) {
      const j = s.length - 1;
      s = s.slice(0, j);
      const compat = mangosCompatibles(s);
      if (compat.length <= 1) continue;
      const ids = new Set(compat.map((m) => m.valueIds[j]));
      if (ids.size > 1) break;
    }
    setMangoSeleccion(s);
    setCerdaColorId(null);
  }

  function resetMango() {
    setMangoSeleccion([]);
    setCerdaColorId(null);
    setCantidadPincel("1");
  }

  const pincelPreview =
    mangoResuelto && cerdaColorId !== null ? resolverPincel(mangoResuelto.variantId, cerdaColorId) : null;

  function agregarPincel() {
    if (mangoResuelto === null || cerdaColorId === null) return;
    const pincel = resolverPincel(mangoResuelto.variantId, cerdaColorId);
    if (!pincel) {
      setError("No existe un pincel para ese mango y color.");
      return;
    }
    if (!(Number(cantidadPincel) > 0)) {
      setError("Cantidad inválida.");
      return;
    }
    if (ensartadoLines.some((l) => l.mangoVariantId === mangoResuelto.variantId && l.colorId === cerdaColorId)) {
      setError("Ese pincel ya está agregado.");
      return;
    }
    const color = ensartado?.colores.find((c) => c.id === cerdaColorId)?.valor ?? "—";
    setEnsartadoLines((prev) => [
      ...prev,
      {
        key: `${pincel.pincelVariantId}-${Date.now()}${Math.random()}`,
        pincelVariantId: pincel.pincelVariantId,
        pincelSku: pincel.sku,
        pincelNombre: pincel.nombre,
        mangoVariantId: mangoResuelto.variantId,
        mango: mangoResuelto.etiqueta,
        colorId: cerdaColorId,
        color,
        cantidad: cantidadPincel,
      },
    ]);
    setError("");
    setMsg("");
    resetMango();
  }

  function cambiarCantidadPincel(key: string, valor: string) {
    setEnsartadoLines((prev) => prev.map((l) => (l.key === key ? { ...l, cantidad: valor } : l)));
  }

  return (
    <div className="card">
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 4, flexWrap: "wrap" }}>
        <h4 style={{ margin: 0 }}>Paso 2 · Ensartado</h4>
        <span className="muted small">
          {turno === "matutino" ? "Matutino" : "Vespertino"} · {new Date(`${fecha}T12:00:00`).toLocaleDateString("es-MX")} ·{" "}
          {personas} pers.
        </span>
      </div>
      <p className="muted small" style={{ marginTop: 0 }}>
        Elige el mango paso a paso y el color de cerda para armar cada pincel producido.
      </p>

      {cargando ? (
        <p className="muted small">Cargando…</p>
      ) : (
        <>
          {seleccionAuto.length > 0 && (
            <div className="row" style={{ flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
              {seleccionAuto.map((v, i) => (
                <span key={`${i}-${v}`} className="badge normal">
                  {ejesMango[i]?.nombre}: {etiquetaValorMango(i, v)}
                </span>
              ))}
            </div>
          )}

          {mangoResuelto === null ? (
            <>
              <h5 style={{ marginBottom: 4 }}>{ejesMango[pasoMango ?? 0]?.nombre ?? "Mango"}</h5>
              <div className="row" style={{ flexWrap: "wrap" }}>
                {opcionesPaso.map((o) => (
                  <button key={o.id} type="button" className="btn" onClick={() => elegirMangoPaso(o.id)}>
                    {o.valor}
                  </button>
                ))}
              </div>
              {opcionesPaso.length === 0 && <p className="muted small">Sin mangos con pincel para esa combinación.</p>}
              {mangoSeleccion.length > 0 && (
                <button type="button" className="btn ghost" style={{ flex: 0, marginTop: 8 }} onClick={retrocederMango}>
                  Atrás
                </button>
              )}
            </>
          ) : (
            <>
              <h5 style={{ marginBottom: 4 }}>
                Mango: <strong>{mangoResuelto.etiqueta}</strong>{" "}
                <span className="muted small">({mangoResuelto.sku})</span>
              </h5>
              <h5 style={{ marginTop: 12, marginBottom: 4 }}>Color de cerda</h5>
              <div className="row" style={{ flexWrap: "wrap" }}>
                {coloresDeMango(mangoResuelto.variantId).map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className={`btn ${cerdaColorId === c.id ? "primary" : ""}`}
                    onClick={() => setCerdaColorId(c.id)}
                  >
                    {c.valor}
                  </button>
                ))}
              </div>
              <div className="row" style={{ marginTop: 12, alignItems: "end", flexWrap: "wrap" }}>
                <label style={{ width: 110 }}>
                  Cantidad
                  <input type="number" min="1" step="1" value={cantidadPincel} onChange={(e) => setCantidadPincel(e.target.value)} />
                </label>
                <button type="button" className="btn primary" style={{ flex: 0 }} disabled={cerdaColorId === null} onClick={agregarPincel}>
                  Agregar
                </button>
                <button type="button" className="btn ghost" style={{ flex: 0 }} onClick={retrocederMango}>
                  Atrás
                </button>
              </div>
              {pincelPreview && (
                <p className="muted small" style={{ marginTop: 8 }}>
                  Pincel: <strong>{pincelPreview.nombre}</strong> ({pincelPreview.sku})
                </p>
              )}
            </>
          )}
        </>
      )}

      <h5 style={{ marginTop: 16, marginBottom: 4 }}>Pinceles capturados ({ensartadoLines.length})</h5>
      {ensartadoLines.length === 0 ? (
        <p className="muted small">Aún no agregas pinceles.</p>
      ) : (
        <ul className="step-list">
          {ensartadoLines.map((l) => (
            <li key={l.key}>
              <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
                <span>
                  <span className="badge normal">Ensartado</span> <strong>{l.pincelNombre}</strong> · {l.color}
                  <div className="small muted">
                    Mango: {l.mango} · {l.pincelSku}
                  </div>
                </span>
                <span className="row" style={{ flex: 0, gap: 8, alignItems: "center" }}>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={l.cantidad}
                    onChange={(e) => cambiarCantidadPincel(l.key, e.target.value)}
                    style={{ width: 90 }}
                  />
                  <button
                    type="button"
                    className="btn ghost"
                    style={{ flex: 0 }}
                    onClick={() => setEnsartadoLines((prev) => prev.filter((x) => x.key !== l.key))}
                  >
                    Quitar
                  </button>
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="row" style={{ marginTop: 8 }}>
        <button type="button" className="btn primary block" onClick={onContinuar}>
          Continuar a otras secciones
        </button>
        <button type="button" className="btn ghost" style={{ flex: 0 }} onClick={onAtras}>
          Atrás
        </button>
      </div>
    </div>
  );
}
