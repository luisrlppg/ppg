"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import type { Passo, PassoOption, ConfiguracionLinea } from "@/lib/types";

interface ProductoBasico {
  id: number;
  nombre: string;
  skuBase: string;
  uom: string;
  basePrice: number;
}

interface PasoUI {
  passo: Passo;
  seleccion: string;
  seleccionVariantId: number | null;
}

export default function TiendaPage() {
  const { productId } = useParams<{ productId: string }>();
  const pid = Number(productId);

  const [producto, setProducto] = useState<ProductoBasico | null>(null);
  const [passos, setPassos] = useState<Passo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [selecciones, setSelecciones] = useState<PasoUI[]>([]);
  const [pasoActual, setPasoActual] = useState(0);
  const [cantidad, setCantidad] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [pedidoNumero, setPedidoNumero] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState("");

  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [email, setEmail] = useState("");

  const carregar = useCallback(async () => {
    try {
      const [p, ps] = await Promise.all([
        api<ProductoBasico>(`/productos/${pid}`),
        api<Passo[]>(`/public/productos/${pid}/pasos`),
      ]);
      setProducto(p);
      const attrSteps = ps.filter((s) => !s.isQtyStep);
      setPassos(attrSteps);
      setSelecciones(attrSteps.map((s) => ({
        passo: s,
        seleccion: "",
        seleccionVariantId: null,
      })));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [pid]);

  useEffect(() => { carregar(); }, [carregar]);

  const passosAtributo = passos;
  const totalPasos = passosAtributo.length + 1;

  function seleccionarOpcion(pasoIdx: number, opt: PassoOption) {
    setSelecciones((prev) => {
      const next = [...prev];
      next[pasoIdx] = { ...next[pasoIdx], seleccion: opt.valor, seleccionVariantId: opt.variantId };
      return next;
    });
  }

  function opcionesDelPaso(pasoIdx: number): PassoOption[] {
    const paso = passosAtributo[pasoIdx];
    if (!paso) return [];

    if (pasoIdx === 0) return paso.opciones;

    let compatibles: Set<number> | undefined;
    for (let i = 0; i < pasoIdx; i++) {
      const selVid = selecciones[i]?.seleccionVariantId;
      if (selVid === null || selVid === undefined) continue;
      const variantesDeEsteValor = new Set(
        passosAtributo[i].opciones.filter((o) => o.variantId === selVid).map((o) => o.variantId),
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

  function puedeAvanzar(): boolean {
    if (pasoActual < passosAtributo.length) {
      return !!selecciones[pasoActual]?.seleccion;
    }
    return cantidad > 0;
  }

  function variantIdFinal(): number | null {
    const last = selecciones[selecciones.length - 1];
    return last?.seleccionVariantId ?? null;
  }

  function variantSkuFinal(): string {
    const last = selecciones[selecciones.length - 1];
    if (!last?.seleccionVariantId) return "";
    const opt = last.passo.opciones.find((o) => o.variantId === last.seleccionVariantId);
    return opt?.sku ?? "";
  }

  async function confirmarPedido() {
    const vid = variantIdFinal();
    if (!vid) { setSubmitError("No se ha seleccionado una configuración válida."); return; }
    setSubmitting(true);
    setSubmitError("");
    try {
      const pasosConfig = selecciones.map((s, i) => {
        const attrsForThisVariant = passosAtributo[i].opciones.filter((o) => o.variantId === s.seleccionVariantId);
        const valores = [...new Set(attrsForThisVariant.map((o) => o.valor))];
        return {
          pregunta: s.passo.pregunta,
          opciones: valores,
          seleccion: s.seleccion,
        };
      });
      const cfg: ConfiguracionLinea = { pasos: pasosConfig };
      const r = await api<{ numero: string }>("public/orders", {
        method: "POST",
        body: JSON.stringify({
          nombre: nombre || undefined,
          telefono: telefono || undefined,
          email: email || undefined,
          lines: [{ variantId: vid, cantidad, configuracion: JSON.stringify(cfg) }],
        }),
      });
      setPedidoNumero(r.numero);
    } catch (e) {
      setSubmitError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: "center" }}>
        <p>Cargando producto…</p>
      </div>
    );
  }

  if (error || !producto) {
    return (
      <div style={{ padding: 40, textAlign: "center" }}>
        <p style={{ color: "red" }}>{error || "Producto no encontrado."}</p>
      </div>
    );
  }

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

  const pasoIdx = pasoActual;
  const paso = passosAtributo[pasoIdx];
  const esRevision = pasoActual === passosAtributo.length;

  return (
    <div style={{ minHeight: "100vh", background: "#f5f5f5" }}>
      <div style={{ background: "white", borderBottom: "1px solid #ddd", padding: "12px 24px" }}>
        <div style={{ maxWidth: 700, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontWeight: "bold", fontSize: "1.1em" }}>PPG ERP</span>
          <a href="/productos" style={{ color: "var(--primary)", textDecoration: "none" }}>Admin</a>
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
              <div key={i} style={{
                flex: 1, height: 4, borderRadius: 2,
                background: i <= pasoActual ? "var(--primary)" : "#ddd",
              }} />
            ))}
          </div>
          <p className="muted small" style={{ marginTop: 6 }}>
            Paso {Math.min(pasoActual + 1, totalPasos)} de {totalPasos}
            {esRevision ? " — Revisar" : ` — ${paso?.pregunta ?? ""}`}
          </p>
        </div>

        <div className="card">
          {!esRevision && paso && (
            <>
              <h3 style={{ marginTop: 0 }}>{paso.pregunta}</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {opcionesDelPaso(pasoIdx).length === 0 && (
                  <p className="muted">Completa el paso anterior primero.</p>
                )}
                {opcionesDelPaso(pasoIdx).map((opt) => {
                  const sel = selecciones[pasoIdx]?.seleccionVariantId === opt.variantId;
                  return (
                    <button
                      key={`${opt.variantId}-${opt.valueId}`}
                      onClick={() => seleccionarOpcion(pasoIdx, opt)}
                      style={{
                        padding: "12px 16px",
                        border: sel ? "2px solid var(--primary)" : "1px solid #ccc",
                        borderRadius: 8,
                        background: sel ? "#eff6ff" : "white",
                        cursor: "pointer",
                        textAlign: "left",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <span style={{ fontWeight: sel ? "bold" : "normal" }}>{opt.valor}</span>
                      <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        {opt.enStock ? (
                          <span style={{ fontSize: "0.8em", color: "var(--success)" }}>En stock</span>
                        ) : (
                          <span style={{ fontSize: "0.8em", color: "var(--warning)" }}>Sin stock</span>
                        )}
                        <span className="muted small">{opt.sku}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {esRevision && (
            <>
              <h3 style={{ marginTop: 0 }}>Revisa tu pedido</h3>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <tbody>
                  {selecciones.map((s, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid #eee" }}>
                      <td style={{ padding: "8px 0", color: "#666" }}>{s.passo.pregunta}</td>
                      <td style={{ padding: "8px 0", textAlign: "right", fontWeight: "bold" }}>{s.seleccion}</td>
                    </tr>
                  ))}
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
                  <tr>
                    <td style={{ padding: "8px 0", color: "#666" }}>SKU final</td>
                    <td style={{ padding: "8px 0", textAlign: "right", fontFamily: "monospace" }}>{variantSkuFinal()}</td>
                  </tr>
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
            {pasoActual > 0 ? (
              <button className="btn ghost" onClick={() => setPasoActual(pasoActual - 1)}>
                ← Atrás
              </button>
            ) : <span />}
            {!esRevision ? (
              <button
                className="btn primary"
                onClick={() => setPasoActual(pasoActual + 1)}
                disabled={!puedeAvanzar()}
              >
                {pasoActual === passosAtributo.length - 1 ? "Revisar →" : "Siguiente →"}
              </button>
            ) : (
              <button
                className="btn primary"
                onClick={confirmarPedido}
                disabled={submitting || !variantIdFinal()}
              >
                {submitting ? "Enviando…" : "Confirmar pedido"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
