"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Partner, VarianteBuscada, Passo, PassoOption, ConfiguracionLinea } from "@/lib/types";

interface LineaForm {
  variantId: number;
  productId: number;
  sku: string;
  nombre: string;
  producto: string;
  cantidad: string;
  precio: string;
  configurable: boolean;
  pasos?: Passo[];
  seleccionOpts?: (PassoOption | null)[];
  configuracion?: ConfiguracionLinea;
  configVariantId?: number;
}

interface Props {
  onCreada: (id: number) => void;
  onError: (msg: string) => void;
  onMsg: (msg: string) => void;
}

export default function NuevaVenta({ onCreada, onError, onMsg }: Props) {
  const [clientes, setClientes] = useState<Partner[]>([]);
  const [partnerId, setPartnerId] = useState("");
  const [fechaEntrega, setFechaEntrega] = useState("");
  const [notas, setNotas] = useState("");
  const [lineas, setLineas] = useState<LineaForm[]>([]);
  const [busqVar, setBusqVar] = useState("");
  const [resultados, setResultados] = useState<VarianteBuscada[]>([]);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    api<Partner[]>("/clientes").then(setClientes).catch(() => setClientes([]));
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

  async function cargarPasos(productId: number): Promise<Passo[]> {
    try {
      const pasos = await api<Passo[]>(`/public/productos/${productId}/pasos`);
      return pasos;
    } catch {
      return [];
    }
  }

  async function agregarLinea(v: VarianteBuscada) {
    if (lineas.some((l) => l.variantId === v.id)) return;
    const pasos = await cargarPasos(v.productId);
    const attrSteps = pasos.filter((s) => !s.isQtyStep);
    const configurable = attrSteps.length > 0;
    setLineas([
      ...lineas,
      {
        variantId: v.id,
        productId: v.productId,
        sku: v.sku,
        nombre: v.nombre,
        producto: v.producto,
        cantidad: "1",
        precio: String(v.precio),
        configurable,
        pasos: configurable ? attrSteps : undefined,
        seleccionOpts: configurable ? attrSteps.map(() => null) : undefined,
      },
    ]);
    setBusqVar("");
    setResultados([]);
  }

  function cambiarLinea(i: number, campo: string, valor: string) {
    setLineas(lineas.map((l, j) => (j === i ? { ...l, [campo]: valor } : l)));
  }

  function opcionesDelPaso(linea: LineaForm, pasoIdx: number): PassoOption[] {
    const paso = linea.pasos?.[pasoIdx];
    if (!paso) return [];
    if (pasoIdx === 0) return paso.opciones;
    const prevSel = linea.seleccionOpts?.[pasoIdx - 1];
    if (!prevSel) return paso.opciones.filter((o) => o.valueId === null || false);
    return paso.opciones.filter(
      (o) => o.valueId === prevSel.valueId || paso.opciones.some((p) => p.valueId === prevSel.valueId && p.variantId === o.variantId),
    );
  }

  function elegirOpcion(i: number, pasoIdx: number, opt: PassoOption) {
    setLineas((prev) =>
      prev.map((l, j) => {
        if (j !== i) return l;
        const seleccionOpts = (l.seleccionOpts ?? []).slice();
        if (pasoIdx < seleccionOpts.length) seleccionOpts[pasoIdx] = opt;
        for (let k = pasoIdx + 1; k < seleccionOpts.length; k++) seleccionOpts[k] = null;
        return { ...l, seleccionOpts, configuracion: undefined, configVariantId: undefined };
      }),
    );
  }

  function aplicarConfiguracion(i: number) {
    const linea = lineas[i];
    const pasos = linea.pasos ?? [];
    const seleccionOpts = linea.seleccionOpts ?? [];
    if (seleccionOpts.some((s) => !s) || seleccionOpts.length === 0) return;
    const ultima = seleccionOpts[seleccionOpts.length - 1];
    if (!ultima) return;
    const cfg: ConfiguracionLinea = {
      pasos: pasos.map((p, idx) => {
        const opt = seleccionOpts[idx];
        const valores = [...new Set(p.opciones.filter((o) => o.variantId === opt?.variantId).map((o) => o.valor))];
        return { pregunta: p.pregunta, opciones: valores, seleccion: opt?.valor ?? "" };
      }),
    };
    setLineas((prev) =>
      prev.map((l, j) => (j === i ? { ...l, configuracion: cfg, configVariantId: ultima.variantId, sku: ultima.sku } : l)),
    );
  }

  async function crearVenta(e: React.FormEvent) {
    e.preventDefault();
    if (lineas.length === 0) {
      onError("Agrega al menos una variante.");
      return;
    }
    for (const l of lineas) {
      if (l.configurable && !l.configuracion) {
        onError(`La variante "${l.producto} — ${l.nombre}" requiere configuración.`);
        return;
      }
    }
    setGuardando(true);
    onError("");
    try {
      const v = await api<{ id: number }>("/ventas", {
        method: "POST",
        body: JSON.stringify({
          partnerId: partnerId ? Number(partnerId) : undefined,
          fechaEntregaDeseada: fechaEntrega || undefined,
          notas: notas || undefined,
          lines: lineas.map((l) => ({
            variantId: l.configVariantId ?? l.variantId,
            cantidad: Number(l.cantidad),
            precioUnitario: l.precio === "" ? undefined : Number(l.precio),
            configuracion: l.configuracion ? JSON.stringify(l.configuracion) : undefined,
          })),
        }),
      });
      onMsg("Venta registrada. Revisa el seguimiento y confírmala cuando esté lista.");
      setLineas([]);
      setPartnerId("");
      setFechaEntrega("");
      setNotas("");
      onCreada(v.id);
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <form onSubmit={crearVenta} className="card">
      <div className="row">
        <label>
          Cliente
          <select value={partnerId} onChange={(e) => setPartnerId(e.target.value)}>
            <option value="">— Sin asignar —</option>
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </label>
        <label>
          Entrega deseada
          <input type="date" value={fechaEntrega} onChange={(e) => setFechaEntrega(e.target.value)} />
        </label>
      </div>
      <label>
        Notas
        <input value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="opcional" />
      </label>

      <h4 style={{ marginBottom: 4 }}>Variantes a vender</h4>
      <label>
        Buscar producto o variante…
        <input value={busqVar} onChange={(e) => setBusqVar(e.target.value)} placeholder="ej. pincel, espiral…" />
      </label>
      {resultados.length > 0 && (
        <div className="card" style={{ padding: 8, margin: "4px 0 12px" }}>
          {resultados.map((r) => (
            <button
              key={r.id}
              type="button"
              className="btn ghost"
              style={{ display: "block", width: "100%", textAlign: "left", marginBottom: 2, background: "#fff", padding: "8px 12px" }}
              onClick={() => agregarLinea(r)}
            >
              <span>
                <strong>{r.producto}</strong> — {r.nombre}
                <span className="muted small"> ({r.sku}) · stock {r.stockActual} · ${r.precio}</span>
              </span>
            </button>
          ))}
        </div>
      )}

      {lineas.map((l, i) => (
        <div key={i} style={{ background: "#fafafa", padding: "8px 12px", borderRadius: 8, marginBottom: 6 }}>
          <div className="row">
            <span style={{ flex: 2 }}>
              <strong>{l.producto}</strong> — {l.nombre} <span className="muted small">({l.sku})</span>
              {l.configurable && <span className="muted small" style={{ color: "var(--warning)" }}> · configurable</span>}
            </span>
            <label style={{ flex: 0.7 }}>
              Cantidad
              <input type="number" step="0.001" min="0.001" value={l.cantidad} onChange={(e) => cambiarLinea(i, "cantidad", e.target.value)} />
            </label>
            <label style={{ flex: 0.9 }}>
              Precio ($)
              <input type="number" step="0.01" value={l.precio} onChange={(e) => cambiarLinea(i, "precio", e.target.value)} />
            </label>
            <button type="button" className="btn ghost" style={{ flex: 0 }} onClick={() => setLineas(lineas.filter((_, j) => j !== i))}>
              Quitar
            </button>
          </div>

          {l.configurable && l.pasos && (
            <div style={{ marginTop: 8, padding: 8, background: "#fff", border: "1px solid #eee", borderRadius: 6 }}>
              {l.pasos.map((p, pi) => {
                const opciones = opcionesDelPaso(l, pi);
                const elegida = l.seleccionOpts?.[pi]?.variantId;
                return (
                  <label key={pi} style={{ display: "block", marginBottom: 6 }}>
                    {p.pregunta} <span className="muted small">({p.opciones.length} opts)</span>
                    <select
                      style={{ width: "100%", marginTop: 2 }}
                      value={elegida ?? ""}
                      onChange={(e) => {
                        const opt = opciones.find((o) => o.variantId === Number(e.target.value));
                        if (opt) elegirOpcion(i, pi, opt);
                      }}
                      disabled={pi > 0 && !l.seleccionOpts?.[pi - 1]}
                    >
                      <option value="">— Elegir —</option>
                      {opciones.map((o) => (
                        <option key={o.variantId} value={o.variantId}>
                          {o.valor} ({o.sku})
                        </option>
                      ))}
                    </select>
                  </label>
                );
              })}
              {l.configuracion ? (
                <p className="muted small" style={{ margin: "4px 0 0" }}>
                  Configurado → {l.sku}
                </p>
              ) : (
                <button type="button" className="btn primary small" style={{ marginTop: 4 }} onClick={() => aplicarConfiguracion(i)}>
                  Aplicar configuración
                </button>
              )}
            </div>
          )}
        </div>
      ))}
      {lineas.length === 0 && <p className="muted">Busca y agrega las variantes.</p>}

      <div className="row">
        <button className="btn primary block" disabled={guardando}>
          {guardando ? "Guardando…" : "Guardar venta"}
        </button>
      </div>
    </form>
  );
}
