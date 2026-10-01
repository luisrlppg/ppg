"use client";

import { useCallback, useEffect, useState } from "react";
import AppShell from "@/components/app-shell";
import PageHeader from "@/components/ui/page-header";
import HelpNote from "@/components/ui/help-note";
import Modal from "@/components/ui/modal";
import Segmented from "@/components/ui/segmented";
import { api } from "@/lib/api";
import type { Existencia, Movimiento, Ubicacion } from "@/lib/types";

const MOTIVOS = ["entrada", "salida", "ajuste", "apertura"];

type Accion = "movimiento" | "mover" | "ensamble";
type Vista = "variante" | "matriz";

export default function InventarioPage() {
  const [exist, setExist] = useState<Existencia[]>([]);
  const [locs, setLocs] = useState<Ubicacion[]>([]);
  const [movs, setMovs] = useState<Movimiento[]>([]);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [vista, setVista] = useState<Vista>("matriz");
  const [busqueda, setBusqueda] = useState("");

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
  const [accion, setAccion] = useState<Accion | null>(null);
  const [selId, setSelId] = useState<number | null>(null);
  const [cantidad, setCantidad] = useState("");
  const [motivo, setMotivo] = useState("entrada");
  const [ubiId, setUbiId] = useState("");
  const [ref, setRef] = useState("");
  const [origen, setOrigen] = useState("");
  const [destino, setDestino] = useState("");
  const [cargando, setCargando] = useState(false);

  function abrir(a: Accion, variantId?: number) {
    setAccion(a);
    setSelId(variantId ?? null);
    setCantidad("");
    setMotivo(a === "movimiento" ? "entrada" : "ajuste");
    setRef("");
    setUbiId(String(locs[0]?.id ?? ""));
    setOrigen(String(locs[0]?.id ?? ""));
    setDestino(String(locs[1]?.id ?? locs[0]?.id ?? ""));
    setError("");
    setMsg("");
  }

  function cerrarAccion() {
    setAccion(null);
    setSelId(null);
  }

  async function ejecutar(e: React.FormEvent) {
    e.preventDefault();
    if (selId === null) {
      setError("Selecciona una variante.");
      return;
    }
    setCargando(true);
    setError("");
    try {
      const qty = Number(cantidad);
      if (accion === "movimiento") {
        await api("/inventario/movimiento", {
          method: "POST",
          body: JSON.stringify({ variantId: selId, locationId: Number(ubiId), motivo, cantidad: qty, ref: ref || undefined }),
        });
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
      cerrarAccion();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCargando(false);
    }
  }

  // ---------------------------------------------------------- Nueva ubicación
  const [showUbi, setShowUbi] = useState(false);
  const [ubiNombre, setUbiNombre] = useState("");
  const [ubiTipo, setUbiTipo] = useState("almacen");

  async function crearUbicacion(e: React.FormEvent) {
    e.preventDefault();
    if (!ubiNombre.trim()) return;
    try {
      await api("/inventario/ubicaciones", { method: "POST", body: JSON.stringify({ nombre: ubiNombre.trim(), tipo: ubiTipo }) });
      setShowUbi(false);
      setUbiNombre("");
      notify(null, "Ubicación creada.");
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const seleccion = exist.find((x) => x.variantId === selId);
  const filtradas = exist.filter((v) => {
    if (!busqueda.trim()) return true;
    const q = busqueda.toLowerCase();
    return v.producto.toLowerCase().includes(q) || v.nombre.toLowerCase().includes(q) || v.sku.toLowerCase().includes(q);
  });
  const qtyEn = (v: Existencia, locId: number) => v.porUbicacion[locId]?.qty ?? 0;

  return (
    <AppShell>
      {error && <div className="error">{error}</div>}
      {msg && <div className="msg-ok">{msg}</div>}

      <PageHeader
        title="Inventario"
        subtitle="Existencia por producto y ubicación. Registra entradas, transferencias y ensambles."
        actions={
          <>
            <a className="btn secondary sm" href="/api/inventario/exportar.csv" download="stock.csv">
              Exportar CSV
            </a>
            <button className="btn ghost sm" onClick={() => setShowUbi(true)}>
              + Ubicación
            </button>
          </>
        }
      />

      <HelpNote>
        La alerta de bajo stock se dispara <strong>al momento</strong> de cada movimiento. Un ajuste negativo no puede
        dejar el stock por debajo de cero.
      </HelpNote>

      <div className="toolbar">
        <button className="btn primary" onClick={() => abrir("movimiento")}>
          + Entrada / ajuste
        </button>
        <button className="btn secondary" onClick={() => abrir("mover")}>
          Transferir
        </button>
        <button className="btn secondary" onClick={() => abrir("ensamble")}>
          Ensamblar
        </button>
        <div className="grow" />
        <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar producto, variante o SKU…" style={{ maxWidth: 300 }} />
        <Segmented
          value={vista}
          onChange={(v) => setVista(v as Vista)}
          options={[
            { value: "variante", label: "Por variante" },
            { value: "matriz", label: "Matriz por ubicación" },
          ]}
        />
      </div>

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div className="table-wrap">
          {vista === "variante" ? (
            <table className="table">
              <thead>
                <tr>
                  <th>Producto / Variante</th>
                  <th className="num">Stock</th>
                  <th className="num">Mín</th>
                  <th>Ubicaciones</th>
                  <th>Estado</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtradas.map((v) => (
                  <tr key={v.variantId}>
                    <td>
                      <strong>{v.producto}</strong>
                      <div className="small muted">
                        {v.nombre} · {v.sku}
                      </div>
                    </td>
                    <td className="num">
                      <strong>
                        {v.stockActual} {v.uom}
                      </strong>
                    </td>
                    <td className="num">{v.stockMin > 0 ? `${v.stockMin} ${v.uom}` : "—"}</td>
                    <td className="small muted">
                      {Object.values(v.porUbicacion)
                        .map((l) => `${l.location}: ${l.qty}`)
                        .join(" · ") || "—"}
                    </td>
                    <td>
                      <span className={`badge ${v.estado}`}>{v.estado}</span>
                    </td>
                    <td>
                      <div className="row-actions">
                        <button className="btn ghost sm" onClick={() => abrir("movimiento", v.variantId)}>
                          Agregar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filtradas.length === 0 && (
                  <tr>
                    <td colSpan={6} className="empty">Sin existencias que coincidan.</td>
                  </tr>
                )}
              </tbody>
            </table>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Producto / Variante</th>
                  {locs.map((l) => (
                    <th key={l.id} className="num">
                      {l.nombre}
                    </th>
                  ))}
                  <th className="num">Total</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {filtradas.map((v) => (
                  <tr key={v.variantId}>
                    <td>
                      <strong>{v.producto}</strong>
                      <div className="small muted">
                        {v.nombre} · {v.sku}
                      </div>
                    </td>
                    {locs.map((l) => {
                      const q = qtyEn(v, l.id);
                      return (
                        <td key={l.id} className={`num ${q === 0 ? "matrix-cell-0" : ""}`}>
                          {q === 0 ? "—" : q}
                        </td>
                      );
                    })}
                    <td className="num">
                      <strong>{v.stockActual}</strong>
                    </td>
                    <td>
                      <span className={`badge ${v.estado}`}>{v.estado}</span>
                    </td>
                  </tr>
                ))}
                {filtradas.length === 0 && (
                  <tr>
                    <td colSpan={locs.length + 3} className="empty">Sin existencias que coincidan.</td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Últimos movimientos</h3>
        <ul className="step-list" style={{ fontSize: "0.95rem" }}>
          {movs.slice(0, 12).map((m) => (
            <li key={m.id} style={{ padding: "10px 12px" }}>
              <strong>
                {m.qty > 0 ? "+" : ""}
                {m.qty}
              </strong>{" "}
              {m.variant?.sku ?? "—"} · {m.motivo}
              {m.location ? ` (${m.location.nombre})` : ""}
              <div className="small muted">
                {m.ref ?? ""} · {new Date(m.createdAt).toLocaleString("es-MX")}
              </div>
            </li>
          ))}
          {movs.length === 0 && <li className="muted">Sin movimientos todavía.</li>}
        </ul>
      </div>

      {/* --- Modal: movimiento / transferencia / ensamble --- */}
      {accion && (
        <Modal
          title={
            accion === "movimiento" ? "Entrada / ajuste de stock" : accion === "mover" ? "Transferir entre ubicaciones" : "Registrar ensamble"
          }
          onClose={cerrarAccion}
        >
          <form onSubmit={ejecutar}>
            <label>
              Variante
              <select value={selId ?? ""} onChange={(e) => setSelId(e.target.value ? Number(e.target.value) : null)} required>
                <option value="">— Elegir —</option>
                {exist.map((v) => (
                  <option key={v.variantId} value={v.variantId}>
                    {v.producto} · {v.nombre} ({v.sku})
                  </option>
                ))}
              </select>
            </label>
            {seleccion && (
              <p className="muted small" style={{ margin: "0 0 8px" }}>
                <strong>{seleccion.producto}</strong> · {seleccion.nombre} ({seleccion.sku}) · Stock total: {seleccion.stockActual} {seleccion.uom}
              </p>
            )}

            {accion === "movimiento" && (
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
                {accion === "movimiento" ? "Cantidad (negativa = sale)" : "Cantidad"}
                <input type="number" step="0.001" value={cantidad} onChange={(e) => setCantidad(e.target.value)} required />
              </label>
              <label>
                Referencia (opcional)
                <input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="ej. venta 001, lote 7" />
              </label>
            </div>

            <div className="row" style={{ justifyContent: "flex-end" }}>
              <button type="button" className="btn ghost" onClick={cerrarAccion}>
                Cancelar
              </button>
              <button className="btn primary" disabled={cargando}>
                {cargando ? "Guardando…" : "Registrar"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* --- Modal: nueva ubicación --- */}
      {showUbi && (
        <Modal title="Nueva ubicación" onClose={() => setShowUbi(false)} size="sm">
          <form onSubmit={crearUbicacion}>
            <label>
              Nombre
              <input value={ubiNombre} onChange={(e) => setUbiNombre(e.target.value)} placeholder="ej. Almacén 2, Piso producción" required autoFocus />
            </label>
            <label>
              Tipo
              <select value={ubiTipo} onChange={(e) => setUbiTipo(e.target.value)}>
                <option value="almacen">Almacén</option>
                <option value="temporal">Temporal</option>
              </select>
            </label>
            <div className="row" style={{ justifyContent: "flex-end" }}>
              <button type="button" className="btn ghost" onClick={() => setShowUbi(false)}>
                Cancelar
              </button>
              <button className="btn primary">Crear ubicación</button>
            </div>
          </form>
        </Modal>
      )}
    </AppShell>
  );
}
