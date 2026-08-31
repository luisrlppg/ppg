"use client";

import { useCallback, useEffect, useState } from "react";
import AppShell from "@/components/app-shell";
import StatsProduccion from "@/components/reportes/stats-produccion";
import { api } from "@/lib/api";
import type { PublicUser } from "@ppg/shared";
import type {
  LoteUbicar,
  OrdenFabricacion,
  Reporte,
  ReporteDetalle,
  SeccionReporte,
  Turno,
  TipoLineaReporte,
  Ubicacion,
  VarianteBuscada,
} from "@/lib/types";

const TURNOS: { value: Turno; label: string }[] = [
  { value: "matutino", label: "Matutino (8h)" },
  { value: "vespertino", label: "Vespertino (7.5h)" },
  { value: "nocturno", label: "Nocturno (8h)" },
];

const SECCIONES: { value: SeccionReporte; label: string }[] = [
  { value: "maquina1", label: "Máquina 1" },
  { value: "maquina2", label: "Máquina 2" },
  { value: "maquina3", label: "Máquina 3" },
  { value: "ensamble", label: "Ensamble" },
  { value: "ensartado", label: "Ensartado" },
  { value: "pegado", label: "Pegado" },
  { value: "perforado", label: "Perforado" },
];

function hoy(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function turnoPorHora(): Turno {
  const h = new Date().getHours();
  if (h >= 6 && h < 14) return "matutino";
  if (h >= 14 && h < 22) return "vespertino";
  return "nocturno";
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
}

interface UltimoReporte {
  turno: Turno;
  fecha: string;
  personas: number;
  horasTrabajadas?: number;
  notas?: string;
  manufacturingOrderId?: number;
  lines: { variantId: number; sku: string; nombre: string; producto: string; uom: string; seccion: SeccionReporte; tipo: TipoLineaReporte; ok: number }[];
}

type Tab = "reporte" | "bandeja" | "ubicar" | "stats";

export default function ReportesPage() {
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

  const esGestion = user?.role === "admin" || user?.role === "supervisor";

  // ------------------------------------------------------------------ Formulario
  const [turno, setTurno] = useState<Turno>(turnoPorHora);
  const [fecha, setFecha] = useState(hoy);
  const [personas, setPersonas] = useState("1");
  const [horas, setHoras] = useState("");
  const [notas, setNotas] = useState("");
  const [ofId, setOfId] = useState("");
  const [ofs, setOfs] = useState<OrdenFabricacion[]>([]);
  const [lines, setLines] = useState<LineaForm[]>([]);
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [editandoNumero, setEditandoNumero] = useState("");
  const [busqVar, setBusqVar] = useState("");
  const [resultados, setResultados] = useState<VarianteBuscada[]>([]);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    api<OrdenFabricacion[]>("/fabricacion")
      .then((o) => setOfs(o.filter((x) => x.estado === "confirmada" || x.estado === "en_progreso")))
      .catch(() => setOfs([]));
  }, []);

  useEffect(() => {
    if (!busqVar.trim()) {
      setResultados([]);
      return;
    }
    const t = setTimeout(() => {
      api<VarianteBuscada[]>(`/productos/variantes?search=${encodeURIComponent(busqVar)}`)
        .then(setResultados)
        .catch(() => setResultados([]));
    }, 200);
    return () => clearTimeout(t);
  }, [busqVar]);

  const cargarPrefill = useCallback(async (t: Turno) => {
    try {
      const u = await api<UltimoReporte | null>(`/reportes/ultimo?turno=${t}`);
      if (u && u.lines.length) {
        setLines(
          u.lines.map((l) => ({
            key: `${l.variantId}-${l.seccion}-${Date.now()}${Math.random()}`,
            variantId: l.variantId,
            sku: l.sku,
            nombre: l.nombre,
            producto: l.producto,
            uom: l.uom,
            seccion: l.seccion,
            tipo: l.tipo,
            cantidad: String(l.ok),
          })),
        );
        setPersonas(String(u.personas));
        setHoras(u.horasTrabajadas ? String(u.horasTrabajadas) : "");
        setNotas(u.notas ?? "");
        setOfId(u.manufacturingOrderId ? String(u.manufacturingOrderId) : "");
      } else {
        setLines([]);
      }
    } catch {
      setLines([]);
    }
  }, []);

  useEffect(() => {
    if (editandoId === null) cargarPrefill(turno);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turno]);

  function agregarLinea(v: VarianteBuscada) {
    if (lines.some((l) => l.variantId === v.id)) {
      setMsg("Esa variante ya está en el reporte.");
      return;
    }
    setLines([
      ...lines,
      {
        key: `${v.id}-${Date.now()}${Math.random()}`,
        variantId: v.id,
        sku: v.sku,
        nombre: v.nombre,
        producto: v.producto,
        uom: v.uom,
        seccion: "maquina1",
        tipo: v.uom === "metro" ? "consumo" : "final",
        cantidad: "1",
      },
    ]);
    setBusqVar("");
    setResultados([]);
  }

  function cambiarLinea(key: string, campo: string, valor: string | SeccionReporte | TipoLineaReporte) {
    setLines(lines.map((l) => (l.key === key ? { ...l, [campo]: valor } : l)));
  }

  function limpiarForm() {
    setLines([]);
    setPersonas("1");
    setHoras("");
    setNotas("");
    setOfId("");
    setEditandoId(null);
    setEditandoNumero("");
    setFecha(hoy());
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (lines.length === 0) {
      setError("Agrega al menos una línea con conteo.");
      return;
    }
    const dto = {
      turno,
      fecha,
      personas: Number(personas) || 1,
      horasTrabajadas: horas ? Number(horas) : undefined,
      notas: notas || undefined,
      manufacturingOrderId: ofId ? Number(ofId) : undefined,
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

  function iniciarEdicion(d: ReporteDetalle) {
    setTurno(d.turno);
    setFecha(aDate(d.fecha));
    setPersonas(String(d.personas));
    setHoras(d.horasTrabajadas ? String(d.horasTrabajadas) : "");
    setNotas(d.notas ?? "");
    setOfId(d.manufacturingOrder ? String(ofs.find((o) => o.numero === d.manufacturingOrder?.numero)?.id ?? "") : "");
    setLines(
      d.lines.map((l) => ({
        key: `${l.variantId}-${l.seccion}-${l.id}`,
        variantId: l.variantId,
        sku: l.sku,
        nombre: l.nombre,
        producto: l.producto,
        uom: l.uom,
        seccion: l.seccion,
        tipo: l.tipo,
        cantidad: String(Number(l.ok)),
      })),
    );
    setEditandoId(d.id);
    setEditandoNumero(d.numero);
    setError("");
    setMsg("");
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

  // ------------------------------------------------------------------ Ubicar
  const [lotes, setLotes] = useState<LoteUbicar[]>([]);
  const [ubicaciones, setUbicaciones] = useState<Ubicacion[]>([]);
  const [asig, setAsig] = useState<Record<number, { locationId: string; cantidad: string }>>({});

  const cargarLotes = useCallback(async () => {
    try {
      setLotes(await api<LoteUbicar[]>("/reportes/lotes"));
      if (ubicaciones.length === 0) {
        const u = (await api<Ubicacion[]>("/inventario/ubicaciones")).filter((x) => x.tipo === "almacen");
        setUbicaciones(u);
      }
    } catch (err) {
      setError((err as Error).message);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (tab === "ubicar") cargarLotes();
  }, [tab, cargarLotes]);

  function setAsigLote(lineaId: number, campo: "locationId" | "cantidad", valor: string) {
    setAsig((a) => ({ ...a, [lineaId]: { locationId: a[lineaId]?.locationId ?? "", cantidad: a[lineaId]?.cantidad ?? "", [campo]: valor } }));
  }

  async function ubicarLote(l: LoteUbicar) {
    const a = asig[l.lineaId];
    if (!a?.locationId) {
      setError("Elige un compartimento para el lote.");
      return;
    }
    const cantidad = Number(a.cantidad || l.pendiente);
    if (!(cantidad > 0)) {
      setError("Cantidad inválida.");
      return;
    }
    setCargando(true);
    setError("");
    try {
      await api(`/reportes/lotes/${l.lineaId}/ubicar`, {
        method: "POST",
        body: JSON.stringify({ cantidad, locationId: Number(a.locationId) }),
      });
      setMsg(`Lote de ${l.producto} ${l.nombre} ubicado.`);
      setAsig((s) => {
        const { [l.lineaId]: _omit, ...rest } = s;
        return rest;
      });
      cargarLotes();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setCargando(false);
    }
  }

  // ------------------------------------------------------------------ UI
  const submitForm = (
    <form onSubmit={guardar} className="card">
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 4 }}>
        <h4 style={{ margin: 0 }}>
          {editandoId ? `Editando ${editandoNumero} (pendiente)` : "Reporte del día"}
        </h4>
        {editandoId && (
          <button type="button" className="btn ghost" style={{ flex: 0 }} onClick={limpiarForm}>
            Cancelar edición
          </button>
        )}
      </div>
      <div className="row" style={{ alignItems: "end", flexWrap: "wrap" }}>
        <div>
          <span className="muted small">Turno</span>
          <div className="row" style={{ gap: 6 }}>
            {TURNOS.map((t) => (
              <button
                key={t.value}
                type="button"
                className="btn"
                style={turno === t.value ? { background: "#1a3a8a", color: "#fff", borderColor: "#1a3a8a" } : undefined}
                onClick={() => setTurno(t.value)}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
        <label>
          Fecha
          <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
        </label>
        <label style={{ width: 90 }}>
          Personas
          <input type="number" min="1" value={personas} onChange={(e) => setPersonas(e.target.value)} />
        </label>
        <label style={{ width: 130 }}>
          Horas trabajadas <span className="muted small">(opcional)</span>
          <input type="number" step="0.5" min="0.1" value={horas} onChange={(e) => setHoras(e.target.value)} placeholder={turno === "vespertino" ? "7.5" : "8"} />
        </label>
        <label style={{ flex: 1.4 }}>
          Orden de fabricación (opcional)
          <select value={ofId} onChange={(e) => setOfId(e.target.value)}>
            <option value="">— Sin OF —</option>
            {ofs.map((o) => (
              <option key={o.id} value={o.id}>
                {o.numero} · {o.producto} {o.nombre} × {o.cantidad}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label>
        Notas
        <input value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="opcional" />
      </label>

      <h5 style={{ marginBottom: 4 }}>Producción del turno</h5>
      <label>
        Buscar producto o variante…
        <input value={busqVar} onChange={(e) => setBusqVar(e.target.value)} placeholder="ej. pincel, cerda, vástago…" />
      </label>
      {resultados.length > 0 && (
        <div className="card" style={{ padding: 8, margin: "4px 0 12px" }}>
          {resultados.map((r) => (
            <button
              key={r.id}
              type="button"
              className="row"
              style={{ width: "100%", textAlign: "left", marginBottom: 2, background: "#fff", border: "1px solid #eee", borderRadius: 8, padding: "8px 12px" }}
              onClick={() => agregarLinea(r)}
            >
              <span>
                <strong>{r.producto}</strong> — {r.nombre}
                <span className="muted small"> ({r.sku}) · uom {r.uom}</span>
              </span>
            </button>
          ))}
        </div>
      )}

      {lines.map((l) => (
        <div
          key={l.key}
          className="row"
          style={{ background: "#fafafa", padding: "8px 12px", borderRadius: 8, marginBottom: 6, flexWrap: "wrap", alignItems: "end" }}
        >
          <span style={{ flex: 2 }}>
            <strong>{l.producto}</strong> — {l.nombre} <span className="muted small">({l.sku})</span>
          </span>
          <label style={{ flex: 1.1 }}>
            Sección
            <select value={l.seccion} onChange={(e) => cambiarLinea(l.key, "seccion", e.target.value as SeccionReporte)}>
              {SECCIONES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <div style={{ width: 110 }}>
            <span className="muted small">Tipo</span>
            <div className="row" style={{ gap: 4 }}>
              <button
                type="button"
                className="btn"
                style={l.tipo === "final" ? { background: "#1a3a8a", color: "#fff", borderColor: "#1a3a8a", padding: "4px 8px", fontSize: "0.85rem" } : { padding: "4px 8px", fontSize: "0.85rem" }}
                onClick={() => cambiarLinea(l.key, "tipo", "final")}
              >
                Final
              </button>
              <button
                type="button"
                className="btn"
                style={l.tipo === "consumo" ? { background: "#8a1a1a", color: "#fff", borderColor: "#8a1a1a", padding: "4px 8px", fontSize: "0.85rem" } : { padding: "4px 8px", fontSize: "0.85rem" }}
                onClick={() => cambiarLinea(l.key, "tipo", "consumo")}
              >
                Consumo
              </button>
            </div>
          </div>
          <label style={{ width: 90 }}>
            Cantidad
            <input type="number" step="0.001" min="0.001" value={l.cantidad} onChange={(e) => cambiarLinea(l.key, "cantidad", e.target.value)} />
          </label>
          <button type="button" className="btn ghost" style={{ flex: 0 }} onClick={() => setLines(lines.filter((x) => x.key !== l.key))}>
            Quitar
          </button>
        </div>
      ))}
      {lines.length === 0 && <p className="muted">Busca y agrega las variantes fabricadas o consumidas.</p>}

      <div className="row" style={{ alignItems: "end" }}>
        <button className="btn primary block" disabled={guardando}>
          {guardando ? "Guardando…" : editandoId ? "Guardar cambios" : "Guardar reporte"}
        </button>
        <button type="button" className="btn ghost" style={{ flex: 0 }} onClick={limpiarForm}>
          Empezar en blanco
        </button>
      </div>
    </form>
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
                  {r.manufacturingOrder ? ` · OF ${r.manufacturingOrder}` : ""}
                  <div className="small muted">
                    {r.lineas} líneas · final {r.totalFinal} {r.totalConsumo > 0 ? ` · consumo ${r.totalConsumo}` : ""}
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
            {detalle.manufacturingOrder && <p className="muted small" style={{ margin: "4px 0" }}>OF: {detalle.manufacturingOrder.numero} ({detalle.manufacturingOrder.estado})</p>}
            {detalle.notas && <p className="muted small" style={{ margin: "4px 0" }}>Notas: {detalle.notas}</p>}
            <ul className="step-list">
              {detalle.lines.map((l) => (
                <li key={l.id}>
                  <span className={`badge ${l.tipo === "final" ? "normal" : "critico"}`}>{l.tipo}</span>{" "}
                  <strong>{l.producto}</strong> {l.nombre} ({l.sku}) × {Number(l.ok)} {l.uom}
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
                  <strong>{l.producto}</strong> {l.nombre} ({l.sku}) × {Number(l.ok)} {l.uom}
                  {l.tipo === "final" && l.pendienteUbicar > 0 && (
                    <div className="small muted">aplicado {Number(l.qtyAplicada)} · por ubicar {Number(l.pendienteUbicar)}</div>
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

  const contentUbicar = (
    <div className="card">
      <h4 style={{ marginTop: 0 }}>Ubicar lotes del Recibo de Producción</h4>
      <p className="muted small">
        La encargada asigna a qué compartimento va cada lote. La cantidad ya viene prellenada: no se vuelve a tipear.
      </p>
      {lotes.length === 0 && <p className="muted">Nada por ubicar. Los productos terminados de reportes aceptados llegan aquí.</p>}
      <ul className="step-list">
        {lotes.map((l) => {
          const a = asig[l.lineaId];
          return (
            <li key={l.lineaId} style={{ background: "#fafafa", borderRadius: 8, padding: "8px 12px" }}>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <span>
                  <strong>{l.producto}</strong> {l.nombre} ({l.sku}) · {l.pendiente} {l.uom}
                  <div className="small muted">del reporte {l.reporte}</div>
                </span>
              </div>
              <div className="row" style={{ alignItems: "end", marginTop: 6 }}>
                <label style={{ flex: 1.4 }}>
                  Compartimento
                  <select value={a?.locationId ?? ""} onChange={(e) => setAsigLote(l.lineaId, "locationId", e.target.value)}>
                    <option value="">— Elegir —</option>
                    {ubicaciones.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.nombre}
                      </option>
                    ))}
                  </select>
                </label>
                <label style={{ width: 110 }}>
                  Cantidad
                  <input type="number" step="0.001" min="0.001" max={l.pendiente} value={a?.cantidad ?? String(l.pendiente)} onChange={(e) => setAsigLote(l.lineaId, "cantidad", e.target.value)} />
                </label>
                <button className="btn primary" style={{ flex: 0 }} disabled={cargando} onClick={() => ubicarLote(l)}>
                  Ubicar
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );

  return (
    <AppShell>
      <h2>Reportes de producción</h2>
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
            <button className={`btn ${tab === "ubicar" ? "primary" : "ghost"}`} onClick={() => { setTab("ubicar"); setError(""); setMsg(""); }}>
              Ubicar
            </button>
            <button className={`btn ${tab === "stats" ? "primary" : "ghost"}`} onClick={() => { setTab("stats"); setError(""); setMsg(""); }}>
              Estadísticas
            </button>
          </>
        )}
      </div>

      {tab === "reporte" && submitForm}
      {tab === "bandeja" && esGestion && contentBandeja}
      {tab === "ubicar" && esGestion && contentUbicar}
      {tab === "stats" && esGestion && (
        <StatsProduccion onError={(msg) => setError(msg)} />
      )}
    </AppShell>
  );
}