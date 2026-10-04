"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { api } from "@/lib/api";
import type { Partner, ProductoPublico } from "@/lib/types";
import ClienteFormModal from "@/components/clientes/cliente-form-modal";
import ModalConfigVariante, { type LineaConfigurada } from "./modal-config-variante";

interface Props {
  onCreada: (id: number) => void;
  onError: (msg: string) => void;
  onMsg: (msg: string) => void;
}

type Paso = 1 | 2 | 3;

const filaSeleccionable = (sel: boolean): CSSProperties => ({
  display: "flex",
  flexDirection: "column",
  gap: 2,
  textAlign: "left",
  width: "100%",
  padding: "10px 14px",
  borderRadius: 8,
  border: sel ? "2px solid var(--brand)" : "1px solid var(--line)",
  background: sel ? "#eff6ff" : "#fff",
  cursor: "pointer",
});

export default function NuevaVenta({ onCreada, onError, onMsg }: Props) {
  const [paso, setPaso] = useState<Paso>(1);

  const [clientes, setClientes] = useState<Partner[]>([]);
  const [partnerId, setPartnerId] = useState("");
  const [busquedaCliente, setBusquedaCliente] = useState("");
  const [mostrarNuevoCliente, setMostrarNuevoCliente] = useState(false);

  const [productos, setProductos] = useState<ProductoPublico[]>([]);
  const [busquedaProducto, setBusquedaProducto] = useState("");
  const [lineas, setLineas] = useState<LineaConfigurada[]>([]);

  const [guardando, setGuardando] = useState(false);
  const [configurando, setConfigurando] = useState<{ producto: ProductoPublico; idx: number | null } | null>(null);

  useEffect(() => {
    api<Partner[]>("/clientes").then(setClientes).catch(() => setClientes([]));
    api<ProductoPublico[]>("/public/productos").then(setProductos).catch(() => setProductos([]));
  }, []);

  const clienteSeleccionado = clientes.find((c) => String(c.id) === partnerId) ?? null;

  const clientesFiltrados = useMemo(() => {
    const q = busquedaCliente.trim().toLowerCase();
    if (!q) return clientes;
    return clientes.filter((c) =>
      [c.nombre, c.empresa, c.telefono, c.email].some((v) => (v ?? "").toLowerCase().includes(q)),
    );
  }, [clientes, busquedaCliente]);

  const productosFiltrados = useMemo(() => {
    const q = busquedaProducto.trim().toLowerCase();
    if (!q) return productos;
    return productos.filter((p) => [p.nombre, p.skuBase].some((v) => (v ?? "").toLowerCase().includes(q)));
  }, [productos, busquedaProducto]);

  function abrirConfig(producto: ProductoPublico, idx: number | null) {
    setConfigurando({ producto, idx });
  }

  function guardarLinea(linea: LineaConfigurada) {
    setLineas((prev) => {
      if (configurando && configurando.idx !== null) {
        return prev.map((l, j) => (j === configurando.idx ? { ...l, ...linea } : l));
      }
      if (prev.some((l) => l.variantId === linea.variantId && l.productId === linea.productId)) return prev;
      return [...prev, linea];
    });
    setPaso(3);
  }

  function clienteCreado(c: Partner) {
    setClientes((prev) => [...prev, c].sort((a, b) => a.nombre.localeCompare(b.nombre)));
    setPartnerId(String(c.id));
    setMostrarNuevoCliente(false);
  }

  async function crearVenta() {
    if (lineas.length === 0) {
      onError("Selecciona al menos un producto y confíguralo.");
      return;
    }
    setGuardando(true);
    onError("");
    try {
      const v = await api<{ id: number }>("/ventas", {
        method: "POST",
        body: JSON.stringify({
          partnerId: partnerId ? Number(partnerId) : undefined,
          lines: lineas.map((l) => ({
            variantId: l.configVariantId ?? l.variantId,
            cantidad: Number(l.cantidad),
            configuracion: l.configuracion ? JSON.stringify(l.configuracion) : undefined,
          })),
        }),
      });
      onMsg("Venta registrada. Revisa el seguimiento y confírmala cuando esté lista.");
      setLineas([]);
      setPartnerId("");
      setBusquedaCliente("");
      setBusquedaProducto("");
      setPaso(1);
      onCreada(v.id);
    } catch (err) {
      onError((err as Error).message);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", maxHeight: "76vh", minHeight: 360 }}>
      <div className="stepper" style={{ flexShrink: 0, marginTop: 0 }}>
        <div className={`step ${paso === 1 ? "current" : "done"}`}>
          <span className="num">1</span> Cliente
        </div>
        <div className={`step ${paso === 2 ? "current" : paso > 2 ? "done" : ""}`}>
          <span className="num">2</span> Producto
        </div>
        <div className={`step ${paso === 3 ? "current" : ""}`}>
          <span className="num">3</span> Revisión
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", paddingRight: 4 }}>
        {/* ------------------------------------------------------ Paso 1: cliente */}
        {paso === 1 && (
          <>
            <div className="row" style={{ alignItems: "flex-end" }}>
              <label style={{ flex: 1 }}>
                Buscar cliente
                <input
                  value={busquedaCliente}
                  onChange={(e) => setBusquedaCliente(e.target.value)}
                  placeholder="Nombre, empresa, teléfono o email…"
                />
              </label>
              <button type="button" className="btn ghost" style={{ flex: 0 }} onClick={() => setMostrarNuevoCliente(true)}>
                + Nuevo cliente
              </button>
            </div>

            <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
              <button type="button" onClick={() => setPartnerId("")} style={filaSeleccionable(partnerId === "")}>
                <strong>Sin asignar</strong>
                <span className="muted small">Puedes asignar el cliente más tarde.</span>
              </button>
              {clientesFiltrados.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setPartnerId(String(c.id))}
                  style={filaSeleccionable(partnerId === String(c.id))}
                >
                  <strong>{c.nombre}</strong>
                  <span className="muted small">{[c.empresa, c.telefono, c.email].filter(Boolean).join(" · ") || "—"}</span>
                </button>
              ))}
              {clientesFiltrados.length === 0 && (
                <p className="muted">Sin coincidencias. Puedes crear el cliente con “+ Nuevo cliente”.</p>
              )}
            </div>
          </>
        )}

        {/* ----------------------------------------------------- Paso 2: producto */}
        {paso === 2 && (
          <>
            <label>
              Buscar producto
              <input
                value={busquedaProducto}
                onChange={(e) => setBusquedaProducto(e.target.value)}
                placeholder="Nombre o SKU…"
              />
            </label>

            {productosFiltrados.length === 0 ? (
              <p className="muted" style={{ marginTop: 12 }}>No hay productos públicos disponibles.</p>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12, marginTop: 12 }}>
                {productosFiltrados.map((p) => (
                  <div key={p.productId} className="card" style={{ margin: 0, display: "flex", flexDirection: "column", justifyContent: "space-between", gap: 10 }}>
                    <div>
                      <strong>{p.nombre}</strong>
                      <div className="muted small">{p.skuBase} · {p.uom}</div>
                    </div>
                    <button type="button" className="btn primary sm" onClick={() => abrirConfig(p, null)}>
                      Configurar
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ---------------------------------------------------- Paso 3: revisión */}
        {paso === 3 && (
          <>
            <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
              <h4 style={{ margin: 0 }}>Productos de la venta</h4>
              <button type="button" className="btn ghost" onClick={() => setPaso(2)}>
                + Agregar producto
              </button>
            </div>
            <p className="muted small" style={{ marginTop: 4 }}>
              Cliente: <strong>{clienteSeleccionado?.nombre ?? "Sin asignar"}</strong>
            </p>

            {lineas.length === 0 ? (
              <p className="muted">Aún no has agregado productos.</p>
            ) : (
              <div style={{ marginTop: 8 }}>
                {lineas.map((l, i) => {
                  const p = productos.find((x) => x.productId === l.productId);
                  return (
                    <div key={i} style={{ background: "#fafafa", padding: "8px 12px", borderRadius: 8, marginBottom: 6 }}>
                      <div className="row" style={{ alignItems: "center" }}>
                        <button
                          type="button"
                          className="btn ghost"
                          style={{ flex: 2, textAlign: "left", background: "#fff", padding: "8px 12px" }}
                          onClick={() => p && abrirConfig(p, i)}
                          title="Clic para reconfigurar"
                        >
                          <strong>{l.producto}</strong> — {l.sku}
                        </button>
                        <label style={{ flex: 0.7 }}>
                          Cantidad
                          <input
                            type="number"
                            step="0.001"
                            min="0.001"
                            value={l.cantidad}
                            onChange={(e) => setLineas(lineas.map((x, j) => (j === i ? { ...x, cantidad: e.target.value } : x)))}
                          />
                        </label>
                        <button type="button" className="btn ghost" style={{ flex: 0 }} onClick={() => setLineas(lineas.filter((_, j) => j !== i))}>
                          Quitar
                        </button>
                      </div>
                      <p className="muted small" style={{ margin: "4px 0 0" }}>Clic en la línea para reconfigurar.</p>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>

      <div
        style={{
          flexShrink: 0,
          borderTop: "1px solid var(--line)",
          marginTop: 12,
          paddingTop: 12,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 8,
        }}
      >
        {paso === 1 && (
          <>
            <span className="muted small">
              Cliente: <strong>{clienteSeleccionado?.nombre ?? "Sin asignar"}</strong>
            </span>
            <button type="button" className="btn primary" onClick={() => setPaso(2)}>
              Continuar →
            </button>
          </>
        )}
        {paso === 2 && (
          <>
            <button type="button" className="btn ghost" onClick={() => setPaso(1)}>
              ← Atrás
            </button>
            {lineas.length > 0 && (
              <button type="button" className="btn" onClick={() => setPaso(3)}>
                Ver líneas ({lineas.length})
              </button>
            )}
          </>
        )}
        {paso === 3 && (
          <>
            <button type="button" className="btn ghost" onClick={() => setPaso(2)}>
              ← Atrás
            </button>
            <button type="button" className="btn primary" disabled={guardando || lineas.length === 0} onClick={crearVenta}>
              {guardando ? "Guardando…" : "Guardar venta"}
            </button>
          </>
        )}
      </div>

      {mostrarNuevoCliente && (
        <ClienteFormModal cliente={null} onGuardado={clienteCreado} onCerrar={() => setMostrarNuevoCliente(false)} />
      )}

      {configurando && (
        <ModalConfigVariante
          producto={configurando.producto}
          lineaInicial={configurando.idx !== null && lineas[configurando.idx] ? lineas[configurando.idx] : undefined}
          onConfirmar={guardarLinea}
          onCerrar={() => setConfigurando(null)}
        />
      )}
    </div>
  );
}
