"use client";

import { useEffect, useMemo, useState } from "react";
import Modal from "@/components/ui/modal";
import { getPasosCached, getPasosConSeleccion } from "@/lib/pasos-cache";
import { buildPaneles, esPanelResuelto, resolver, seleccionActual, limpiarSeleccionesInvalidas, opcionResaltada } from "@/lib/pasos-wizard";
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

export default function ModalConfigVariante({ producto, onConfirmar, onCerrar }: Props) {
  const [passos, setPassos] = useState<Passo[]>([]);
  const [panelActual, setPanelActual] = useState(0);
  const [selIdx, setSelIdx] = useState<Record<number, number | undefined>>({});
  const [cantidad, setCantidad] = useState("1");
  const [pasosListos, setPasosListos] = useState(false);
  const [error, setError] = useState("");
  const [creando, setCreando] = useState(false);

  useEffect(() => {
    getPasosCached(producto.productId)
      .then((ps) => { setPassos(ps); setPasosListos(true); })
      .catch((e) => { setError((e as Error).message); setPasosListos(true); });
  }, [producto.productId]);

  // Recarga las opciones del servidor cada vez que cambia la selección (cascada).
  useEffect(() => {
    if (!pasosListos || passos.length === 0) return;
    let cancel = false;
    const sel = seleccionActual(passos, selIdx);
    if (sel.length === 0) return;
    getPasosConSeleccion(producto.productId, sel)
      .then((ps) => { if (!cancel) setPassos(ps); })
      .catch(() => {});
    return () => { cancel = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(selIdx)]);

  // Limpia selecciones que la cascada dejó inválidas (no preselecciona).
  useEffect(() => {
    if (!pasosListos || passos.length === 0) return;
    setSelIdx((prev) => {
      const { next, changed } = limpiarSeleccionesInvalidas(passos, prev);
      return changed ? next : prev;
    });
  }, [passos, pasosListos]);

  const paneles = useMemo(() => buildPaneles(passos), [passos]);
  const esRevision = panelActual >= paneles.length;

  function elegirOpcion(pasoIdx: number, opt: PassoOption) {
    setSelIdx((prev) => ({ ...prev, [pasoIdx]: opt.valueId }));
  }

  function panelResuelto(p: { pasos: number[] }): boolean {
    return esPanelResuelto(p, selIdx);
  }

  function puedeAvanzar(): boolean {
    if (!esRevision) return panelResuelto(paneles[panelActual]);
    return Number(cantidad) > 0;
  }

  async function confirmar(crear: boolean) {
    if (!passos.length) return;
    setError("");
    try {
      const r = await resolver(producto.productId, passos, selIdx, crear);
      if (!r.variantId) {
        setError("No se pudo resolver la variante con esa combinación.");
        return;
      }
      const cfg: ConfiguracionLinea = {
        pasos: passos.map((p, i) => {
          const valueId = selIdx[i];
          const opt = valueId !== undefined ? p.opciones.find((o) => o.valueId === valueId) : undefined;
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
    resolver(producto.productId, passos, selIdx, false)
      .then((r) => {
        if (r.variantId) { void confirmar(false); return; }
        if (window.confirm("Esta configuración aún no existe como variante. ¿Deseas crearla?")) {
          void confirmar(true);
        }
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setCreando(false));
  }

  if (!pasosListos) {
    return (
      <Modal onClose={onCerrar}>
        <p className="muted">Cargando opciones…</p>
      </Modal>
    );
  }

  const totalPasos = paneles.length + 1;
  const panel = paneles[panelActual];

  const renderOpcionesGrid = (pasoIdx: number) => {
    const paso = passos[pasoIdx];
    if (!paso) return null;
    const opts = paso.opciones;
    if (opts.length === 0) return null;
    const resaltada = opcionResaltada(paso, selIdx[pasoIdx]);
    return (
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10 }}>
        {opts.map((opt, i) => {
          const sel = selIdx[pasoIdx] === opt.valueId;
          const sug = !sel && resaltada === opt.valueId;
          return (
            <button
              key={`${paso.attributeId}-${opt.valueId}`}
              type="button"
              onClick={() => elegirOpcion(pasoIdx, opt)}
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
    return firstIdx != null ? passos[firstIdx]?.pregunta ?? "" : "";
  })();

  return (
    <Modal title={producto.nombre} onClose={onCerrar} size="lg">
      <p className="muted small" style={{ margin: "4px 0 16px" }}>
        Paso {Math.min(panelActual + 1, totalPasos)} de {totalPasos}
        {!esRevision && panel ? ` — ${panelTitle}` : ""}
      </p>

      <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
        {Array.from({ length: totalPasos }).map((_, i) => (
          <div key={i} style={{ flex: 1, height: 4, borderRadius: 2, background: i < panelActual ? "var(--brand)" : i === panelActual && !esRevision ? "var(--brand)" : "#ddd" }} />
        ))}
      </div>

      {error && <div className="error">{error}</div>}

      {!esRevision && panel && (
        <>
          <h4 style={{ marginTop: 0, marginBottom: 12 }}>{panelTitle}</h4>
          {panel.pasos.map((pasoIdx) => (
            <div key={pasoIdx} style={{ marginBottom: 14 }}>
              <div style={{ fontSize: "0.85em", color: "#666", marginBottom: 6 }}>{passos[pasoIdx]?.pregunta}</div>
              {renderOpcionesGrid(pasoIdx)}
            </div>
          ))}
          {panel.pasos.every((i) => (passos[i]?.opciones.length ?? 0) === 0) && (
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
                const opt = p.opciones.find((o) => o.valueId === selIdx[i]);
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
        {panelActual > 0 ? (
          <button type="button" className="btn ghost" onClick={() => setPanelActual(panelActual - 1)}>← Atrás</button>
        ) : <span />}
        {!esRevision ? (
          <button type="button" className="btn primary" onClick={() => setPanelActual(panelActual + 1)} disabled={!puedeAvanzar()}>
            {panelActual === paneles.length - 1 ? "Revisar →" : "Siguiente →"}
          </button>
        ) : (
          <button type="button" className="btn primary" onClick={confirmarConCreacion} disabled={creando || !panelResueltoCompleto()}>
            {creando ? "Verificando…" : "Confirmar"}
          </button>
        )}
      </div>
    </Modal>
  );

  function panelResueltoCompleto(): boolean {
    return passos.every((_, i) => selIdx[i] !== undefined);
  }
}
