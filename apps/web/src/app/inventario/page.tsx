"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import AppShell from "@/components/app-shell";
import { api } from "@/lib/api";
import type { Existencia, Movimiento, Ubicacion } from "@/lib/types";

const MOTIVOS = ["apertura", "entrada", "salida", "ajuste", "transferencia", "ensamble", "despacho", "produccion", "consumo"];

export default function InventarioPage() {
  const [exist, setExist] = useState<Existencia[]>([]);
  const [locs, setLocs] = useState<Ubicacion[]>([]);
  const [movs, setMovs] = useState<Movimiento[]>([]);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  const cargar = useCallback(async () => {
    const [e, l, m] = await Promise.all([
      api<Existencia[]>("/inventario/existencia"),
      api<Ubicacion[]>("/inventario/ubicaciones"),
      api<Movimiento[]>("/inventario/movimientos?limit=15"),
    ]);
    setExist(e);
    setLocs(l);
    setMovs(m);
  }, []);

  useEffect(() => {
    cargar().catch((e) => setError(e.message));
  }, [cargar]);

  const notify = (e: Error | null, okMsg: string) => {
    if (e) {
      setError(e.message);
      setMsg("");
    } else {
      setError("");
      setMsg(okMsg);
      cargar().catch(() => undefined);
    }
  };

  // --------------------------------------------------------------- Acciones
  const [accion, setAccion] = useState<"ajustar" | "mover" | "ensamble" | null>(null);
  const [selId, setSelId] = useState<number | null>(null);
  const [cantidad, setCantidad] = useState("");
  const [motivo, setMotivo] = useState("ajuste");
  const [ubiId, setUbiId] = useState("");
  const [ref, setRef] = useState("");
  const [origen, setOrigen] = useState("");
  const [destino, setDestino] = useState("");
  const [cargando, setCargando] = useState(false);

  function abrir(a: "ajustar" | "mover" | "ensamble", v: Existencia) {
    setAccion(a);
    setSelId(v.variantId);
    setCantidad("");
    setMotivo("ajuste");
    setRef("");
    setUbiId(String(locs[0]?.id ?? ""));
    setOrigen(String(locs[0]?.id ?? ""));
    setDestino(String(locs[1]?.id ?? locs[0]?.id ?? ""));
    setError("");
    setMsg("");
  }

  async function ejecutar(e: React.FormEvent) {
    e.preventDefault();
    if (selId === null) return;
    setCargando(true);
    setError("");
    try {
      const qty = Number(cantidad);
      if (accion === "ajustar") {
        const body = { variantId: selId, locationId: Number(ubiId), motivo, cantidad: qty, ref: ref || undefined };
        await api("/inventario/movimiento", { method: "POST", body: JSON.stringify(body) });
        notify(null, "Movimiento registrado.");
      } else if (accion === "mover") {
        await api("/inventario/mover", {
          method: "POST",
          body: JSON.stringify({ variantId: selId, fromLocationId: Number(origen), toLocationId: Number(destino), cantidad: qty, ref: ref || undefined }),
        });
        notify(null, "Transferencia registrada.");
      } else if (accion === "ensamble") {
        await api("/inventario/ensamble", {
          method: "POST",
          body: JSON.stringify({ variantId: selId, locationId: Number(ubiId), cantidad: qty, ref: ref || undefined }),
        });
        notify(null, "Ensamble registrado (se consumieron los componentes exactos).");
      }
      setAccion(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCargando(false);
    }
  }

  const seleccion = exist.find((x) => x.variantId === selId);

  return (
    <AppShell>
      <h2>Inventario</h2>
      <p>
        <Link className="btn ghost" href="/api/inventario/exportar.csv" download="stock.csv" style={{ flex: 0, display: "inline-block" }}>
          Exportar stock (CSV)
        </Link>
      </p>
      {error && <div className="error">{error}</div>}
      {msg && <div className="msg-ok">{msg}</div>}

      <div className="grid-2">
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Cambio de stock</h3>
          <p className="muted small">
            Registra el movimiento en la variante. La alerta de bajo stock se dispara <strong>al momento</strong>, sin esperas.
          </p>
          {!seleccion && <p className="muted">Selecciona una variante de la tabla para operar (Ajustar / Mover / Ensamblar).</p>}
          {seleccion && (
            <>
              <p className="small">
                <strong>{seleccion.producto}</strong> · {seleccion.nombre} ({seleccion.sku}) · Stock: {seleccion.stockActual} {seleccion.uom}
              </p>
              <div className="row">
                <button type="button" className="btn primary" onClick={() => abrir("ajustar", seleccion)}>
                  Ajustar
                </button>
                <button type="button" className="btn primary" onClick={() => abrir("mover", seleccion)}>
                  Mover
                </button>
                <button type="button" className="btn primary" onClick={() => abrir("ensamble", seleccion)}>
                  Ensamblar
                </button>
              </div>
            </>
          )}

          {accion && seleccion && (
            <form className="card" style={{ margin: "12px 0", padding: 16, background: "#fafafa" }} onSubmit={ejecutar}>
              <h4 style={{ marginTop: 0 }}>
                {accion === "ajustar" && `Ajuste de ${seleccion.sku}`}
                {accion === "mover" && `Transferir ${seleccion.sku}`}
                {accion === "ensamble" && `Ensamble de ${seleccion.sku}`}
              </h4>
              {accion === "ajustar" && (
                <>
                  <label>
                    Tipo de movimiento
                    <select value={motivo} onChange={(e) => setMotivo(e.target.value)}>
                      {MOTIVOS.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Ubicación
                    <select value={ubiId} onChange={(e) => setUbiId(e.target.value)}>
                      {locs.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.nombre}
                        </option>
                      ))}
                    </select>
                  </label>
                </>
              )}
              {accion === "mover" && (
                <div className="row">
                  <label>
                    Origen
                    <select value={origen} onChange={(e) => setOrigen(e.target.value)}>
                      {locs.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.nombre}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Destino
                    <select value={destino} onChange={(e) => setDestino(e.target.value)}>
                      {locs.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.nombre}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              )}
              {accion === "ensamble" && (
                <>
                  <label>
                    Ubicación de entrada del terminado
                    <select value={ubiId} onChange={(e) => setUbiId(e.target.value)}>
                      {locs.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.nombre}
                        </option>
                      ))}
                    </select>
                  </label>
                  <p className="muted small">Al ensamblar se consumen los componentes exactos de la BOM (incluso en varios niveles).</p>
                </>
              )}
              <div className="row">
                <label>
                  {accion === "ajustar" && "Cantidad (negativa = sale)"}
                  {accion !== "ajustar" && "Cantidad"}
                  <input type="number" step="0.001" value={cantidad} onChange={(e) => setCantidad(e.target.value)} required />
                </label>
                <label>
                  Referencia (opcional)
                  <input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="ej. venta 001, lote 7" />
                </label>
              </div>
              <div className="row">
                <button className="btn primary" disabled={cargando}>
                  {cargando ? "Guardando…" : "Registrar"}
                </button>
                <button type="button" className="btn ghost" onClick={() => setAccion(null)} style={{ flex: 0 }}>
                  Cancelar
                </button>
              </div>
            </form>
          )}
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0 }}>Últimos movimientos</h3>
          <ul className="step-list" style={{ fontSize: "0.95rem" }}>
            {movs.slice(0, 12).map((m) => (
              <li key={m.id} style={{ padding: "10px 12px" }}>
                <strong>{m.qty > 0 ? "+" : ""}{m.qty}</strong> {m.variant?.sku ?? "—"} · {m.motivo}
                {m.location ? ` (${m.location.nombre})` : ""}
                <div className="small muted">
                  {m.ref ?? ""} · {new Date(m.createdAt).toLocaleString("es-MX")}
                </div>
              </li>
            ))}
            {movs.length === 0 && <li className="muted">Sin movimientos todavía.</li>}
          </ul>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <table className="table">
          <thead>
            <tr>
              <th>Producto / Variante</th>
              <th>Stock</th>
              <th>Min</th>
              <th>Umbral</th>
              <th>Por ubicación</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {exist.map((v) => (
              <tr key={v.variantId} onClick={() => setSelId(v.variantId)} style={{ cursor: v.variantId === selId ? "default" : "pointer", background: v.variantId === selId ? "#fff8e6" : undefined }}>
                <td>
                  <strong>{v.producto}</strong>
                  <div className="small muted">
                    {v.nombre} · {v.sku}
                  </div>
                </td>
                <td>
                  <strong>
                    {v.stockActual} {v.uom}
                  </strong>
                </td>
                <td>{v.stockMin > 0 ? `${v.stockMin} ${v.uom}` : "—"}</td>
                <td className={v.longLead ? "small" : ""}>
                  {v.longLead ? <span className="badge critico">long lead</span> : "—"}
                </td>
                <td className="small muted">
                  {Object.values(v.porUbicacion)
                    .map((l) => `${l.location}: ${l.qty}`)
                    .join(" · ") || "—"}
                </td>
                <td>
                  <span className={`badge ${v.estado}`}>{v.estado}</span>
                </td>
              </tr>
            ))}
            {exist.length === 0 && (
              <tr>
                <td colSpan={6} className="empty">
                  Sin existencias todavía.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}