"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Partner, VarianteBuscada } from "@/lib/types";

interface LineaForm {
  variantId: number;
  sku: string;
  nombre: string;
  producto: string;
  cantidad: string;
  precio: string;
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

  function agregarLinea(v: VarianteBuscada) {
    if (lineas.some((l) => l.variantId === v.id)) return;
    setLineas([
      ...lineas,
      { variantId: v.id, sku: v.sku, nombre: v.nombre, producto: v.producto, cantidad: "1", precio: String(v.precio) },
    ]);
    setBusqVar("");
    setResultados([]);
  }

  function cambiarLinea(i: number, campo: string, valor: string) {
    setLineas(lineas.map((l, j) => (j === i ? { ...l, [campo]: valor } : l)));
  }

  async function crearVenta(e: React.FormEvent) {
    e.preventDefault();
    if (lineas.length === 0) {
      onError("Agrega al menos una variante.");
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
          lines: lineas.map((l) => ({ variantId: l.variantId, cantidad: Number(l.cantidad), precioUnitario: l.precio === "" ? undefined : Number(l.precio) })),
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
        <div key={l.variantId} className="row" style={{ background: "#fafafa", padding: "8px 12px", borderRadius: 8, marginBottom: 6 }}>
          <span style={{ flex: 2 }}>
            <strong>{l.producto}</strong> — {l.nombre} <span className="muted small">({l.sku})</span>
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
