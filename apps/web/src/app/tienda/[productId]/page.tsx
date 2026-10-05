"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import { opcionResaltada } from "@/lib/pasos-wizard";
import { usePasosWizard } from "@/lib/use-pasos-wizard";
import type { PassoOption, ConfiguracionLinea } from "@/lib/types";

interface ProductoBasico {
  id: number;
  nombre: string;
  skuBase: string;
  uom: string;
  basePrice: number;
}

export default function TiendaPage() {
  const { productId } = useParams<{ productId: string }>();
  const pid = Number(productId);

  const [producto, setProducto] = useState<ProductoBasico | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const w = usePasosWizard(pid);

  const [cantidad, setCantidad] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [pedidoNumero, setPedidoNumero] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState("");
  const [skuFinal, setSkuFinal] = useState("");

  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [email, setEmail] = useState("");

  const cargar = useCallback(async () => {
    try {
      setProducto(await api<ProductoBasico>(`/productos/${pid}`));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [pid]);

  useEffect(() => { cargar(); }, [cargar]);

  // En pasos intermedios basta con que el panel tenga opciones (se toma la resaltada).
  const puedeAvanzar = w.esRevision
    ? cantidad > 0
    : (w.panel?.pasos.some((i) => (w.passos[i]?.opciones.length ?? 0) > 0) ?? false);

  async function confirmarPedido() {
    setSubmitting(true);
    setSubmitError("");
    try {
      const r = await w.resolverSeleccion(true);
      if (!r.variantId) { setSubmitError("No se pudo armar esa configuración."); return; }
      setSkuFinal(r.sku ?? "");
      const cfg: ConfiguracionLinea = {
        pasos: w.passos.map((p, i) => {
          const opt = p.opciones.find((o) => o.valueId === w.selIdx[i]);
          return { pregunta: p.pregunta, opciones: [], seleccion: opt?.valor ?? "" };
        }),
      };
      const res = await api<{ numero: string }>("public/orders", {
        method: "POST",
        body: JSON.stringify({
          nombre: nombre || undefined,
          telefono: telefono || undefined,
          email: email || undefined,
          lines: [{ variantId: r.variantId, cantidad, configuracion: JSON.stringify(cfg) }],
        }),
      });
      setPedidoNumero(res.numero);
    } catch (e) {
      setSubmitError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading || w.cargando) return <div style={{ padding: 40, textAlign: "center" }}><p>Cargando producto…</p></div>;
  if (error || w.error || !producto) return <div style={{ padding: 40, textAlign: "center" }}><p style={{ color: "red" }}>{error || w.error || "Producto no encontrado."}</p></div>;

  if (pedidoNumero) {
    return (
      <div style={{ padding: 40, maxWidth: 500, margin: "60px auto", textAlign: "center" }}>
        <div className="card">
          <h2 style={{ color: "var(--success)" }}>¡Pedido recibido!</h2>
          <p>Tu número de pedido es:</p>
          <p style={{ fontSize: "1.5em", fontWeight: "bold" }}>{pedidoNumero}</p>
          <p className="muted small">Te contactaremos pronto para confirmar los detalles.</p>
        </div>
      </div>
    );
  }

  const panel = w.panel;
  const totalPasos = w.paneles.length + 1;
  const esRevision = w.esRevision;

  const renderOpciones = (stepIdx: number) => {
    const paso = w.passos[stepIdx];
    if (!paso) return null;
    const opts = paso.opciones;
    if (opts.length === 0) return null;
    const resaltada = opcionResaltada(paso, w.selIdx[stepIdx]);
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {opts.map((opt) => {
          const sel = w.selIdx[stepIdx] === opt.valueId;
          const sug = !sel && resaltada === opt.valueId;
          return (
            <button
              key={`${paso.attributeId}-${opt.valueId}`}
              onClick={() => w.seleccionarOpcion(stepIdx, opt)}
              style={{
                padding: "12px 16px",
                border: sel || sug ? "2px solid var(--brand)" : "1px solid #ccc",
                borderRadius: 8,
                background: sel ? "#eff6ff" : "white",
                cursor: "pointer",
                textAlign: "left",
                display: "flex", justifyContent: "space-between", alignItems: "center",
              }}
            >
              <span style={{ fontWeight: sel || sug ? "bold" : "normal" }}>{opt.valor}</span>
              <span style={{ fontSize: "0.8em", color: opt.enStock ? "var(--success)" : "var(--warning)" }}>
                {opt.enStock ? "En stock" : "Sin stock"}
              </span>
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

  return (
    <div style={{ minHeight: "100vh", background: "#f5f5f5" }}>
      <div style={{ background: "white", borderBottom: "1px solid #ddd", padding: "12px 24px" }}>
        <div style={{ maxWidth: 700, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontWeight: "bold", fontSize: "1.1em" }}>PLASA ERP</span>
          <a href="/productos" style={{ color: "var(--brand)", textDecoration: "none" }}>Admin</a>
        </div>
      </div>

      <div style={{ maxWidth: 600, margin: "40px auto", padding: "0 16px" }}>
        <h1 style={{ fontSize: "1.4em", marginBottom: 4 }}>{producto.nombre}</h1>
        <p className="muted small" style={{ margin: "0 0 24px" }}>
          SKU: {producto.skuBase} · Precio base: ${producto.basePrice.toFixed(2)}/{producto.uom}
        </p>

        <div style={{ marginBottom: 24 }}>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            {Array.from({ length: totalPasos }).map((_, i) => (
              <div key={i} style={{ flex: 1, height: 4, borderRadius: 2, background: i <= w.panelActual ? "var(--brand)" : "#ddd" }} />
            ))}
          </div>
          <p className="muted small" style={{ marginTop: 6 }}>
            Paso {Math.min(w.panelActual + 1, totalPasos)} de {totalPasos}
            {esRevision ? " — Revisar" : panel ? ` — ${panelTitle}` : ""}
          </p>
        </div>

        <div className="card">
          {!esRevision && panel && (
            <>
              <h3 style={{ marginTop: 0 }}>{panelTitle}</h3>
              <div style={{ display: "flex", flexDirection: "column" }}>
                {panel.pasos.map((stepIdx) => (
                  <div key={stepIdx} style={{ marginBottom: 16 }}>
                    <h4 style={{ margin: "0 0 8px", fontSize: "0.95em" }}>{w.passos[stepIdx]?.pregunta}</h4>
                    {renderOpciones(stepIdx)}
                  </div>
                ))}
                {panel.pasos.every((i) => (w.passos[i]?.opciones.length ?? 0) === 0) && (
                  <p className="muted">Completa el paso anterior primero.</p>
                )}
              </div>
            </>
          )}

          {esRevision && (
            <>
              <h3 style={{ marginTop: 0 }}>Revisa tu pedido</h3>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <tbody>
                  {w.passos.map((s, i) => {
                    const opt = s.opciones.find((o) => o.valueId === w.selIdx[i]);
                    return (
                      <tr key={i} style={{ borderBottom: "1px solid #eee" }}>
                        <td style={{ padding: "8px 0", color: "#666" }}>{s.pregunta}</td>
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
                        onChange={(e) => setCantidad(producto.uom === "kg" ? parseFloat(e.target.value) || 0 : parseInt(e.target.value) || 0)}
                        style={{ width: 80, textAlign: "right", padding: "4px 8px", border: "1px solid #ccc", borderRadius: 4 }}
                      />
                      <span style={{ marginLeft: 6, color: "#666" }}>{producto.uom}(s)</span>
                    </td>
                  </tr>
                  {skuFinal && (
                    <tr>
                      <td style={{ padding: "8px 0", color: "#666" }}>SKU final</td>
                      <td style={{ padding: "8px 0", textAlign: "right", fontFamily: "monospace" }}>{skuFinal}</td>
                    </tr>
                  )}
                </tbody>
              </table>

              <div style={{ marginTop: 20 }}>
                <p style={{ fontWeight: "bold", marginBottom: 8 }}>Datos de contacto (opcional)</p>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <input placeholder="Nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} style={{ padding: "8px 12px", border: "1px solid #ccc", borderRadius: 6 }} />
                  <input placeholder="Teléfono" value={telefono} onChange={(e) => setTelefono(e.target.value)} style={{ padding: "8px 12px", border: "1px solid #ccc", borderRadius: 6 }} />
                  <input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} style={{ padding: "8px 12px", border: "1px solid #ccc", borderRadius: 6 }} />
                </div>
              </div>

              {submitError && <p style={{ color: "red", marginTop: 12 }}>{submitError}</p>}
            </>
          )}

          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 24 }}>
            {w.panelActual > 0 ? (
              <button className="btn ghost" onClick={w.retroceder}>← Atrás</button>
            ) : <span />}
            {!esRevision ? (
              <button className="btn primary" onClick={w.avanzar} disabled={!puedeAvanzar}>
                {w.panelActual === w.paneles.length - 1 ? "Revisar →" : "Siguiente →"}
              </button>
            ) : (
              <button className="btn primary" onClick={confirmarPedido} disabled={submitting || !w.passos.every((_, i) => w.selIdx[i] !== undefined)}>
                {submitting ? "Enviando…" : "Confirmar pedido"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
