"use client";

import { useCallback, useEffect, useState } from "react";
import AppShell from "@/components/app-shell";
import PageHeader from "@/components/ui/page-header";
import HelpNote from "@/components/ui/help-note";
import Modal from "@/components/ui/modal";
import ConfirmDialog from "@/components/ui/confirm-dialog";
import { api } from "@/lib/api";
import { useFormatCantidad } from "@/lib/preferences";
import type { FaltanteCompra, OrdenFabricacion, OrigenOF, VarianteBuscada } from "@/lib/types";

const badgeEstado = (e: string) => (e === "hecha" ? "normal" : e === "en_progreso" ? "bajo" : e === "cancelada" ? "critico" : "");

const ORIGEN_LABEL: Record<OrigenOF, string> = {
  venta: "Venta",
  manual: "Manual",
  reposicion_minimo: "Reposición (mínimo)",
  reposicion_maximo: "Reposición (máximo)",
};

function origenTexto(of: OrdenFabricacion): string {
  if (of.origen === "venta") {
    return `Venta${of.venta ? ` ${of.venta}` : ""}${of.cliente ? ` · ${of.cliente}` : ""}`;
  }
  if (of.origen) return ORIGEN_LABEL[of.origen];
  return of.generatedFrom ? `de ${of.generatedFrom}` : "";
}

