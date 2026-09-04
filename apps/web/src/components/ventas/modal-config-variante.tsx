"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import type { ConfiguracionLinea, Passo, PassoOption, ProductoPublico } from "@/lib/types";

export interface LineaConfigurada {
  variantId: number;
  productId: number;
  sku: string;
  nombre: string;
  producto: string;
  uom: string;
  cantidad: string;
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

type Panel = { charIdx: number | null; colorIdx: number | null };

function esPasoColor(passo: Passo): boolean {
  return /¿de qué color/i.test(passo.pregunta);
}

function buildPaneles(passos: Passo[]): Panel[] {
  const result: Panel[] = [];
  for (let i = 0; i < passos.length; i++) {
    if (esPasoColor(passos[i])) {
      const prev = result[result.length - 1];
      if (prev && prev.charIdx !== null && prev.colorIdx === null) {
        prev.colorIdx = i;
      } else {
        result.push({ charIdx: null, colorIdx: i });
      }
    } else {
      result.push({ charIdx: i, colorIdx: null });
    }
  }
  return result;
}

export default function ModalConfigVariante({ producto, lineaInicial, onConfirmar, onCerrar }: Props) {
  const [passos, setPassos] = useState<Passo[]>([]);
  const [panelActual, setPanelActual] = useState(0);
  const [selValores, setSelValores] = useState<Record<number, number>>({});
  const [cantidad, setCantidad] = useState(lineaInicial?.cantidad ?? "1");
  const [pasosListos, setPasosListos] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api<Passo[]>(`/public/productos/${producto.productId}/pasos`)
      .then((ps) => {
        const attrs = ps.filter((s) => !s.isQtyStep);
        setPassos(attrs);
        setPasosListos(true);
      })
      .catch((e) => {
        setError((e as Error).message);
        setPasosListos(true);
      });
  }, [producto.productId]);

  const paneles = useMemo(() => buildPaneles(passos), [passos]);
  const esRevision = panelActual >= paneles.length;

  function opcionesDelPaso(pasoIdx: number): PassoOption[] {
    const paso = passos[pasoIdx];
    if (!paso) return [];
    if (pasoIdx === 0) return paso.opciones;

    let compatibles: Set<number> | undefined;
    for (let i = 0; i < pasoIdx; i++) {
      const attrId = passos[i].attributeId;
      if (attrId == null) continue;
      const selValueId = selValores[attrId];
      if (selValueId === undefined) continue;
      const variantesDeEsteValor = new Set(
        passos[i].opciones.filter((o) => o.valueId === selValueId).map((o) => o.variantId),
      );
      if (compatibles === undefined) {
        compatibles = variantesDeEsteValor;
      } else {
        compatibles = new Set(Array.from(compatibles).filter((v) => variantesDeEsteValor.has(v)));
      }
    }
    if (compatibles === undefined) return paso.opciones;
    return paso.opciones.filter((o) => compatibles.has(o.variantId));
  }

  function elegirOpcion(pasoIdx: number, opt: PassoOption) {
    const attrId = passos[pasoIdx]?.attributeId;
    if (attrId == null) return;
    const next = { ...selValores, [attrId]: opt.valueId };
    setSelValores(next);
  }

  // Auto-selecciona cualquier paso que quede con una sola variante compatible
  useEffect(() => {
    setSelValores((prev) => {
      let changed = false;
      const next = { ...prev };
      for (let i = 0; i < passos.length; i++) {
        const attrId = passos[i].attributeId;
        if (attrId == null) continue;
        if (next[attrId] !== undefined) continue;
        const opts = opcionesDelPaso(i);
        const unique = [...new Set(opts.map((o) => o.variantId))];
        if (unique.length === 1 && opts.length > 0) {
          next[attrId] = opts[0].valueId;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  });

  function panelResuelto(p: Panel): boolean {
    const check = (idx: number | null) => {
      if (idx === null) return true;
      const attrId = passos[idx]?.attributeId;
      return attrId != null && selValores[attrId] !== undefined;
    };
    return check(p.charIdx) && check(p.colorIdx);
  }

  function puedeAvanzar(): boolean {
    if (!esRevision) {
      return panelResuelto(paneles[panelActual]);
    }
    return Number(cantidad) > 0;
  }

  function variantIdFinal(): number | null {
    if (passos.length === 0) return null;
    const last = passos[passos.length - 1];
    const valueId = last.attributeId != null ? selValores[last.attributeId] : undefined;
    if (valueId === undefined) return null;
    const opt = last.opciones.find((o) => o.valueId === valueId);
    return opt?.variantId ?? null;
  }

  function variantSkuFinal(): string {
    if (passos.length === 0) return "";
    const last = passos[passos.length - 1];
    const valueId = last.attributeId != null ? selValores[last.attributeId] : undefined;
    if (valueId === undefined) return "";
    return last.opciones.find((o) => o.valueId === valueId)?.sku ?? "";
  }

  function confirmar() {
    const vid = variantIdFinal();
    if (!vid) return;
    const cfg: ConfiguracionLinea = {
      pasos: passos.map((p, i) => {
        const attrId = p.attributeId;
        const valueId = attrId != null ? selValores[attrId] : undefined;
        const opt = valueId !== undefined ? p.opciones.find((o) => o.valueId === valueId) : undefined;
        const valores = [...new Set(p.opciones.filter((o) => o.variantId === vid).map((o) => o.valor))];
        return { pregunta: p.pregunta, opciones: valores, seleccion: opt?.valor ?? "" };
      }),
    };
    const ultimaOpt = passos[passos.length - 1].opciones.find((o) => o.variantId === vid);
    onConfirmar({
      variantId: vid,
      productId: producto.productId,
      sku: ultimaOpt?.sku ?? variantSkuFinal(),
      nombre: ultimaOpt?.sku ?? producto.nombre,
      producto: producto.nombre,
      uom: producto.uom,
      cantidad,
      configuracion: cfg,
      configVariantId: vid,
    });
    onCerrar();
  }

  if (!pasosListos) {
    return (
      <div className="modal-overlay">
        <div className="modal"><p className="muted">Cargando opciones…</p></div>
      </div>
    );
  }

  const totalPasos = paneles.length + 1;
  const panel = paneles[panelActual];

  const renderOpcionesGrid = (stepIdx: number | null) => {
    if (stepIdx === null) return null;
    const paso = passos[stepIdx];
    if (!paso) return null;
    const opts = opcionesDelPaso(stepIdx);
    if (opts.length === 0) return null;
    const unique = new Set(opts.map((o) => o.variantId));
    if (unique.size === 1) return null;
    return (
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10 }}>
        {opts.map((opt, i) => {
          const sel = paso.attributeId != null && selValores[paso.attributeId] === opt.valueId;
          return (
            <button
              key={`${opt.variantId}-${opt.valueId}`}
              type="button"
              onClick={() => elegirOpcion(stepIdx, opt)}
              style={{
                padding: "16px 12px",
                border: sel ? "2px solid var(--primary)" : "1px solid #ccc",
                borderRadius: 8,
                background: sel ? "#eff6ff" : "white",
                cursor: "pointer",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 8,
                textAlign: "center",
              }}
            >
              <span style={{ fontSize: "2em", color: sel ? "var(--primary)" : "#aaa" }}>
                {iconosPlaceholder[i % iconosPlaceholder.length]}
              </span>
              <span style={{ fontWeight: sel ? "bold" : "normal" }}>{opt.valor}</span>
              <span className="muted small">{opt.sku}</span>
            </button>
          );
        })}
      </div>
    );
  };

  const panelTitle = (() => {
    const firstIdx = panel?.charIdx ?? panel?.colorIdx;
    const firstPaso = firstIdx != null ? passos[firstIdx] : undefined;
    return firstPaso?.pregunta ?? "";
  })();

  return (
    <div className="modal-overlay" onClick={onCerrar}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ minWidth: 480, maxWidth: 640 }}>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ margin: 0 }}>{producto.nombre}</h3>
          <button type="button" className="btn ghost sm" onClick={onCerrar}>✕</button>
        </div>
        <p className="muted small" style={{ margin: "4px 0 16px" }}>
          Paso {Math.min(panelActual + 1, totalPasos)} de {totalPasos}
          {!esRevision && panel ? ` — ${panelTitle}` : ""}
        </p>

        <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
          {Array.from({ length: totalPasos }).map((_, i) => (
            <div key={i} style={{ flex: 1, height: 4, borderRadius: 2, background: i < panelActual ? "var(--primary)" : i === panelActual && !esRevision ? "var(--primary)" : "#ddd" }} />
          ))}
        </div>

        {error && <div className="error">{error}</div>}

        {!esRevision && panel && (
          <>
            <h4 style={{ marginTop: 0, marginBottom: 12 }}>{panelTitle}</h4>
            {panel.charIdx !== null && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: "0.85em", color: "#666", marginBottom: 6 }}>{passos[panel.charIdx]?.pregunta}</div>
                {renderOpcionesGrid(panel.charIdx)}
              </div>
            )}
            {panel.colorIdx !== null && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: "0.85em", color: "#666", marginBottom: 6 }}>{passos[panel.colorIdx]?.pregunta}</div>
                {renderOpcionesGrid(panel.colorIdx)}
              </div>
            )}
            {((panel.charIdx === null || opcionesDelPaso(panel.charIdx).length === 0) && (panel.colorIdx === null || opcionesDelPaso(panel.colorIdx).length === 0)) && (
              <p className="muted">Selecciona una opción del paso anterior primero.</p>
            )}
          </>
        )}

        {esRevision && (
          <>
            <h4 style={{ marginTop: 0 }}>Revisa tu configuración</h4>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <tbody>
                {passos.map((p, i) => {
                  const attrId = p.attributeId;
                  const valueId = attrId != null ? selValores[attrId] : undefined;
                  const opt = valueId !== undefined ? p.opciones.find((o) => o.valueId === valueId) : undefined;
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
                <tr>
                  <td style={{ padding: "8px 0", color: "#666" }}>SKU final</td>
                  <td style={{ padding: "8px 0", textAlign: "right", fontFamily: "monospace" }}>{variantSkuFinal()}</td>
                </tr>
              </tbody>
            </table>
          </>
        )}

        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 24 }}>
          {panelActual > 0 ? (
            <button type="button" className="btn ghost" onClick={() => setPanelActual(panelActual - 1)}>← Atrás</button>
          ) : <span />}
          {!esRevision ? (
            <button type="button" className="btn primary" onClick={() => setPanelActual(panelActual + 1)} disabled={!puedeAvanzar()}>
              {panelActual === paneles.length - 1 ? "Revisar →" : "Siguiente →"}
            </button>
          ) : (
            <button type="button" className="btn primary" onClick={confirmar} disabled={!variantIdFinal()}>
              Confirmar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
