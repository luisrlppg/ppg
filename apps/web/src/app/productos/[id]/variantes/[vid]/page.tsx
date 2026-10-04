"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import AppShell from "@/components/app-shell";
import PageHeader from "@/components/ui/page-header";
import ConfirmDialog from "@/components/ui/confirm-dialog";
import EmpaquesVariante from "@/components/productos/empaques-variante";
import { api } from "@/lib/api";
import type { ExistenciaDe, Packaging } from "@/lib/types";

export default function VariantePage() {
  const { id, vid } = useParams<{ id: string; vid: string }>();
  const router = useRouter();
  const prodId = Number(id);
  const variantId = Number(vid);

  const [v, setV] = useState<ExistenciaDe | null>(null);
  const [empaques, setEmpaques] = useState<Packaging[]>([]);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  // Campos editables
  const [nombre, setNombre] = useState("");
  const [precio, setPrecio] = useState("");
  const [stockMin, setStockMin] = useState("");
  const [stockMax, setStockMax] = useState("");
  const [notas, setNotas] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [confirmElim, setConfirmElim] = useState(false);
  const [bloqueo, setBloqueo] = useState<string | null>(null);
  const [eliminando, setEliminando] = useState(false);

  const cargar = useCallback(async () => {
    const data = await api<ExistenciaDe>(`/inventario/existencia/${variantId}`);
    setV(data);
    setNombre(data.nombre);
    setPrecio(data.price === null ? "" : String(data.price));
    setStockMin(String(data.stockMin));
    setStockMax(String(data.stockMax));
    setNotas(data.notas ?? "");
  }, [variantId]);

  useEffect(() => {
    if (!Number.isFinite(variantId)) return;
    cargar().catch((e) => setError((e as Error).message));
    api<Packaging[]>("/catalogos/empaques").then(setEmpaques).catch(() => setEmpaques([]));
  }, [cargar, variantId]);

  const notify = (e: Error | null, okMsg: string) => {
    if (e) { setError(e.message); setMsg(""); }
    else { setError(""); setMsg(okMsg); }
  };

  const refrescarEmpaques = useCallback(async () => {
    try { setEmpaques(await api<Packaging[]>("/catalogos/empaques")); } catch { /* noop */ }
  }, []);

  async function guardar() {
    setGuardando(true);
    try {
      await api(`/productos/variantes/${variantId}`, {
        method: "PATCH",
        body: JSON.stringify({
          nombre: nombre.trim(),
          stockMin: Number(stockMin) || 0,
          stockMax: Number(stockMax) || 0,
          notas: notas.trim() || null,
        }),
      });
      if (precio !== "" && Number(precio) !== v?.price) {
        await api(`/productos/variantes/${variantId}/precio`, {
          method: "PATCH",
          body: JSON.stringify({ price: Number(precio) }),
        });
      }
      await cargar();
      notify(null, "Variante actualizada.");
    } catch (e) { notify(e as Error, ""); }
    finally { setGuardando(false); }
  }

  async function toggle(campo: "longLead" | "activo") {
    try {
      await api(`/productos/variantes/${variantId}`, { method: "PATCH", body: JSON.stringify({ [campo]: !v?.[campo] }) });
      await cargar();
      notify(null, "Variante actualizada.");
    } catch (e) { notify(e as Error, ""); }
  }

  async function eliminar() {
    setEliminando(true);
    try {
      await api(`/productos/variantes/${variantId}`, { method: "DELETE" });
      router.push(`/productos/${prodId}`);
    } catch (e) {
      setConfirmElim(false);
      setBloqueo((e as Error).message);
    } finally { setEliminando(false); }
  }

  if (!v) {
    return (
      <AppShell>
        {error && <div className="error">{error}</div>}
        <p className="muted">Cargando variante…</p>
      </AppShell>
    );
  }

  return (
    <AppShell>
      {error && <div className="error">{error}</div>}
      {msg && <div className="msg-ok">{msg}</div>}

      <PageHeader
        breadcrumb={[
          { label: "Productos", href: "/productos" },
          { label: v.producto, href: `/productos/${prodId}` },
          { label: v.nombre },
        ]}
        title={v.nombre}
        subtitle={`SKU: ${v.sku} · ${v.producto} · UOM: ${v.uom}`}
        actions={
          <button type="button" className="btn danger" onClick={() => setConfirmElim(true)}>
            Eliminar variante
          </button>
        }
      />

      {/* --- Datos --- */}
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Datos</h3>
        <div className="row">
          <label>
            Nombre
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} />
          </label>
          <label>
            Precio (neto, sin IVA)
            <input type="number" step="0.01" min="0" value={precio} onChange={(e) => setPrecio(e.target.value)} placeholder={v.basePrice ? String(v.basePrice) : ""} />
          </label>
        </div>
        <div className="row">
          <label>
            Stock mín
            <input type="number" step="0.001" min="0" value={stockMin} onChange={(e) => setStockMin(e.target.value)} />
          </label>
          <label>
            Stock máx
            <input type="number" step="0.001" min="0" value={stockMax} onChange={(e) => setStockMax(e.target.value)} />
          </label>
        </div>
        <label>
          Notas (interno)
          <textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={3} placeholder="ej. medidas: 8x23" />
        </label>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <div className="row" style={{ gap: 16 }}>
            <label className="row" style={{ gap: 6, alignItems: "center" }}>
              <input type="checkbox" checked={v.longLead} onChange={() => toggle("longLead")} style={{ width: "auto" }} />
              Crítico (long lead)
            </label>
            <label className="row" style={{ gap: 6, alignItems: "center" }}>
              <input type="checkbox" checked={v.activo} onChange={() => toggle("activo")} style={{ width: "auto" }} />
              Activa
            </label>
          </div>
          <button type="button" className="btn primary" disabled={guardando} onClick={guardar}>
            {guardando ? "Guardando…" : "Guardar cambios"}
          </button>
        </div>
      </div>

      {/* --- Existencia --- */}
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <table className="table">
          <thead>
            <tr>
              <th>Ubicación</th>
              <th className="num">Cantidad</th>
            </tr>
          </thead>
          <tbody>
            {v.porUbicacion.map((l) => (
              <tr key={l.locationId}>
                <td>{l.location}</td>
                <td className="num">{l.qty}</td>
              </tr>
            ))}
            {v.porUbicacion.length === 0 && <tr><td colSpan={2} className="empty">Sin existencia.</td></tr>}
          </tbody>
          <tfoot>
            <tr>
              <td><strong>Total</strong></td>
              <td className="num"><strong>{v.stockActual}</strong></td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* --- Atributos --- */}
      {v.valoracion.length > 0 && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Atributos</h3>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {v.valoracion.map((a) => (
              <span key={a.attribute} className="kbd-chip">{a.attribute}: {a.valor}</span>
            ))}
          </div>
        </div>
      )}

      {/* --- Empaques --- */}
      <EmpaquesVariante
        variantId={variantId}
        empaquesIniciales={v.packagings}
        empaques={empaques}
        notify={notify}
        onEmpaqueCreado={refrescarEmpaques}
      />

      {/* --- Movimientos --- */}
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Últimos movimientos</h3>
        <ul className="step-list" style={{ fontSize: "0.95rem" }}>
          {v.movimientos.map((m) => (
            <li key={m.id} style={{ padding: "10px 12px" }}>
              <strong>{m.qty > 0 ? "+" : ""}{m.qty}</strong> · {m.motivo}
              {m.location ? ` (${m.location.nombre})` : ""}
              <div className="small muted">{m.ref ?? ""} · {new Date(m.createdAt).toLocaleString("es-MX")}</div>
            </li>
          ))}
          {v.movimientos.length === 0 && <li className="muted">Sin movimientos.</li>}
        </ul>
      </div>

      {confirmElim && (
        <ConfirmDialog
          title="Eliminar variante"
          message={<>¿Seguro que deseas eliminar <strong>{v.nombre}</strong> ({v.sku})?</>}
          confirmLabel="Eliminar"
          danger
          loading={eliminando}
          onClose={() => setConfirmElim(false)}
          onConfirm={eliminar}
        />
      )}

      {bloqueo && (
        <div className="error" style={{ marginTop: 12 }}>
          {bloqueo}
          <button type="button" className="btn ghost sm" style={{ marginLeft: 8 }} onClick={() => setBloqueo(null)}>Cerrar</button>
        </div>
      )}
    </AppShell>
  );
}
