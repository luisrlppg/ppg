"use client";

import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { api } from "@/lib/api";
import type { CepillosNylonGrid } from "@/lib/types";
import { MAQUINAS, type LineaForm, type Maquina } from "./comun";

interface Props {
  lines: LineaForm[];
  setLines: Dispatch<SetStateAction<LineaForm[]>>;
  turno: string;
  fecha: string;
  personas: string;
  onContinuar: () => void;
  onReiniciar: () => void;
  setError: (m: string) => void;
  setMsg: (m: string) => void;
}

export default function PasoCepillos({ lines, setLines, turno, fecha, personas, onContinuar, onReiniciar, setError, setMsg }: Props) {
  const [grid, setGrid] = useState<CepillosNylonGrid | null>(null);
  const [cargando, setCargando] = useState(true);
  const [maquina, setMaquina] = useState<Maquina | null>(null);
  const [formaId, setFormaId] = useState<number | null>(null);
  const [colorId, setColorId] = useState<number | null>(null);
  const [cantidad, setCantidad] = useState("1");

  useEffect(() => {
    let vivo = true;
    api<CepillosNylonGrid>("/reportes/cepillos-nylon")
      .then((g) => {
        if (vivo) setGrid(g);
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

  const ejes = grid?.ejes ?? [];
  const shapeIdx = ejes.findIndex((e) => /forma/i.test(e.nombre));
  const colorIdx = ejes.findIndex((e) => /color/i.test(e.nombre));
  const shapeEje = shapeIdx >= 0 ? ejes[shapeIdx] : null;
  const colorEje = colorIdx >= 0 ? ejes[colorIdx] : null;

  function coloresDeForma(fid: number): { id: number; valor: string }[] {
    if (!grid || !colorEje) return [];
    const ids = new Set(grid.existentes.filter((v) => v.valueIds[shapeIdx] === fid).map((v) => v.valueIds[colorIdx]));
    return colorEje.valores.filter((c) => ids.has(c.id));
  }

  function resolverVariante(fid: number, cid: number) {
    return grid?.existentes.find((v) => v.valueIds[shapeIdx] === fid && v.valueIds[colorIdx] === cid) ?? null;
  }

  function agregarCepillo() {
    if (maquina === null || formaId === null || colorId === null) return;
    const variante = resolverVariante(formaId, colorId);
    if (!variante) {
      setError("No existe una variante para esa forma y color.");
      return;
    }
    if (!(Number(cantidad) > 0)) {
      setError("Cantidad inválida.");
      return;
    }
    if (lines.some((l) => l.variantId === variante.varianteId && l.seccion === maquina)) {
      setError("Ese cepillo ya está agregado en esa máquina.");
      return;
    }
    const forma = shapeEje?.valores.find((v) => v.id === formaId)?.valor ?? "—";
    const color = colorEje?.valores.find((v) => v.id === colorId)?.valor ?? "—";
    setLines((prev) => [
      ...prev,
      {
        key: `${variante.varianteId}-${maquina}-${Date.now()}${Math.random()}`,
        variantId: variante.varianteId,
        sku: variante.sku,
        nombre: variante.nombre,
        producto: grid?.nombre ?? "Cepillo Nylon",
        uom: "pieza",
        seccion: maquina,
        tipo: "final",
        cantidad,
        forma,
        color,
      },
    ]);
    setError("");
    setMsg("");
    setMaquina(null);
    setFormaId(null);
    setColorId(null);
    setCantidad("1");
  }

  function cambiarCantidad(key: string, valor: string) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, cantidad: valor } : l)));
  }

  return (
    <div className="card">
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 4, flexWrap: "wrap" }}>
        <h4 style={{ margin: 0 }}>Paso 1 · Producción de cepillos de Nylon</h4>
        <span className="muted small">
          {turno === "matutino" ? "Matutino" : "Vespertino"} · {new Date(`${fecha}T12:00:00`).toLocaleDateString("es-MX")} ·{" "}
          {personas} pers.
        </span>
      </div>

      {cargando ? (
        <p className="muted small">Cargando…</p>
      ) : maquina === null ? (
        <>
          <h5 style={{ marginBottom: 4 }}>Elige la máquina</h5>
          <div className="row">
            {MAQUINAS.map((m) => (
              <button key={m.value} type="button" className="btn" onClick={() => setMaquina(m.value)}>
                {m.label}
              </button>
            ))}
          </div>
        </>
      ) : formaId === null ? (
        <>
          <h5 style={{ marginBottom: 4 }}>
            {MAQUINAS.find((m) => m.value === maquina)?.label} · Forma del cepillo
          </h5>
          <div className="row" style={{ flexWrap: "wrap" }}>
            {shapeEje?.valores.map((f) => (
              <button key={f.id} type="button" className="btn" onClick={() => setFormaId(f.id)}>
                {f.valor}
              </button>
            ))}
          </div>
          <button type="button" className="btn ghost" style={{ flex: 0, marginTop: 8 }} onClick={() => setMaquina(null)}>
            Atrás
          </button>
        </>
      ) : colorId === null ? (
        <>
          <h5 style={{ marginBottom: 4 }}>
            {MAQUINAS.find((m) => m.value === maquina)?.label} · {shapeEje?.valores.find((v) => v.id === formaId)?.valor} · Color
          </h5>
          <div className="row" style={{ flexWrap: "wrap" }}>
            {coloresDeForma(formaId).map((c) => (
              <button key={c.id} type="button" className="btn" onClick={() => setColorId(c.id)}>
                {c.valor}
              </button>
            ))}
          </div>
          {coloresDeForma(formaId).length === 0 && <p className="muted small">Sin colores disponibles para esa forma.</p>}
          <button type="button" className="btn ghost" style={{ flex: 0, marginTop: 8 }} onClick={() => setFormaId(null)}>
            Atrás
          </button>
        </>
      ) : (
        <>
          <h5 style={{ marginBottom: 4 }}>
            {MAQUINAS.find((m) => m.value === maquina)?.label} · {shapeEje?.valores.find((v) => v.id === formaId)?.valor} ·{" "}
            {colorEje?.valores.find((v) => v.id === colorId)?.valor}
          </h5>
          <label style={{ maxWidth: 220 }}>
            Cantidad
            <input type="number" min="1" step="1" value={cantidad} onChange={(e) => setCantidad(e.target.value)} />
          </label>
          <div className="row" style={{ marginTop: 8 }}>
            <button type="button" className="btn primary" style={{ flex: 0 }} onClick={agregarCepillo}>
              Agregar
            </button>
            <button type="button" className="btn ghost" style={{ flex: 0 }} onClick={() => setColorId(null)}>
              Atrás
            </button>
          </div>
        </>
      )}

      <h5 style={{ marginTop: 16, marginBottom: 4 }}>Capturados ({lines.length})</h5>
      {lines.length === 0 ? (
        <p className="muted small">Aún no agregas cepillos.</p>
      ) : (
        <ul className="step-list">
          {lines.map((l) => (
            <li key={l.key}>
              <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
                <span>
                  <span className="badge normal">{MAQUINAS.find((m) => m.value === l.seccion)?.label ?? l.seccion}</span>{" "}
                  <strong>{l.producto}</strong> · {l.forma} · {l.color}
                  <div className="small muted">
                    {l.sku}
                    {l.tipo === "consumo" ? " · consumo" : ""}
                  </div>
                </span>
                <span className="row" style={{ flex: 0, gap: 8, alignItems: "center" }}>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={l.cantidad}
                    onChange={(e) => cambiarCantidad(l.key, e.target.value)}
                    style={{ width: 90 }}
                  />
                  <button type="button" className="btn ghost" style={{ flex: 0 }} onClick={() => setLines((prev) => prev.filter((x) => x.key !== l.key))}>
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
          Continuar a ensartado
        </button>
        <button type="button" className="btn ghost" style={{ flex: 0 }} onClick={onReiniciar}>
          Reiniciar
        </button>
      </div>
    </div>
  );
}