export default function FabricacionPage() {
  const formatCantidad = useFormatCantidad();
  const [ofs, setOfs] = useState<OrdenFabricacion[]>([]);
  const [faltantes, setFaltantes] = useState<FaltanteCompra[]>([]);
  const [fEstado, setFEstado] = useState("");
  const [fTipo, setFTipo] = useState("");
  const [fOrigen, setFOrigen] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [selId, setSelId] = useState<number | null>(null);
  const [detalle, setDetalle] = useState<OrdenFabricacion | null>(null);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [cargando, setCargando] = useState(false);
  const [cancelId, setCancelId] = useState<number | null>(null);
  const [concluirId, setConcluirId] = useState<number | null>(null);

  const cargar = useCallback(async () => {
    const [o, f] = await Promise.all([
      api<OrdenFabricacion[]>(
        `/fabricacion?${new URLSearchParams({
          ...(fEstado ? { estado: fEstado } : {}),
          ...(fTipo ? { tipo: fTipo } : {}),
          ...(fOrigen ? { origen: fOrigen } : {}),
          ...(busqueda ? { search: busqueda } : {}),
        })}`,
      ),
      api<FaltanteCompra[]>("/fabricacion/faltantes"),
    ]);
    setOfs(o);
    setFaltantes(f);
  }, [fEstado, fTipo, fOrigen, busqueda]);

  useEffect(() => {
    const t = setTimeout(() => cargar().catch((e) => setError(e.message)), 150);
    return () => clearTimeout(t);
  }, [cargar]);

  const abrirDetalle = useCallback(async (id: number) => {
    try {
      const d = await api<OrdenFabricacion>(`/fabricacion/${id}`);
      setDetalle(d);
      setSelId(id);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    if (selId !== null) abrirDetalle(selId);
  }, [selId, abrirDetalle, cargar]);

  async function iniciar(id: number) {
    setCargando(true);
    setError("");
    try {
      await api(`/fabricacion/${id}/iniciar`, { method: "POST", body: "{}" });
      setMsg("Orden en progreso.");
      cargar();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCargando(false);
    }
  }

  async function cancelar(id: number) {
    setCargando(true);
    setError("");
    try {
      await api(`/fabricacion/${id}/cancelar`, { method: "POST", body: "{}" });
      setMsg("Orden cancelada.");
      setCancelId(null);
      cargar();
    } catch (e) {
      setError((e as Error).message);
      setCancelId(null);
    } finally {
      setCargando(false);
    }
  }

  async function concluir(id: number) {
    setCargando(true);
    setError("");
    try {
      await api(`/fabricacion/${id}/concluir`, { method: "POST", body: "{}" });
      setMsg("Orden concluida.");
      setConcluirId(null);
      cargar();
    } catch (e) {
      setError((e as Error).message);
      setConcluirId(null);
    } finally {
      setCargando(false);
    }
  }

  // ------------------------------------------------------------ Nueva OF
  const [showNueva, setShowNueva] = useState(false);
  const [varSearch, setVarSearch] = useState("");
  const [varResults, setVarResults] = useState<VarianteBuscada[]>([]);
  const [varSel, setVarSel] = useState<VarianteBuscada | null>(null);
  const [nuevaCantidad, setNuevaCantidad] = useState("1");
  const [nuevaNotas, setNuevaNotas] = useState("");
  const [creando, setCreando] = useState(false);

  function abrirNueva() {
    setVarSearch("");
    setVarResults([]);
    setVarSel(null);
    setNuevaCantidad("1");
    setNuevaNotas("");
    setError("");
    setShowNueva(true);
  }

  async function buscarVariantes(q: string) {
    setVarSearch(q);
    if (!q.trim()) {
      setVarResults([]);
      return;
    }
    try {
      setVarResults(await api<VarianteBuscada[]>(`/productos/variantes?search=${encodeURIComponent(q)}`));
    } catch {
      setVarResults([]);
    }
  }

  async function crearManual(e: React.FormEvent) {
    e.preventDefault();
    if (!varSel) {
      setError("Selecciona una variante.");
      return;
    }
    const cantidad = Number(nuevaCantidad);
    if (!(cantidad > 0)) {
      setError("La cantidad debe ser mayor a 0.");
      return;
    }
    setCreando(true);
    setError("");
    try {
      const r = await api<{ creadas: { numero: string }[] }>("/fabricacion", {
        method: "POST",
        body: JSON.stringify({ variantId: varSel.id, cantidad, notas: nuevaNotas.trim() || undefined }),
      });
      setShowNueva(false);
      setMsg(`Se crearon ${r.creadas.length} OF(s): ${r.creadas.map((c) => c.numero).join(", ")}.`);
      cargar();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCreando(false);
    }
  }

  // ------------------------------------------------------------ Reponer
  const [showReponer, setShowReponer] = useState(false);
  const [objetivo, setObjetivo] = useState<"minimo" | "maximo">("minimo");
  const [preview, setPreview] = useState<{ variantes: number; ofs: number } | null>(null);
  const [cargandoPreview, setCargandoPreview] = useState(false);
  const [reponiendo, setReponiendo] = useState(false);

  async function abrirReponer(o: "minimo" | "maximo") {
    setObjetivo(o);
    setPreview(null);
    setError("");
    setShowReponer(true);
    setCargandoPreview(true);
    try {
      setPreview(await api<{ variantes: number; ofs: number }>(`/fabricacion/reponer/preview?objetivo=${o}`));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCargandoPreview(false);
    }
  }

  async function cambiarObjetivo(o: "minimo" | "maximo") {
    setObjetivo(o);
    setPreview(null);
    setCargandoPreview(true);
    try {
      setPreview(await api<{ variantes: number; ofs: number }>(`/fabricacion/reponer/preview?objetivo=${o}`));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCargandoPreview(false);
    }
  }

  async function reponer() {
    setReponiendo(true);
    setError("");
    try {
      const r = await api<{ creadas: number }>("/fabricacion/reponer", {
        method: "POST",
        body: JSON.stringify({ objetivo }),
      });
      setShowReponer(false);
      setMsg(`Reposición completada: ${r.creadas} OF(s) creadas.`);
      cargar();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setReponiendo(false);
    }
  }

  return (
    <AppShell>
      <PageHeader
        title="Fabricación"
        subtitle="Órdenes de fabricación y ensamble. Aquí se ejecutan y cierran."
        actions={
          <>
            <button type="button" className="btn secondary" onClick={() => abrirReponer("minimo")}>
              Reponer
            </button>
            <button type="button" className="btn primary" onClick={abrirNueva}>
              + Nueva OF
            </button>
          </>
        }
      />
      {error && <div className="error">{error}</div>}
      {msg && <div className="msg-ok">{msg}</div>}

      <HelpNote>
        Estados: <strong>confirmada</strong> (lista) → <strong>en progreso</strong> →{" "}
        <strong>hecha</strong> (se cierra al pulsar <strong>Concluir</strong> desde aquí). El tipo (<strong>fabricación</strong> vs{" "}
        <strong>ensamble</strong>) depende del BOM: 1 componente = fabricación, 2+ = ensamble. Puedes crear OFs manualmente o
        reponer hasta el mínimo/máximo.
      </HelpNote>

      <div className="grid-2">
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Órdenes de fabricación</h3>
          {detalle && (
            <div style={{ background: "#fff8e6", border: "1px solid #f5e0a0", borderRadius: 10, padding: "12px 16px", marginBottom: 12 }}>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <strong>
                  {detalle.numero} · {detalle.producto} {detalle.nombre} ({detalle.sku}) × {formatCantidad(detalle.cantidad)}
                </strong>
                <span style={{ flex: 0 }}>
                  <span className={`badge ${detalle.tipo === "ensamble" ? "bajo" : "normal"}`}>{detalle.tipo}</span>{" "}
                  <span className={`badge ${badgeEstado(detalle.estado) || "bajo"}`}>{detalle.estado}</span>
                </span>
              </div>
              {origenTexto(detalle) && <p className="muted small" style={{ margin: "6px 0" }}>Origen: {origenTexto(detalle)}</p>}
              {detalle.notas && <p className="muted small" style={{ margin: "6px 0" }}>Notas: {detalle.notas}</p>}
              <ul className="step-list">
                {detalle.lines?.map((l) => (
                  <li key={l.id}>
                    <strong>{l.producto}</strong> {l.nombre} ({l.sku}) × {formatCantidad(l.cantidadRequerida)} {l.uom}
                    {l.cantidadReservada > 0 ? ` · reservado: ${formatCantidad(l.cantidadReservada)}` : ""}
                  </li>
                ))}
              </ul>
              <div className="row">
                {detalle.estado === "confirmada" && (
                  <button className="btn primary" disabled={cargando} onClick={() => iniciar(detalle.id)}>
                    Iniciar
                  </button>
                )}
                {(detalle.estado === "confirmada" || detalle.estado === "en_progreso") && (
                  <button className="btn primary" disabled={cargando} onClick={() => setConcluirId(detalle.id)}>
                    Concluir
                  </button>
                )}
                {(detalle.estado === "borrador" || detalle.estado === "confirmada" || detalle.estado === "en_progreso") && (
                  <button className="btn ghost" style={{ flex: 0 }} disabled={cargando} onClick={() => setCancelId(detalle.id)}>
                    Cancelar
                  </button>
                )}
                <span className="muted small">
                  Al concluir: un <strong>ensamble</strong> consume sus componentes; una <strong>fabricación</strong> (hoja)
                  da entrada a "Recibo de Producción" para ubicar.
                </span>
              </div>
            </div>
          )}
          <div className="row" style={{ marginBottom: 8 }}>
            <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Nº o producto…" style={{ flex: 2 }} />
            <select value={fTipo} onChange={(e) => setFTipo(e.target.value)} style={{ flex: 1 }}>
              <option value="">Todos los tipos</option>
              <option value="fabricacion">Fabricación</option>
              <option value="ensamble">Ensamble</option>
            </select>
            <select value={fOrigen} onChange={(e) => setFOrigen(e.target.value)} style={{ flex: 1 }}>
              <option value="">Todos los orígenes</option>
              <option value="venta">Venta</option>
              <option value="manual">Manual</option>
              <option value="reposicion_minimo">Reposición (mínimo)</option>
              <option value="reposicion_maximo">Reposición (máximo)</option>
            </select>
            <select value={fEstado} onChange={(e) => setFEstado(e.target.value)} style={{ flex: 1 }}>
              <option value="">Todos los estados</option>
              <option value="confirmada">Confirmada</option>
              <option value="en_progreso">En progreso</option>
              <option value="hecha">Hecha</option>
              <option value="cancelada">Cancelada</option>
            </select>
          </div>
          <ul className="step-list">
            {ofs.map((of) => (
              <li key={of.id} onClick={() => setSelId(of.id)} style={{ cursor: "pointer", background: selId === of.id ? "#fff8e6" : undefined }}>
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <span>
                    <strong>{of.numero}</strong> · {of.producto} {of.nombre} ({of.sku}) × {formatCantidad(of.cantidad)}
                    <div className="small muted">
                      {origenTexto(of) ? `${origenTexto(of)} · ` : ""}
                      {of.componenteVariantes ?? 0} componentes
                    </div>
                  </span>
                  <span style={{ flex: 0 }}>
                    <span className={`badge ${of.tipo === "ensamble" ? "bajo" : "normal"}`}>{of.tipo}</span>{" "}
                    <span className={`badge ${badgeEstado(of.estado) || "bajo"}`}>{of.estado}</span>
                  </span>
                </div>
              </li>
            ))}
            {ofs.length === 0 && <li className="muted">Sin órdenes todavía.</li>}
          </ul>
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0 }}>Pendientes de compra</h3>
          <p className="muted small">Faltantes no fabricables (sin BOM o sin componentes exactos) de las ventas confirmadas.</p>
          {faltantes.length === 0 && <p className="muted">Nada pendiente de compra.</p>}
          <ul className="step-list">
            {faltantes.map((f) => (
              <li key={f.variantId}>
                <strong>{f.producto}</strong> {f.nombre} ({f.sku}) × {formatCantidad(f.cantidad)}
                <div className="small muted">Pedidos: {f.pedidos.join(", ")}</div>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {showNueva && (
        <Modal title="Nueva orden de fabricación" onClose={() => setShowNueva(false)} size="lg">
          <form onSubmit={crearManual}>
            <label>
              Buscar variante
              <input value={varSearch} onChange={(e) => buscarVariantes(e.target.value)} placeholder="Producto, nombre o SKU…" autoFocus />
            </label>
            {varResults.length > 0 && !varSel && (
              <div className="card" style={{ margin: "8px 0", padding: 8 }}>
                {varResults.slice(0, 6).map((v) => (
                  <button key={v.id} type="button" className="btn ghost sm" style={{ margin: 4 }} onClick={() => { setVarSel(v); setVarResults([]); setVarSearch(""); }}>
                    {v.producto} · {v.nombre} ({v.sku})
                  </button>
                ))}
              </div>
            )}
            {varSel && (
              <p className="muted small">
                <strong>{varSel.producto}</strong> · {varSel.nombre} ({varSel.sku}) · Stock: {formatCantidad(varSel.stockActual)} {varSel.uom}
              </p>
            )}
            <div className="row">
              <label>
                Cantidad
                <input type="number" step="0.001" min="0" value={nuevaCantidad} onChange={(e) => setNuevaCantidad(e.target.value)} required />
              </label>
              <label>
                Notas (opcional)
                <input value={nuevaNotas} onChange={(e) => setNuevaNotas(e.target.value)} placeholder="motivo, lote…" />
              </label>
            </div>
            <div className="row" style={{ justifyContent: "flex-end" }}>
              <button type="button" className="btn ghost" onClick={() => setShowNueva(false)}>
                Cancelar
              </button>
              <button className="btn primary" disabled={creando}>
                {creando ? "Creando…" : "Crear OF"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {showReponer && (
        <Modal title="Reponer inventario" onClose={() => setShowReponer(false)}>
          <label>
            Objetivo
            <select value={objetivo} onChange={(e) => cambiarObjetivo(e.target.value as "minimo" | "maximo")}>
              <option value="minimo">Hasta el mínimo</option>
              <option value="maximo">Hasta el máximo</option>
            </select>
          </label>
          {cargandoPreview ? (
            <p className="muted small">Calculando…</p>
          ) : preview ? (
            <p className="muted small">
              {preview.variantes === 0
                ? "Nada por reponer con ese objetivo."
                : `Se evaluarán ${preview.variantes} variante(s) bajo stock y se crearán ~${preview.ofs} OF(s) (incluye componentes en cascada).`}
            </p>
          ) : null}
          <div className="row" style={{ justifyContent: "flex-end" }}>
            <button type="button" className="btn ghost" onClick={() => setShowReponer(false)}>
              Cancelar
            </button>
            <button type="button" className="btn primary" disabled={reponiendo || !preview || preview.ofs === 0} onClick={reponer}>
              {reponiendo ? "Generando…" : "Generar OFs"}
            </button>
          </div>
        </Modal>
      )}

      {cancelId !== null && (
        <ConfirmDialog
          title="Cancelar orden de fabricación"
          message="Esta acción no se puede deshacer."
          confirmLabel="Cancelar orden"
          danger
          loading={cargando}
          onConfirm={() => cancelar(cancelId)}
          onClose={() => setCancelId(null)}
        />
      )}

      {concluirId !== null && (
        <ConfirmDialog
          title="Concluir orden"
          message="Un ensamble consume sus componentes; una fabricación da entrada a 'Recibo de Producción'. La orden quedará como hecha."
          confirmLabel="Concluir"
          loading={cargando}
          onConfirm={() => concluir(concluirId)}
          onClose={() => setConcluirId(null)}
        />
      )}
    </AppShell>
  );
}
