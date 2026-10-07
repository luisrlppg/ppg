"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import AppShell from "@/components/app-shell";
import PageHeader from "@/components/ui/page-header";
import HelpNote from "@/components/ui/help-note";
import ConfirmDialog from "@/components/ui/confirm-dialog";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/preferences";
import type { CostoDetalle, CostoPreview, CostoValor, FuenteCostoValor } from "@/lib/types";

const money = (n: number | null | undefined) => `$${Number(n ?? 0).toFixed(2)}`;
const pct = (n: number | null | undefined) =>
  n === null || n === undefined ? "—" : `${n.toFixed(1)}%`;
const num = (s: string) => {
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
};

const FUENTES: { valor: FuenteCostoValor; label: string }[] = [
  { valor: "manual", label: "Manual" },
  { valor: "bom", label: "BOM (componentes)" },
  { valor: "variante", label: "Costo de variante" },
  { valor: "formula", label: "Sub-fórmula" },
];

interface EditValor {
  clave: string;
  etiqueta: string;
  fuente: FuenteCostoValor;
  valor: string;
  tipo: string;
  componenteId: string;
  mermaPct: string;
  variantId: string;
  expresion: string;
}

const valorVacio: EditValor = {
  clave: "",
  etiqueta: "",
  fuente: "manual",
  valor: "",
  tipo: "",
  componenteId: "",
  mermaPct: "",
  variantId: "",
  expresion: "",
};

function aEdit(v: CostoValor): EditValor {
  const o = (v.opciones ?? {}) as Record<string, unknown>;
  return {
    clave: v.clave,
    etiqueta: v.etiqueta,
    fuente: v.fuente,
    valor: v.valor === null || v.valor === undefined ? "" : String(v.valor),
    tipo: typeof o.tipo === "string" ? o.tipo : "",
    componenteId: typeof o.componenteId === "number" ? String(o.componenteId) : "",
    mermaPct: typeof o.mermaPct === "number" ? String(o.mermaPct * 100) : "",
    variantId: typeof o.variantId === "number" ? String(o.variantId) : "",
    expresion: typeof o.expresion === "string" ? o.expresion : "",
  };
}

function serializar(valores: EditValor[]) {
  return valores
    .filter((v) => v.clave.trim() !== "")
    .map((v, i) => {
      const clave = v.clave.trim();
      const base = { clave, etiqueta: v.etiqueta.trim() || clave, fuente: v.fuente, orden: i };
      if (v.fuente === "manual") return { ...base, valor: num(v.valor) };
      if (v.fuente === "bom") {
        const opciones: Record<string, unknown> = {};
        if (v.tipo) opciones.tipo = v.tipo;
        if (v.componenteId) opciones.componenteId = Number(v.componenteId);
        if (num(v.mermaPct) > 0) opciones.mermaPct = num(v.mermaPct) / 100;
        return { ...base, opciones };
      }
      if (v.fuente === "variante") {
        return { ...base, opciones: v.variantId ? { variantId: Number(v.variantId) } : {} };
      }
      return { ...base, opciones: { expresion: v.expresion } };
    });
}

