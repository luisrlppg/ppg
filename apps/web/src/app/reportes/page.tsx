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
  EnsartadoCombinacion,
  EnsartadoData,
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

interface EnsartadoForm {
  key: string;
  pincelVariantId: number;
  pincelSku: string;
  pincelNombre: string;
  mangoVariantId: number;
  mango: string;
  colorId: number;
  color: string;
  cantidad: string;
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
  const [fase, setFase] = useState<"setup" | "captura" | "ensartado">("setup");
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

  // ------------------------------------------------------------------ Ensartado
  const [ensartado, setEnsartado] = useState<EnsartadoData | null>(null);
  const [cargandoEnsartado, setCargandoEnsartado] = useState(false);
  const [ensartadoLines, setEnsartadoLines] = useState<EnsartadoForm[]>([]);
  const [mangoId, setMangoId] = useState<number | null>(null);
  const [cerdaColorId, setCerdaColorId] = useState<number | null>(null);
  const [cantidadPincel, setCantidadPincel] = useState("1");

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

  function coloresDeMango(mid: number): { id: number; valor: string }[] {
    if (!ensartado) return [];
    const ids = new Set(ensartado.combinaciones.filter((c) => c.mangoVariantId === mid).map((c) => c.colorId));
    return ensartado.colores.filter((c) => ids.has(c.id));
  }

  function resolverPincel(mid: number, cid: number): EnsartadoCombinacion | null {
    return ensartado?.combinaciones.find((c) => c.mangoVariantId === mid && c.colorId === cid) ?? null;
  }

  async function cargarEnsartado(): Promise<EnsartadoData> {
    if (ensartado) return ensartado;
    const d = await api<EnsartadoData>("/reportes/ensartado");
    setEnsartado(d);
    return d;
  }

  async function continuarEnsartado() {
    setError("");
    setMsg("");
    setCargandoEnsartado(true);
    try {
      await cargarEnsartado();
      setMangoId(null);
      setCerdaColorId(null);
      setCantidadPincel("1");
      setFase("ensartado");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setCargandoEnsartado(false);
    }
  }

  function agregarPincel() {
    if (mangoId === null || cerdaColorId === null) return;
    const pincel = resolverPincel(mangoId, cerdaColorId);
    if (!pincel) {
      setError("No existe un pincel para ese mango y color.");
      return;
    }
    if (!(Number(cantidadPincel) > 0)) {
      setError("Cantidad inválida.");
      return;
    }
    if (ensartadoLines.some((l) => l.mangoVariantId === mangoId && l.colorId === cerdaColorId)) {
      setError("Ese pincel ya está agregado.");
      return;
    }
    const mango = ensartado?.mangos.find((m) => m.variantId === mangoId)?.etiqueta ?? "—";
    const color = ensartado?.colores.find((c) => c.id === cerdaColorId)?.valor ?? "—";
    setEnsartadoLines([
      ...ensartadoLines,
      {
        key: `${pincel.pincelVariantId}-${Date.now()}${Math.random()}`,
        pincelVariantId: pincel.pincelVariantId,
        pincelSku: pincel.sku,
        pincelNombre: pincel.nombre,
        mangoVariantId: mangoId,
        mango,
        colorId: cerdaColorId,
        color,
        cantidad: cantidadPincel,
      },
    ]);
    setError("");
    setMsg("");
    setMangoId(null);
    setCerdaColorId(null);
    setCantidadPincel("1");
  }

  function cambiarCantidadPincel(key: string, valor: string) {
    setEnsartadoLines(ensartadoLines.map((l) => (l.key === key ? { ...l, cantidad: valor } : l)));
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
    setEnsartadoLines([]);
    setMangoId(null);
    setCerdaColorId(null);
    setCantidadPincel("1");
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    const consumo = new Map<number, number>();
    for (const l of ensartadoLines) {
      consumo.set(l.mangoVariantId, (consumo.get(l.mangoVariantId) ?? 0) + Number(l.cantidad));
    }
    const nuevas = [
      ...lines.map((l) => ({ variantId: l.variantId, seccion: l.seccion, tipo: l.tipo, ok: Number(l.cantidad) })),
      ...ensartadoLines.map((l) => ({ variantId: l.pincelVariantId, seccion: "ensartado" as const, tipo: "final" as const, ok: Number(l.cantidad) })),
      ...[...consumo].map(([variantId, ok]) => ({ variantId, seccion: "ensartado" as const, tipo: "consumo" as const, ok })),
    ];
    if (nuevas.length === 0) {
      setError("Agrega al menos un cepillo o pincel.");
      return;
    }
    const dto = {
      turno,
      fecha,
      personas: Number(personas) || 1,
      horasTrabajadas: HORAS_TURNO[turno],
      lines: nuevas,
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

      <div className="row" style={{ marginTop: 8 }}>
        <button type="button" className="btn primary block" disabled={cargandoEnsartado} onClick={continuarEnsartado}>
          {cargandoEnsartado ? "Cargando…" : "Continuar a ensartado"}
        </button>
        <button type="button" className="btn ghost" style={{ flex: 0 }} onClick={limpiarForm}>
          Reiniciar
        </button>
      </div>
    </div>
  );

  const ensartadoForm = (
    <div className="card">
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 4, flexWrap: "wrap" }}>
        <h4 style={{ margin: 0 }}>Paso 2 · Ensartado</h4>
        <span className="muted small">
          {turno === "matutino" ? "Matutino" : "Vespertino"} · {new Date(`${fecha}T12:00:00`).toLocaleDateString("es-MX")} ·{" "}
          {personas} pers.
        </span>
      </div>
      <p className="muted small" style={{ marginTop: 0 }}>
        Elige el mango y el color de cerda para armar cada pincel producido.
      </p>

      <div className="row" style={{ alignItems: "end", flexWrap: "wrap" }}>
        <label style={{ flex: 1, minWidth: 240 }}>
          Mango
          <select
            value={mangoId ?? ""}
            onChange={(e) => {
              setMangoId(e.target.value ? Number(e.target.value) : null);
              setCerdaColorId(null);
            }}
          >
            <option value="">Elige un mango…</option>
            {ensartado?.mangos.map((m) => (
              <option key={m.variantId} value={m.variantId}>
                {m.sku} · {m.etiqueta}
              </option>
            ))}
          </select>
        </label>
        <label style={{ width: 180 }}>
          Color de cerda
          <select
            value={cerdaColorId ?? ""}
            disabled={mangoId === null}
            onChange={(e) => setCerdaColorId(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">Elige el color…</option>
            {mangoId !== null &&
              coloresDeMango(mangoId).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.valor}
                </option>
              ))}
          </select>
        </label>
        <label style={{ width: 110 }}>
          Cantidad
          <input type="number" min="1" step="1" value={cantidadPincel} onChange={(e) => setCantidadPincel(e.target.value)} />
        </label>
        <button
          type="button"
          className="btn primary"
          style={{ flex: 0 }}
          disabled={mangoId === null || cerdaColorId === null}
          onClick={agregarPincel}
        >
          Agregar
        </button>
      </div>

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
                    onClick={() => setEnsartadoLines(ensartadoLines.filter((x) => x.key !== l.key))}
                  >
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
          <button type="button" className="btn ghost" style={{ flex: 0 }} onClick={() => setFase("captura")}>
            Atrás
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

      {tab === "reporte" && (fase === "setup" ? setupForm : fase === "captura" ? capturaForm : ensartadoForm)}
      {tab === "stats" && esGestion && (
        <StatsProduccion onError={(msg) => setError(msg)} />
      )}
    </AppShell>
  );
}
