"use client";

import { useCallback, useEffect, useState } from "react";
import AppShell from "@/components/app-shell";
import PageHeader from "@/components/ui/page-header";
import Segmented from "@/components/ui/segmented";
import StatsProduccion from "@/components/reportes/stats-produccion";
import { api } from "@/lib/api";
import { refrescarPorUbicar } from "@/lib/por-ubicar";
import { useFormatCantidad } from "@/lib/preferences";
import type { PublicUser } from "@ppg/shared";
import type {
  CepillosNylonGrid,
  Reporte,
  ReporteDetalle,
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

function aDate(s: string): string {
  const d = new Date(s);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function badgeEstado(e: string) {
  return e === "aplicado" ? "normal" : e === "pendiente" ? "bajo" : "critico";
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

type Tab = "reporte" | "bandeja" | "stats";

export default function ReportesPage() {
  const formatCantidad = useFormatCantidad();
  const [user, setUser] = useState<PublicUser | null>(null);
  const [tab, setTab] = useState<Tab>("bandeja");
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    api<{ user: PublicUser }>("/auth/me")
      .then((d) => {
        setUser(d.user);
        if (d.user.role === "operador") setTab("reporte");
      })
      .catch(() => setUser(null));
  }, []);

  const esGestion = user?.role === "admin";

  // ------------------------------------------------------------------ Formulario
  const [fase, setFase] = useState<"setup" | "captura">("setup");
  const [turno, setTurno] = useState<TurnoCaptura>(turnoPorHora);
  const [fecha, setFecha] = useState(hoy);
  const [personas, setPersonas] = useState("1");
  const [lines, setLines] = useState<LineaForm[]>([]);
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [editandoNumero, setEditandoNumero] = useState("");
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
    setEditandoId(null);
    setEditandoNumero("");
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
      if (editandoId) {
        await api(`/reportes/${editandoId}`, { method: "PATCH", body: JSON.stringify(dto) });
        setMsg(`Reporte ${editandoNumero} actualizado. Queda pendiente de aceptación.`);
      } else {
        await api("/reportes", { method: "POST", body: JSON.stringify(dto) });
        setMsg("Reporte guardado. Queda en la bandeja de pendientes a la espera de aceptación.");
        limpiarForm();
      }
      cargarBandeja();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setGuardando(false);
    }
  }

  // ------------------------------------------------------------------ Bandeja
  const [bandeja, setBandeja] = useState<Reporte[]>([]);
  const [fEstadoB, setFEstadoB] = useState("pendiente");
  const [detalle, setDetalle] = useState<ReporteDetalle | null>(null);
  const [selId, setSelId] = useState<number | null>(null);

  const cargarBandeja = useCallback(async () => {
    try {
      setBandeja(await api<Reporte[]>(`/reportes?${new URLSearchParams(fEstadoB ? { estado: fEstadoB } : {})}`));
    } catch (err) {
      setError((err as Error).message);
    }
  }, [fEstadoB]);

  useEffect(() => {
    if (tab === "bandeja") cargarBandeja();
  }, [tab, cargarBandeja]);

  useEffect(() => {
    if (selId === null) {
      setDetalle(null);
      return;
    }
    api<ReporteDetalle>(`/reportes/${selId}`).then(setDetalle).catch((err) => setError((err as Error).message));
  }, [selId, cargarBandeja, tab]);

  async function iniciarEdicion(d: ReporteDetalle) {
    let g = grid;
    try {
      g = await cargarGrid();
    } catch {
      g = null;
    }
    const idxShape = g ? g.ejes.findIndex((e) => /forma/i.test(e.nombre)) : -1;
    const idxColor = g ? g.ejes.findIndex((e) => /color/i.test(e.nombre)) : -1;
    const mapeadas: LineaForm[] = [];
    const otras: LineaForm[] = [];
    for (const l of d.lines) {
      const base = {
        key: `${l.variantId}-${l.seccion}-${l.id}`,
        variantId: l.variantId,
        sku: l.sku,
        nombre: l.nombre,
        producto: l.producto,
        uom: l.uom,
        seccion: l.seccion,
        tipo: l.tipo,
        cantidad: String(Number(l.ok)),
      };
      const ex = g?.existentes.find((v) => v.varianteId === l.variantId);
      if (g && ex && idxShape >= 0 && idxColor >= 0) {
        const fid = ex.valueIds[idxShape];
        const cid = ex.valueIds[idxColor];
        mapeadas.push({
          ...base,
          forma: g.ejes[idxShape].valores.find((x) => x.id === fid)?.valor ?? "—",
          color: g.ejes[idxColor].valores.find((x) => x.id === cid)?.valor ?? "—",
        });
      } else {
        otras.push({ ...base, forma: "—", color: "—" });
      }
    }
    setTurno(d.turno === "vespertino" ? "vespertino" : "matutino");
    setFecha(aDate(d.fecha));
    setPersonas(String(d.personas));
    setLines([...mapeadas, ...otras]);
    setEditandoId(d.id);
    setEditandoNumero(d.numero);
    setError("");
    setMsg("");
    setFase("captura");
    setTab("reporte");
  }

  async function aceptar(id: number) {
    if (!window.confirm("¿Aceptar este reporte? Se aplicará: los productos terminados entran a 'Recibo de Producción' y los consumos restan de su stock.")) return;
    setCargando(true);
    setError("");
    try {
      const res = await api<{ ok: boolean; canales: string[] }>(`/reportes/${id}/aplicar`, { method: "POST", body: "{}" });
      setMsg(`Reporte aceptado y aplicado al inventario${res.canales.length ? " · notificado: " + res.canales.join(", ") : "."}`);
      cargarBandeja();
      refrescarPorUbicar();
      if (selId !== null) {
        const d = await api<ReporteDetalle>(`/reportes/${selId}`);
        setDetalle(d);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setCargando(false);
    }
  }

  async function cancelar(id: number) {
    if (!window.confirm("¿Cancelar este reporte pendiente?")) return;
    setCargando(true);
    setError("");
    try {
      await api(`/reportes/${id}/cancelar`, { method: "POST", body: "{}" });
      setMsg("Reporte cancelado.");
      cargarBandeja();
      setSelId(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setCargando(false);
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
      {editandoId && (
        <button type="button" className="btn ghost block" onClick={limpiarForm}>
          Cancelar edición
        </button>
      )}
    </form>
  );

  const capturaForm = (
    <div className="card">
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 4, flexWrap: "wrap" }}>
        <h4 style={{ margin: 0 }}>
          {editandoId ? `Editando ${editandoNumero} (pendiente)` : "Paso 1 · Producción de cepillos de Nylon"}
        </h4>
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
            {guardando ? "Guardando…" : editandoId ? "Guardar cambios" : "Finalizar reporte"}
          </button>
          <button type="button" className="btn ghost" style={{ flex: 0 }} onClick={limpiarForm}>
            Reiniciar
          </button>
        </div>
      </form>
    </div>
  );

  const contentBandeja = (
    <div className="grid-2">
      <div className="card">
        <h4 style={{ marginTop: 0 }}>Bandeja de pendientes</h4>
        <div className="row" style={{ marginBottom: 8 }}>
          <select value={fEstadoB} onChange={(e) => { setFEstadoB(e.target.value); setSelId(null); }}>
            <option value="pendiente">Pendientes</option>
            <option value="">Todos los estados</option>
            <option value="aplicado">Aplicados</option>
            <option value="cancelado">Cancelados</option>
          </select>
          <button className="btn ghost" style={{ flex: 0 }} onClick={cargarBandeja}>
            Actualizar
          </button>
        </div>
        <ul className="step-list">
          {bandeja.map((r) => (
            <li key={r.id} onClick={() => setSelId(r.id === selId ? null : r.id)} style={{ cursor: "pointer", background: selId === r.id ? "#fff8e6" : undefined }}>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <span>
                  <strong>{r.numero}</strong> · {new Date(r.fecha).toLocaleDateString("es-MX")} · {r.turno}
                  {r.personas > 1 ? ` · ${r.personas} pers.` : ""}
                  <div className="small muted">
                    {r.lineas} líneas · final {formatCantidad(r.totalFinal)} {r.totalConsumo > 0 ? ` · consumo ${formatCantidad(r.totalConsumo)}` : ""}
                  </div>
                </span>
                <span style={{ flex: 0 }}>
                  <span className={`badge ${badgeEstado(r.estado)}`}>{r.estado}</span>
                </span>
              </div>
            </li>
          ))}
          {bandeja.length === 0 && <li className="muted">Sin reportes {fEstadoB ? `(${fEstadoB})` : ""}.</li>}
        </ul>
      </div>

      <div className="card">
        {detalle && detalle.estado === "pendiente" ? (
          <>
            <div className="row" style={{ justifyContent: "space-between", marginTop: 0 }}>
              <h4 style={{ margin: 0 }}>
                {detalle.numero}
                <span className={`badge ${badgeEstado(detalle.estado)}`}>{detalle.estado}</span>
              </h4>
              <span className="muted small">
                {new Date(detalle.fecha).toLocaleDateString("es-MX")} · {detalle.turno} · {detalle.personas} pers.
                {detalle.horasTrabajadas ? ` · ${detalle.horasTrabajadas}h` : ""}
              </span>
            </div>
            {detalle.notas && <p className="muted small" style={{ margin: "4px 0" }}>Notas: {detalle.notas}</p>}
            <ul className="step-list">
              {detalle.lines.map((l) => (
                <li key={l.id}>
                  <span className={`badge ${l.tipo === "final" ? "normal" : "critico"}`}>{l.tipo}</span>{" "}
                  <strong>{l.producto}</strong> {l.nombre} ({l.sku}) × {formatCantidad(Number(l.ok))} {l.uom}
                  <div className="small muted">Sección: {l.seccion}</div>
                </li>
              ))}
            </ul>
            <div className="row">
              <button className="btn primary" disabled={cargando} onClick={() => aceptar(detalle.id)}>
                Aceptar y aplicar al inventario
              </button>
              <button className="btn ghost" style={{ flex: 0 }} disabled={cargando} onClick={() => iniciarEdicion(detalle)}>
                Modificar
              </button>
              <button className="btn ghost" style={{ flex: 0 }} disabled={cargando} onClick={() => cancelar(detalle.id)}>
                Cancelar reporte
              </button>
            </div>
          </>
        ) : detalle ? (
          <>
            <h4 style={{ marginTop: 0 }}>
              {detalle.numero} <span className={`badge ${badgeEstado(detalle.estado)}`}>{detalle.estado}</span>
            </h4>
            <p className="muted small">
              {new Date(detalle.fecha).toLocaleDateString("es-MX")} · {detalle.turno} · {detalle.personas} pers.
              {detalle.aplicadoAt ? ` · aplicado ${new Date(detalle.aplicadoAt).toLocaleString("es-MX")}` : ""}
            </p>
            <ul className="step-list">
              {detalle.lines.map((l) => (
                <li key={l.id}>
                  <span className={`badge ${l.tipo === "final" ? "normal" : "critico"}`}>{l.tipo}</span>{" "}
                  <strong>{l.producto}</strong> {l.nombre} ({l.sku}) × {formatCantidad(Number(l.ok))} {l.uom}
                  {l.tipo === "final" && l.pendienteUbicar > 0 && (
                    <div className="small muted">aplicado {formatCantidad(Number(l.qtyAplicada))} · por ubicar {formatCantidad(Number(l.pendienteUbicar))}</div>
                  )}
                </li>
              ))}
            </ul>
            <p className="muted small">
              Un reporte aplicado no se edita. Si hay un error, corrige con un ajuste de stock con referencia (Inventario).
            </p>
          </>
        ) : (
          <p className="muted">Selecciona un reporte para revisarlo.</p>
        )}
      </div>
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
          <>
            <button
              className={`btn ${tab === "bandeja" ? "primary" : "ghost"}`}
              onClick={() => { setTab("bandeja"); setError(""); setMsg(""); }}
            >
              Bandeja {bandeja.filter((r) => r.estado === "pendiente").length > 0 && `(${bandeja.filter((r) => r.estado === "pendiente").length})`}
            </button>
            <button className={`btn ${tab === "stats" ? "primary" : "ghost"}`} onClick={() => { setTab("stats"); setError(""); setMsg(""); }}>
              Estadísticas
            </button>
          </>
        )}
      </div>

      {tab === "reporte" && (fase === "setup" ? setupForm : capturaForm)}
      {tab === "bandeja" && esGestion && contentBandeja}
      {tab === "stats" && esGestion && (
        <StatsProduccion onError={(msg) => setError(msg)} />
      )}
    </AppShell>
  );
}
