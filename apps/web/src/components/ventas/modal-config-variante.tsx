"use client";

import { useState } from "react";
import Modal from "@/components/ui/modal";
import { opcionResaltada } from "@/lib/pasos-wizard";
import { usePasosWizard } from "@/lib/use-pasos-wizard";
import type { ConfiguracionLinea, PassoOption, ProductoPublico } from "@/lib/types";

export interface LineaConfigurada {
  variantId: number;
  productId: number;
  sku: string;
  nombre: string;
  producto: string;
  uom: string;
  cantidad: string;
  precio: string;
  configuracion?: ConfiguracionLinea;
  configVariantId?: number;
}

interface Props {
  producto: ProductoPublico;
  lineaInicial?: LineaConfigurada;
  onConfirmar: (linea: LineaConfigurada) => void;
  onCerrar: () => void;
}

const iconosPlaceholder = ["▣", "◉", "▲", "■", "◆", "●", "▢", "★"];

export default function ModalConfigVariante({ producto, lineaInicial, onConfirmar, onCerrar }: Props) {
  const w = usePasosWizard(producto.productId);
  const [cantidad, setCantidad] = useState("1");
  const [error, setError] = useState("");
  const [creando, setCreando] = useState(false);

  async function confirmar(crear: boolean) {
    if (!w.passos.length) return;
    setError("");
    try {
      const r = await w.resolverSeleccion(crear);
      if (!r.variantId) {
        setError("No se pudo resolver la variante con esa combinación.");
        return;
      }
      const cfg: ConfiguracionLinea = {
        pasos: w.passos.map((p, i) => {
          const opt = p.opciones.find((o) => o.valueId === w.selIdx[i]);
          return { pregunta: p.pregunta, opciones: [], seleccion: opt?.valor ?? "" };
        }),
      };
      onConfirmar({
        variantId: r.variantId,
        productId: producto.productId,
        sku: r.sku ?? "",
        nombre: r.nombre ?? producto.nombre,
        producto: producto.nombre,
        uom: producto.uom,
        cantidad,
        precio: lineaInicial?.precio ?? String(producto.basePrice),
        configuracion: cfg,
        configVariantId: r.variantId,
      });
      onCerrar();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function confirmarConCreacion() {
    setCreando(true);
    w.resolverSeleccion(false)
      .then((r) => {
        if (r.variantId) { void confirmar(false); return; }
        if (window.confirm("Esta configuración aún no existe como variante. ¿Deseas crearla?")) {
          void confirmar(true);
        }
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setCreando(false));
  }

  if (w.cargando) {
    return (
      <Modal onClose={onCerrar}>
        <p className="muted">Cargando opciones…</p>
      </Modal>
    );
  }

  const totalPasos = w.paneles.length + 1;
  const panel = w.panel;
  const esRevision = w.esRevision;

  const renderOpcionesGrid = (pasoIdx: number) => {
    const paso = w.passos[pasoIdx];
    if (!paso) return null;
    const opts = paso.opciones;
    if (opts.length === 0) return null;
    const resaltada = opcionResaltada(paso, w.selIdx[pasoIdx]);
    return (
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10 }}>
        {opts.map((opt, i) => {
          const sel = w.selIdx[pasoIdx] === opt.valueId;
          const sug = !sel && resaltada === opt.valueId;
          return (
            <button
              key={`${paso.attributeId}-${opt.valueId}`}
              type="button"
              onClick={() => w.seleccionarOpcion(pasoIdx, opt)}
              style={{
                padding: "16px 12px",
                border: sel || sug ? "2px solid var(--brand)" : "1px solid #ccc",
                borderRadius: 8,
                background: sel ? "#eff6ff" : "white",
                cursor: "pointer",
                display: "flex", flexDirection: "column", alignItems: "center", gap: 8, textAlign: "center",
              }}
            >
              <span style={{ fontSize: "2em", color: sel || sug ? "var(--brand)" : "#aaa" }}>
                {iconosPlaceholder[i % iconosPlaceholder.length]}
              </span>
              <span style={{ fontWeight: sel || sug ? "bold" : "normal" }}>{opt.valor}</span>
              <span className="muted small">{opt.enStock ? "En stock" : "Sin stock"}</span>
            </button>
          );
        })}
      </div>
    );
  };

  const panelTitle = (() => {
    const firstIdx = panel?.pasos[0];
    return firstIdx != null ? w.passos[firstIdx]?.pregunta ?? "" : "";
  })();

  // En pasos intermedios basta con que el panel tenga opciones (se toma la resaltada).
  const puedeAvanzar = panel?.pasos.some((i) => (w.passos[i]?.opciones.length ?? 0) > 0) ?? false;

  return (
    <Modal title={producto.nombre} onClose={onCerrar} size="lg">
      <p className="muted small" style={{ margin: "4px 0 16px" }}>
        Paso {Math.min(w.panelActual + 1, totalPasos)} de {totalPasos}
        {!esRevision && panel ? ` — ${panelTitle}` : ""}
      </p>

      <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
        {Array.from({ length: totalPasos }).map((_, i) => (
          <div key={i} style={{ flex: 1, height: 4, borderRadius: 2, background: i < w.panelActual ? "var(--brand)" : i === w.panelActual && !esRevision ? "var(--brand)" : "#ddd" }} />
        ))}
      </div>

      {error && <div className="error">{error}</div>}

      {!esRevision && panel && (
        <>
          <h4 style={{ marginTop: 0, marginBottom: 12 }}>{panelTitle}</h4>
          {panel.pasos.map((pasoIdx) => (
            <div key={pasoIdx} style={{ marginBottom: 14 }}>
              <div style={{ fontSize: "0.85em", color: "#666", marginBottom: 6 }}>{w.passos[pasoIdx]?.pregunta}</div>
              {renderOpcionesGrid(pasoIdx)}
            </div>
          ))}
          {panel.pasos.every((i) => (w.passos[i]?.opciones.length ?? 0) === 0) && (
            <p className="muted">Selecciona una opción del paso anterior primero.</p>
          )}
        </>
      )}

      {esRevision && (
        <>
          <h4 style={{ marginTop: 0 }}>Revisa tu configuración</h4>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <tbody>
              {w.passos.map((p, i) => {
                const opt = p.opciones.find((o) => o.valueId === w.selIdx[i]);
                return (
                  <tr key={i} style={{ borderBottom: "1px solid #eee" }}>
                    <td style={{ padding: "8px 0", color: "#666" }}>{p.pregunta}</td>
                    <td style={{ padding: "8px 0", textAlign: "right", fontWeight: "bold" }}>{opt?.valor ?? "—"}</td>
                  </tr>
                );
              })}
              <tr style={{ borderBottom: "1px solid #eee" }}>
                <td style={{ padding: "8px 0", color: "#666" }}>Cantidad</td>
                <td style={{ padding: "8px 0", textAlign: "right" }}>
                  <input
                    type="number"
                    min={producto.uom === "kg" ? "0.001" : "1"}
                    step={producto.uom === "kg" ? "0.001" : "1"}
                    value={cantidad}
                    onChange={(e) => setCantidad(e.target.value)}
                    style={{ width: 80, textAlign: "right", padding: "4px 8px", border: "1px solid #ccc", borderRadius: 4 }}
                  />
                  <span style={{ marginLeft: 6, color: "#666" }}>{producto.uom}(s)</span>
                </td>
              </tr>
            </tbody>
          </table>
        </>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 24 }}>
        {w.panelActual > 0 ? (
          <button type="button" className="btn ghost" onClick={w.retroceder}>← Atrás</button>
        ) : <span />}
        {!esRevision ? (
          <button type="button" className="btn primary" onClick={w.avanzar} disabled={!puedeAvanzar}>
            {w.panelActual === w.paneles.length - 1 ? "Revisar →" : "Siguiente →"}
          </button>
        ) : (
          <button type="button" className="btn primary" onClick={confirmarConCreacion} disabled={creando || !w.passos.every((_, i) => w.selIdx[i] !== undefined)}>
            {creando ? "Verificando…" : "Confirmar"}
          </button>
        )}
      </div>
    </Modal>
  );
}
