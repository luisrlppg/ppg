"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Partner, ProductoPublico } from "@/lib/types";
import ModalConfigVariante, { type LineaConfigurada } from "./modal-config-variante";

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
  const [lineas, setLineas] = useState<LineaConfigurada[]>([]);
  const [productos, setProductos] = useState<ProductoPublico[]>([]);
  const [guardando, setGuardando] = useState(false);
  const [configurando, setConfigurando] = useState<{ producto: ProductoPublico; idx: number | null } | null>(null);

  useEffect(() => {
    api<Partner[]>("/clientes").then(setClientes).catch(() => setClientes([]));
    api<ProductoPublico[]>("/public/productos").then(setProductos).catch(() => setProductos([]));
  }, []);

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
  }

  async function crearVenta(e: React.FormEvent) {
    e.preventDefault();
    if (lineas.length === 0) {
      onError("Selecciona al menos un producto y configúralo.");
      return;
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
    } catch (err) {
      onError((err as Error).message);
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

      <h4 style={{ marginBottom: 4 }}>Productos a vender</h4>
      {productos.length === 0 ? (
        <p className="muted">No hay productos públicos disponibles.</p>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12, marginTop: 8 }}>
          {productos.map((p) => (
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

      {lineas.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <h4 style={{ marginBottom: 8 }}>Líneas de la venta</h4>
          {lineas.map((l, i) => (
            <div key={i} style={{ background: "#fafafa", padding: "8px 12px", borderRadius: 8, marginBottom: 6 }}>
              <div className="row" style={{ alignItems: "center" }}>
                <button
                  type="button"
                  className="btn ghost"
                  style={{ flex: 2, textAlign: "left", background: "#fff", padding: "8px 12px" }}
                  onClick={() => abrirConfig(productos.find((p) => p.productId === l.productId)!, i)}
                  title="Clic para reconfigurar"
                >
                  <strong>{l.producto}</strong> — {l.sku}
                </button>
                <label style={{ flex: 0.7 }}>
                  Cantidad
                  <input type="number" step="0.001" min="0.001" value={l.cantidad} onChange={(e) => setLineas(lineas.map((x, j) => (j === i ? { ...x, cantidad: e.target.value } : x)))} />
                </label>
                <button type="button" className="btn ghost" style={{ flex: 0 }} onClick={() => setLineas(lineas.filter((_, j) => j !== i))}>
                  Quitar
                </button>
              </div>
              <p className="muted small" style={{ margin: "4px 0 0" }}>Clic en la línea para reconfigurar.</p>
            </div>
          ))}
        </div>
      )}
      {lineas.length === 0 && <p className="muted">Selecciona un producto y confíguralo para agregarlo a la venta.</p>}

      <div className="row">
        <button className="btn primary block" disabled={guardando || lineas.length === 0}>
          {guardando ? "Guardando…" : "Guardar venta"}
        </button>
      </div>

      {configurando && (
        <ModalConfigVariante
          producto={configurando.producto}
          lineaInicial={configurando.idx !== null && lineas[configurando.idx] ? lineas[configurando.idx] : undefined}
          onConfirmar={guardarLinea}
          onCerrar={() => setConfigurando(null)}
        />
      )}
    </form>
  );
}
