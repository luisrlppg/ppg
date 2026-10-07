"use client";

import Segmented from "@/components/ui/segmented";
import { TURNOS, type TurnoCaptura } from "./comun";

interface Props {
  turno: TurnoCaptura;
  setTurno: (t: TurnoCaptura) => void;
  fecha: string;
  setFecha: (f: string) => void;
  personas: string;
  setPersonas: (p: string) => void;
  editandoId: number | null;
  onComenzar: () => void;
  onDescartar: () => void;
}

export default function PasoSetup({
  turno,
  setTurno,
  fecha,
  setFecha,
  personas,
  setPersonas,
  editandoId,
  onComenzar,
  onDescartar,
}: Props) {
  return (
    <form
      className="card"
      style={{ maxWidth: 620, margin: "0 auto" }}
      onSubmit={(e) => {
        e.preventDefault();
        onComenzar();
      }}
    >
      <h4 style={{ marginTop: 0, textAlign: "center" }}>{editandoId ? "Editar reporte" : "Reporte del día"}</h4>
      <p className="muted small" style={{ textAlign: "center", marginTop: 0 }}>
        {editandoId
          ? "Ajusta el turno, la fecha y las personas, y vuelve a capturar lo necesario."
          : "Elige el turno, la fecha y cuántas personas trabajaron."}
      </p>
      <div className="row" style={{ alignItems: "end", flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <span className="muted small">Turno</span>
          <Segmented value={turno} onChange={(v) => setTurno(v as TurnoCaptura)} options={TURNOS} />
        </div>
        <label style={{ width: 160 }}>
          Fecha
          <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
        </label>
        <label style={{ width: 110 }}>
          Personas
          <input type="number" min="1" value={personas} onChange={(e) => setPersonas(e.target.value)} />
        </label>
      </div>
      <div className="row">
        <button className="btn primary block">Comenzar</button>
        {editandoId !== null && (
          <button type="button" className="btn ghost" style={{ flex: 0 }} onClick={onDescartar}>
            Descartar edición
          </button>
        )}
      </div>
    </form>
  );
}