export default function CostoProductoPage() {
  const { user } = useAuth();
  const router = useRouter();
  const params = useParams<{ productId: string }>();
  const productId = Number(params.productId);

  const [detalle, setDetalle] = useState<CostoDetalle | null>(null);
  const [cargando, setCargando] = useState(true);
  const [valores, setValores] = useState<EditValor[]>([]);
  const [formula, setFormula] = useState("");
  const [notas, setNotas] = useState("");
  const [precioBase, setPrecioBase] = useState("");
  const [margenPctInput, setMargenPctInput] = useState("");
  const [preview, setPreview] = useState<CostoPreview | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [eliminarOpen, setEliminarOpen] = useState(false);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const d = await api<CostoDetalle>(`/costos/${productId}`);
      setDetalle(d);
      setValores(d.valores.map(aEdit));
      setFormula(d.formula ?? "");
      setNotas(d.notas ?? "");
      setPrecioBase(d.precioBase ? String(d.precioBase) : "");
      setMargenPctInput(d.margenPct === null ? "" : d.margenPct.toFixed(1));
      setPreview(d);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCargando(false);
    }
  }, [productId]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  // Previsualización en vivo (no persiste).
  useEffect(() => {
    if (!detalle) return;
    const t = setTimeout(() => {
      api<CostoPreview>(`/costos/${productId}/preview`, {
        method: "POST",
        body: JSON.stringify({ formula: formula.trim() || null, valores: serializar(valores) }),
      })
        .then(setPreview)
        .catch((e) => setError((e as Error).message));
    }, 350);
    return () => clearTimeout(t);
  }, [detalle, productId, formula, valores]);

  const costoTotal = preview?.total ?? detalle?.total ?? 0;
  const precio = num(precioBase) > 0 ? num(precioBase) : (preview?.precio ?? 0);
  const margen = precio > 0 ? precio - costoTotal : null;
  const margenPct = precio > 0 ? ((precio - costoTotal) / precio) * 100 : null;

  function setValor(i: number, campo: keyof EditValor, v: string) {
    setValores((prev) => prev.map((x, j) => (j === i ? { ...x, [campo]: v } : x)));
  }
  function agregarValor() {
    setValores((prev) => [...prev, { ...valorVacio }]);
  }
  function quitarValor(i: number) {
    setValores((prev) => prev.filter((_, j) => j !== i));
  }

  function aplicarPrecio(valor: string) {
    setPrecioBase(valor);
    const p = num(valor);
    setMargenPctInput(costoTotal > 0 && p > 0 ? (((p - costoTotal) / p) * 100).toFixed(1) : "");
  }
  function aplicarMargen(valor: string) {
    setMargenPctInput(valor);
    const m = num(valor);
    if (costoTotal > 0 && m >= 0 && m < 100) {
      setPrecioBase((costoTotal / (1 - m / 100)).toFixed(2));
    }
  }

  async function guardar() {
    setGuardando(true);
    setError("");
    try {
      await api(`/costos/${productId}`, {
        method: "PUT",
        body: JSON.stringify({
          formula: formula.trim() || null,
          notas: notas.trim() || null,
          precioBase: num(precioBase),
          valores: serializar(valores),
        }),
      });
      await cargar();
      setMsg("Costo guardado.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGuardando(false);
    }
  }

  async function eliminar() {
    setGuardando(true);
    try {
      await api(`/costos/${productId}`, { method: "DELETE" });
      router.push("/costos");
    } catch (e) {
      setError((e as Error).message);
      setEliminarOpen(false);
    } finally {
      setGuardando(false);
    }
  }

  if (user && user.role !== "admin") {
    return (
      <AppShell>
        <div className="card empty">No tienes permiso para ver esta sección.</div>
      </AppShell>
    );
  }

  const resueltos = new Map((preview?.valores ?? []).map((v) => [v.clave, v]));
  const avisos = [...(preview?.avisos ?? []), ...(detalle?.avisos ?? [])];

  return (
    <AppShell>
      <PageHeader
        breadcrumb={[
          { label: "Costos", href: "/costos" },
          { label: detalle?.nombre ?? "Producto" },
        ]}
        title={detalle?.nombre ?? "Costo"}
        subtitle={detalle ? `${detalle.skuBase} · ${detalle.uom}` : undefined}
        actions={
          <>
            <button className="btn ghost" style={{ flex: 0 }} onClick={() => router.push("/costos")}>
              Volver
            </button>
            <button className="btn primary" style={{ flex: 0 }} disabled={guardando || cargando} onClick={guardar}>
              {guardando ? "Guardando…" : "Guardar"}
            </button>
          </>
        }
      />

      {error && <div className="error">{error}</div>}
      {msg && <div className="msg-ok">{msg}</div>}

      {cargando && !detalle ? (
        <p className="muted">Cargando…</p>
      ) : detalle ? (
        <>
          <HelpNote>
            Cada producto calcula su costo como quieras. Define <strong>valores</strong> y una{" "}
            <strong>fórmula</strong> que los combine. Fuentes: <strong>Manual</strong> (lo capturas),
            <strong> BOM</strong> (suma de componentes), <strong>Costo de variante</strong> y{" "}
            <strong>Sub-fórmula</strong>. El costo es lo que se calcula; el precio se deriva del margen.
          </HelpNote>

          {/* Valores */}
          <h3 style={{ margin: "16px 0 8px", fontSize: "1.05rem" }}>Valores / factores</h3>
          <div className="card" style={{ padding: 0 }}>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ minWidth: 130 }}>Clave</th>
                    <th style={{ minWidth: 150 }}>Etiqueta</th>
                    <th style={{ width: 170 }}>Fuente</th>
                    <th style={{ minWidth: 260 }}>Parámetros</th>
                    <th className="num" style={{ width: 120 }}>Calculado</th>
                    <th style={{ width: 40 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {valores.map((v, i) => {
                    const r = resueltos.get(v.clave.trim());
                    return (
                      <tr key={i}>
                        <td>
                          <input
                            value={v.clave}
                            onChange={(e) => setValor(i, "clave", e.target.value)}
                            placeholder="clave"
                          />
                        </td>
                        <td>
                          <input
                            value={v.etiqueta}
                            onChange={(e) => setValor(i, "etiqueta", e.target.value)}
                            placeholder="Etiqueta"
                          />
                        </td>
                        <td>
                          <select
                            value={v.fuente}
                            onChange={(e) => setValor(i, "fuente", e.target.value)}
                          >
                            {FUENTES.map((f) => (
                              <option key={f.valor} value={f.valor}>
                                {f.label}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          {v.fuente === "manual" && (
                            <input
                              type="number"
                              step="0.01"
                              value={v.valor}
                              onChange={(e) => setValor(i, "valor", e.target.value)}
                              placeholder="0.00"
                            />
                          )}
                          {v.fuente === "bom" && (
                            <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                              <select
                                value={v.tipo}
                                onChange={(e) => setValor(i, "tipo", e.target.value)}
                                style={{ maxWidth: 130 }}
                              >
                                <option value="">Todos</option>
                                <option value="exacto">Exactos</option>
                                <option value="consumible">Consumibles</option>
                              </select>
                              <select
                                value={v.componenteId}
                                onChange={(e) => setValor(i, "componenteId", e.target.value)}
                                style={{ maxWidth: 200 }}
                              >
                                <option value="">Todos los componentes</option>
                                {detalle.componentes.map((c) => (
                                  <option key={c.componentId} value={c.componentId}>
                                    {c.nombre} ({c.skuBase})
                                  </option>
                                ))}
                              </select>
                              <label style={{ maxWidth: 120, margin: 0 }}>
                                Merma (%)
                                <input
                                  type="number"
                                  step="0.1"
                                  min="0"
                                  value={v.mermaPct}
                                  onChange={(e) => setValor(i, "mermaPct", e.target.value)}
                                  placeholder="0"
                                />
                              </label>
                            </div>
                          )}
                          {v.fuente === "variante" && (
                            <select
                              value={v.variantId}
                              onChange={(e) => setValor(i, "variantId", e.target.value)}
                            >
                              <option value="">— Elegir variante —</option>
                              {detalle.variantes.map((vr) => (
                                <option key={vr.variantId} value={vr.variantId}>
                                  {vr.nombre} ({vr.sku})
                                  {vr.costoCompra === null ? " · sin costo" : ` · ${money(vr.costoCompra)}`}
                                </option>
                              ))}
                            </select>
                          )}
                          {v.fuente === "formula" && (
                            <input
                              value={v.expresion}
                              onChange={(e) => setValor(i, "expresion", e.target.value)}
                              placeholder="p. ej. bom * (1 + merma)"
                            />
                          )}
                        </td>
                        <td className="num">
                          {r ? (
                            <span title={r.detalle ?? ""}>
                              {money(r.valorResuelto)}
                              {r.error && <span className="badge critico" style={{ marginLeft: 6 }}>error</span>}
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td>
                          <button
                            type="button"
                            className="btn ghost sm"
                            title="Quitar"
                            onClick={() => quitarValor(i)}
                          >
                            ×
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {valores.length === 0 && (
                    <tr>
                      <td colSpan={6} className="empty">
                        Sin valores. Agrega al menos uno.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div style={{ padding: 8 }}>
              <button type="button" className="btn ghost sm" onClick={agregarValor}>
                + Agregar valor
              </button>
            </div>
          </div>

          {/* Fórmula */}
          <h3 style={{ margin: "16px 0 8px", fontSize: "1.05rem" }}>Fórmula</h3>
          <div className="card">
            <p className="muted small" style={{ marginTop: 0 }}>
              Combina las claves con <code>+ - * / ( )</code> y funciones <code>min max round sum abs</code>.
              Si la dejas vacía, el costo es la suma de los valores. Clic en una clave para insertarla.
            </p>
            <input
              value={formula}
              onChange={(e) => setFormula(e.target.value)}
              placeholder="p. ej. bom * (1 + merma) + mano_obra + maquina"
            />
            <div className="row" style={{ gap: 6, flexWrap: "wrap", marginTop: 8 }}>
              {valores
                .filter((v) => v.clave.trim() !== "")
                .map((v, i) => (
                  <button
                    key={`${v.clave}-${i}`}
                    type="button"
                    className="btn ghost sm"
                    onClick={() => setFormula((f) => (f.trim() ? `${f} ${v.clave.trim()}` : v.clave.trim()))}
                  >
                    {v.clave.trim()}
                  </button>
                ))}
            </div>
          </div>

          {/* Resultado */}
          <h3 style={{ margin: "16px 0 8px", fontSize: "1.05rem" }}>Resultado</h3>
          <div className="card" style={{ background: "var(--surface-2, #f7f7f8)" }}>
            <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
              <span style={{ fontSize: "1.05rem" }}>
                Costo total: <strong>{money(costoTotal)}</strong>
              </span>
              <span>
                Precio: <strong>{precio > 0 ? money(precio) : "—"}</strong> · Utilidad:{" "}
                <strong>{margen === null ? "—" : `${money(margen)} (${pct(margenPct)})`}</strong>
              </span>
            </div>
            {avisos.length > 0 && (
              <ul className="small" style={{ margin: "8px 0 0", color: "var(--danger, #b00)" }}>
                {avisos.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            )}
          </div>

          {/* Precio y utilidad */}
          <h3 style={{ margin: "16px 0 8px", fontSize: "1.05rem" }}>Precio de venta</h3>
          <div className="card">
            <p className="muted small" style={{ marginTop: 0 }}>
              Escribe el <strong>precio base</strong> o el <strong>margen deseado</strong>: el sistema calcula
              el otro. Se guarda en el catálogo (historial de precios).
            </p>
            <div className="grid-2">
              <label>
                Precio base
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={precioBase}
                  onChange={(e) => aplicarPrecio(e.target.value)}
                  placeholder="0.00"
                />
              </label>
              <label>
                Margen deseado (%)
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="99"
                  value={margenPctInput}
                  onChange={(e) => aplicarMargen(e.target.value)}
                  placeholder="—"
                />
              </label>
            </div>
          </div>

          <label style={{ marginTop: 12, display: "block" }}>
            Notas
            <input
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              placeholder="Supuestos, fuente de tarifas…"
            />
          </label>

          <div className="row" style={{ justifyContent: "space-between", marginTop: 16 }}>
            <div>
              {detalle.tieneReceta && (
                <button className="btn ghost danger" disabled={guardando} onClick={() => setEliminarOpen(true)}>
                  Eliminar costo
                </button>
              )}
            </div>
            <button className="btn primary" disabled={guardando} onClick={guardar}>
              {guardando ? "Guardando…" : "Guardar"}
            </button>
          </div>

          {eliminarOpen && (
            <ConfirmDialog
              title="Eliminar costo"
              message={`Se borra la configuración de costo de "${detalle.nombre}". Esta acción no se puede deshacer.`}
              confirmLabel="Eliminar"
              danger
              loading={guardando}
              onConfirm={eliminar}
              onClose={() => setEliminarOpen(false)}
            />
          )}
        </>
      ) : null}
    </AppShell>
  );
}
