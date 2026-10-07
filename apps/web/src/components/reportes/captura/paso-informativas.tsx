"use client";

import { useState, type Dispatch, type FormEvent, type SetStateAction } from "react";
import { SECCIONES_INFORMATIVAS, type InformativaForm, type SeccionInformativa } from "./comun";

interface Props {
  informativas: InformativaForm[];
  setInformativas: Dispatch<SetStateAction<InformativaForm[]>>;
  turno: string;
  fecha: string;
  personas: string;
  guardando: boolean;
  editandoId: number | null;
  onSubmit: (e: FormEvent) => void;
  onAtras: () => void;
  onReiniciar: () => void;
  setError: (m: string) => void;
  setMsg: (m: string) => void;
}

export default function PasoInformativas({
  informativas,
  setInformativas,
  turno,
  fecha,
  personas,
  guardando,
  editandoId,
  onSubmit,
  onAtras,
  onReiniciar,
  setError,
  setMsg,
}: Props) {
  const [infoSeccion, setInfoSeccion] = useState<SeccionInformativa>("ensamble");
  const [infoProducto, setInfoProducto] = useState("");
  const [infoCantidad, setInfoCantidad] = useState("1");

  function agregarInformativa() {
    if (!infoProducto.trim()) {
      setError("Escribe el producto de la sección.");
      return;
    }
    if (!(Number(infoCantidad) > 0)) {
      setError("Cantidad inválida.");
      return;
    }
    setInformativas((prev) => [
      ...prev,
      {
        key: `${infoSeccion}-${Date.now()}${Math.random()}`,
        seccion: infoSeccion,
        producto: infoProducto.trim(),
        cantidad: infoCantidad,
      },
    ]);
    setError("");
    setMsg("");
    setInfoProducto("");
    setInfoCantidad("1");
  }

  function cambiarCantidadInformativa(key: string, valor: string) {
    setInformativas((prev) => prev.map((i) => (i.key === key ? { ...i, cantidad: valor } : i)));
  }

  return (
    <form className="card" onSubmit={onSubmit}>
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 4, flexWrap: "wrap" }}>
        <h4 style={{ margin: 0 }}>Paso 3 · Otras secciones</h4>
        <span className="muted small">
          {turno === "matutino" ? "Matutino" : "Vespertino"} · {new Date(`${fecha}T12:00:00`).toLocaleDateString("es-MX")} ·{" "}
          {personas} pers.
        </span>
      </div>
      <p className="muted small" style={{ marginTop: 0 }}>
        Secciones informativas (solo estadística, no mueven inventario): escribe el producto y la cantidad.
      </p>

      <div className="row" style={{ alignItems: "end", flexWrap: "wrap" }}>
        <label style={{ width: 170 }}>
          Sección
          <select value={infoSeccion} onChange={(e) => setInfoSeccion(e.target.value as SeccionInformativa)}>
            {SECCIONES_INFORMATIVAS.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </label>
        <label style={{ flex: 1, minWidth: 200 }}>
          Producto
          <input value={infoProducto} placeholder="Nombre del producto…" onChange={(e) => setInfoProducto(e.target.value)} />
        </label>
        <label style={{ width: 110 }}>
          Cantidad
          <input type="number" min="1" step="1" value={infoCantidad} onChange={(e) => setInfoCantidad(e.target.value)} />
        </label>
        <button type="button" className="btn" style={{ flex: 0 }} onClick={agregarInformativa}>
          Agregar
        </button>
      </div>

      <h5 style={{ marginTop: 16, marginBottom: 4 }}>Capturadas ({informativas.length})</h5>
      {informativas.length === 0 ? (
        <p className="muted small">Aún no agregas secciones informativas.</p>
      ) : (
        <ul className="step-list">
          {informativas.map((i) => (
            <li key={i.key}>
              <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
                <span>
                  <span className="badge info">{SECCIONES_INFORMATIVAS.find((s) => s.value === i.seccion)?.label ?? i.seccion}</span>{" "}
                  <strong>{i.producto}</strong>
                </span>
                <span className="row" style={{ flex: 0, gap: 8, alignItems: "center" }}>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={i.cantidad}
                    onChange={(e) => cambiarCantidadInformativa(i.key, e.target.value)}
                    style={{ width: 90 }}
                  />
                  <button
                    type="button"
                    className="btn ghost"
                    style={{ flex: 0 }}
                    onClick={() => setInformativas((prev) => prev.filter((x) => x.key !== i.key))}
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
        <button className="btn primary block" disabled={guardando}>
          {guardando ? "Guardando…" : editandoId !== null ? "Guardar cambios" : "Finalizar reporte"}
        </button>
        <button type="button" className="btn ghost" style={{ flex: 0 }} onClick={onAtras}>
          Atrás
        </button>
        <button type="button" className="btn ghost" style={{ flex: 0 }} onClick={onReiniciar}>
          {editandoId !== null ? "Descartar edición" : "Reiniciar"}
        </button>
      </div>
    </form>
  );
}
