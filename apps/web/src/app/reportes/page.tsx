"use client";

import { useEffect, useState } from "react";
import AppShell from "@/components/app-shell";
import PageHeader from "@/components/ui/page-header";
import Segmented from "@/components/ui/segmented";
import StatsProduccion from "@/components/reportes/stats-produccion";
import { api } from "@/lib/api";
import type { PublicUser } from "@ppg/shared";
import type {
  CepillosNylonGrid,
  SeccionReporte,
  TipoLineaReporte,
  Turno,
} from "@/lib/types";

type TurnoCaptura = Extract<Turno, "matutino" | "vespertino">;
type Maquina = Extract<SeccionReporte, "maquina1" | "maquina2" | "maquina3">;

const TURNOS: { value: TurnoCaptura; label: string }[] = [
  { value: "matutino", label: "Matutino" },
  { value: "vespertino", label: "Vespertino" },
];

const HORAS_TURNO: Record<TurnoCaptura, number> = {
  matutino: 8,
  vespertino: 7.5,
};

const MAQUINAS: { value: Maquina; label: string }[] = [
  { value: "maquina1", label: "Máquina 1" },
  { value: "maquina2", label: "Máquina 2" },
  { value: "maquina3", label: "Máquina 3" },
];

function hoy(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function turnoPorHora(): TurnoCaptura {
  return new Date().getHours() < 14 ? "matutino" : "vespertino";
}

interface LineaForm {
  key: string;
  variantId: number;
  sku: string;
  nombre: string;
  producto: string;
  uom: string;
  seccion: SeccionReporte;
  tipo: TipoLineaReporte;
  cantidad: string;
  forma: string;
  color: string;
}

type Tab = "reporte" | "stats";

export default function ReportesPage() {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [tab, setTab] = useState<Tab>("reporte");
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    api<{ user: PublicUser }>("/auth/me")
      .then((d) => setUser(d.user))
      .catch(() => setUser(null));
  }, []);

  const esGestion = user?.role === "admin";

  // ------------------------------------------------------------------ Formulario
  const [fase, setFase] = useState<"setup" | "captura">("setup");
  const [turno, setTurno] = useState<TurnoCaptura>(turnoPorHora);
  const [fecha, setFecha] = useState(hoy);
  const [personas, setPersonas] = useState("1");
  const [lines, setLines] = useState<LineaForm[]>([]);
  const [guardando, setGuardando] = useState(false);

  // ------------------------------------------------------------------ Wizard
  const [grid, setGrid] = useState<CepillosNylonGrid | null>(null);
  const [cargandoGrid, setCargandoGrid] = useState(false);
  const [maquina, setMaquina] = useState<Maquina | null>(null);
  const [formaId, setFormaId] = useState<number | null>(null);
  const [colorId, setColorId] = useState<number | null>(null);
  const [cantidad, setCantidad] = useState("1");

  const ejes = grid?.ejes ?? [];
  const shapeIdx = ejes.findIndex((e) => /forma/i.test(e.nombre));
  const colorIdx = ejes.findIndex((e) => /color/i.test(e.nombre));
  const shapeEje = shapeIdx >= 0 ? ejes[shapeIdx] : null;
  const colorEje = colorIdx >= 0 ? ejes[colorIdx] : null;

  function coloresDeForma(fid: number): { id: number; valor: string }[] {
    if (!grid || !colorEje) return [];
    const ids = new Set(
      grid.existentes.filter((v) => v.valueIds[shapeIdx] === fid).map((v) => v.valueIds[colorIdx]),
    );
    return colorEje.valores.filter((c) => ids.has(c.id));
  }

  function resolverVariante(fid: number, cid: number) {
    return grid?.existentes.find((v) => v.valueIds[shapeIdx] === fid && v.valueIds[colorIdx] === cid) ?? null;
  }

  async function cargarGrid(): Promise<CepillosNylonGrid> {
    if (grid) return grid;
    const g = await api<CepillosNylonGrid>("/reportes/cepillos-nylon");
    setGrid(g);
    return g;
  }

  async function comenzar() {
    if (!(Number(personas) >= 1)) {
      setError("Indica al menos 1 persona.");
      return;
    }
    setError("");
    setMsg("");
    setCargandoGrid(true);
    try {
      await cargarGrid();
      setMaquina(null);
      setFormaId(null);
      setColorId(null);
      setCantidad("1");
      setFase("captura");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setCargandoGrid(false);
    }
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
    setLines([
      ...lines,
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
    setLines(lines.map((l) => (l.key === key ? { ...l, cantidad: valor } : l)));
  }

  function limpiarForm() {
    setFase("setup");
    setLines([]);
    setPersonas("1");
    setFecha(hoy());
    setMaquina(null);
    setFormaId(null);
    setColorId(null);
    setCantidad("1");
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (lines.length === 0) {
      setError("Agrega al menos un cepillo.");
      return;
    }
    const dto = {
      turno,
      fecha,
      personas: Number(personas) || 1,
      horasTrabajadas: HORAS_TURNO[turno],
      lines: lines.map((l) => ({ variantId: l.variantId, seccion: l.seccion, tipo: l.tipo, ok: Number(l.cantidad) })),
    };
    setGuardando(true);
    setError("");
    setMsg("");
    try {
      await api("/reportes", { method: "POST", body: JSON.stringify(dto) });
      setMsg("Reporte guardado.");
      limpiarForm();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setGuardando(false);
    }
  }

  // ------------------------------------------------------------------ UI
  const setupForm = (
    <form
      className="card"
      style={{ maxWidth: 620, margin: "0 auto" }}
      onSubmit={(e) => {
        e.preventDefault();
        comenzar();
      }}
    >
      <h4 style={{ marginTop: 0, textAlign: "center" }}>Reporte del día</h4>
      <p className="muted small" style={{ textAlign: "center", marginTop: 0 }}>
        Elige el turno, la fecha y cuántas personas trabajaron.
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
      <button className="btn primary block" disabled={cargandoGrid}>
        {cargandoGrid ? "Cargando…" : "Comenzar"}
      </button>
    </form>
  );

  const capturaForm = (
    <div className="card">
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 4, flexWrap: "wrap" }}>
        <h4 style={{ margin: 0 }}>Paso 1 · Producción de cepillos de Nylon</h4>
        <span className="muted small">
          {turno === "matutino" ? "Matutino" : "Vespertino"} · {new Date(`${fecha}T12:00:00`).toLocaleDateString("es-MX")} ·{" "}
          {personas} pers.
        </span>
      </div>

      {maquina === null ? (
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
                  <button type="button" className="btn ghost" style={{ flex: 0 }} onClick={() => setLines(lines.filter((x) => x.key !== l.key))}>
                    Quitar
                  </button>
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={guardar}>
        <div className="row" style={{ marginTop: 8 }}>
          <button className="btn primary block" disabled={guardando}>
            {guardando ? "Guardando…" : "Finalizar reporte"}
          </button>
          <button type="button" className="btn ghost" style={{ flex: 0 }} onClick={limpiarForm}>
            Reiniciar
          </button>
        </div>
      </form>
    </div>
  );

  return (
    <AppShell>
      <PageHeader
        title="Reportes de producción"
        subtitle="Captura de reportes por turno; al aplicar, los productos terminados entran a inventario."
      />
      {error && <div className="error">{error}</div>}
      {msg && <div className="msg-ok">{msg}</div>}

      <div className="subnav">
        <button className={`btn ${tab === "reporte" ? "primary" : "ghost"}`} onClick={() => { setTab("reporte"); setError(""); setMsg(""); }}>
          Reporte del día
        </button>
        {esGestion && (
          <button className={`btn ${tab === "stats" ? "primary" : "ghost"}`} onClick={() => { setTab("stats"); setError(""); setMsg(""); }}>
            Estadísticas
          </button>
        )}
      </div>

      {tab === "reporte" && (fase === "setup" ? setupForm : capturaForm)}
      {tab === "stats" && esGestion && (
        <StatsProduccion onError={(msg) => setError(msg)} />
      )}
    </AppShell>
  );
}
