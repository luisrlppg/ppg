"use client";

import { useCallback, useEffect, useState } from "react";
import AppShell from "@/components/app-shell";
import PageHeader from "@/components/ui/page-header";
import StickyBar from "@/components/ui/sticky-bar";
import Modal from "@/components/ui/modal";
import HelpNote from "@/components/ui/help-note";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/preferences";
import type { CostoDetalle, CostoFila, CostoMaterial } from "@/lib/types";

const money = (n: number | null | undefined) => `$${Number(n ?? 0).toFixed(2)}`;
const pct = (n: number | null | undefined) => (n === null || n === undefined ? "—" : `${n.toFixed(1)}%`);
const num = (s: string) => {
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
};

function tipoLabel(f: CostoFila | CostoDetalle): string {
  if (f.fabricable && f.comprable) return "Fabricable + Comprable";
  if (f.fabricable) return "Fabricado";
  if (f.comprable) return "Comprado";
  return "—";
}

interface MaterialForm {
  nombre: string;
  cantidad: string;
  costoUnitario: string;
}

interface VarianteForm {
  variantId: number;
  sku: string;
  nombre: string;
  costoCompra: string;
}

export default function CostosPage() {
  const { user } = useAuth();
  const [filas, setFilas] = useState<CostoFila[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  const cargar = useCallback(async () => {
    const qs = busqueda ? `?search=${encodeURIComponent(busqueda)}` : "";
    setFilas(await api<CostoFila[]>(`/costos${qs}`));
  }, [busqueda]);

  useEffect(() => {
    const t = setTimeout(() => cargar().catch((e) => setError(e.message)), 150);
    return () => clearTimeout(t);
  }, [cargar]);

  // ---------------------------------------------------------- Editor
  const [detalle, setDetalle] = useState<CostoDetalle | null>(null);
  const [cargandoDetalle, setCargandoDetalle] = useState(false);
  const [guardando, setGuardando] = useState(false);

  const [costoCompra, setCostoCompra] = useState("");
  const [horasManoObra, setHorasManoObra] = useState("");
  const [tarifaManoObra, setTarifaManoObra] = useState("");
  const [horasMaquina, setHorasMaquina] = useState("");
  const [tarifaMaquina, setTarifaMaquina] = useState("");
  const [costoMolde, setCostoMolde] = useState("");
  const [piezasMolde, setPiezasMolde] = useState("");
  const [costoEnsamble, setCostoEnsamble] = useState("");
  const [costoEmpaque, setCostoEmpaque] = useState("");
  const [notas, setNotas] = useState("");
  const [precioBase, setPrecioBase] = useState("");
  const [margenPctInput, setMargenPctInput] = useState("");
  const [materiales, setMateriales] = useState<MaterialForm[]>([]);
  const [variantes, setVariantes] = useState<VarianteForm[]>([]);

  function aplicarReceta(d: CostoDetalle) {
    const r = d.receta;
    setCostoCompra(r.costoCompra ? String(r.costoCompra) : "");
    setHorasManoObra(r.horasManoObra ? String(r.horasManoObra) : "");
    setTarifaManoObra(r.tarifaManoObra ? String(r.tarifaManoObra) : "");
    setHorasMaquina(r.horasMaquina ? String(r.horasMaquina) : "");
    setTarifaMaquina(r.tarifaMaquina ? String(r.tarifaMaquina) : "");
    setCostoMolde(r.costoMolde ? String(r.costoMolde) : "");
    setPiezasMolde(r.piezasMolde ? String(r.piezasMolde) : "");
    setCostoEnsamble(r.costoEnsamble ? String(r.costoEnsamble) : "");
    setCostoEmpaque(r.costoEmpaque ? String(r.costoEmpaque) : "");
    setNotas(r.notas ?? "");
    setPrecioBase(d.precioBase ? String(d.precioBase) : "");
    setMargenPctInput(d.margenPct === null ? "" : d.margenPct.toFixed(1));
    setMateriales(
      r.materiales.map((m: CostoMaterial) => ({
        nombre: m.nombre,
        cantidad: String(m.cantidad),
        costoUnitario: String(m.costoUnitario),
      })),
    );
    setVariantes(
      (d.variantes ?? []).map((v) => ({
        variantId: v.variantId,
        sku: v.sku,
        nombre: v.nombre,
        costoCompra: v.costoCompra === null ? "" : String(v.costoCompra),
      })),
    );
  }

  async function abrir(productId: number) {
    setError("");
    setMsg("");
    setCargandoDetalle(true);
    try {
      const d = await api<CostoDetalle>(`/costos/${productId}`);
      setDetalle(d);
      aplicarReceta(d);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCargandoDetalle(false);
    }
  }

  function cerrar() {
    setDetalle(null);
  }

  function aplicarPrecio(valor: string, total: number) {
    setPrecioBase(valor);
    const p = num(valor);
    setMargenPctInput(total > 0 && p > 0 ? (((p - total) / p) * 100).toFixed(1) : "");
  }

  function aplicarMargen(valor: string, total: number) {
    setMargenPctInput(valor);
    const m = num(valor);
    if (total > 0 && m >= 0 && m < 100) {
      setPrecioBase((total / (1 - m / 100)).toFixed(2));
    }
  }

  const live = (() => {
    const materialesTotal =
      num(costoCompra) +
      materiales.reduce((s, m) => s + num(m.cantidad) * num(m.costoUnitario), 0);
    const manoObra = num(horasManoObra) * num(tarifaManoObra);
    const maquina = num(horasMaquina) * num(tarifaMaquina);
    const piezas = num(piezasMolde);
    const molde = piezas > 0 ? num(costoMolde) / piezas : 0;
    const ensamble = num(costoEnsamble);
    const empaque = num(costoEmpaque);
    const total = materialesTotal + manoObra + maquina + molde + ensamble + empaque;
    const precio = num(precioBase) > 0 ? num(precioBase) : (detalle?.precio ?? 0);
    const margen = precio > 0 ? precio - total : null;
    const margenPct = precio > 0 ? ((precio - total) / precio) * 100 : null;
    return { materialesTotal, manoObra, maquina, molde, ensamble, empaque, total, precio, margen, margenPct };
  })();

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (!detalle) return;
    setGuardando(true);
    setError("");
    try {
      await api(`/costos/${detalle.productId}`, {
        method: "PUT",
        body: JSON.stringify({
          precioBase: num(precioBase),
          costoCompra: costoCompra === "" ? null : num(costoCompra),
          horasManoObra: num(horasManoObra),
          tarifaManoObra: num(tarifaManoObra),
          horasMaquina: num(horasMaquina),
          tarifaMaquina: num(tarifaMaquina),
          costoMolde: num(costoMolde),
          piezasMolde: num(piezasMolde),
          costoEnsamble: num(costoEnsamble),
          costoEmpaque: num(costoEmpaque),
          notas: notas.trim() || null,
          materiales: materiales
            .filter((m) => m.nombre.trim() !== "")
            .map((m, i) => ({
              nombre: m.nombre.trim(),
              cantidad: num(m.cantidad),
              costoUnitario: num(m.costoUnitario),
              orden: i,
            })),
          variantes: variantes.map((v) => ({
            variantId: v.variantId,
            costoCompra: v.costoCompra === "" ? null : num(v.costoCompra),
          })),
        }),
      });
      cerrar();
      await cargar();
      setMsg(`Costo de "${detalle.nombre}" guardado.`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setGuardando(false);
    }
  }

  async function eliminarReceta() {
    if (!detalle) return;
    setGuardando(true);
    try {
      await api(`/costos/${detalle.productId}`, { method: "DELETE" });
      cerrar();
      await cargar();
      setMsg(`Receta de "${detalle.nombre}" eliminada.`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setGuardando(false);
    }
  }

  function setMaterial(i: number, campo: keyof MaterialForm, valor: string) {
    setMateriales((prev) => prev.map((m, j) => (j === i ? { ...m, [campo]: valor } : m)));
  }

  function setVariante(i: number, valor: string) {
    setVariantes((prev) => prev.map((v, j) => (j === i ? { ...v, costoCompra: valor } : v)));
  }

  if (user && user.role !== "admin") {
    return (
      <AppShell>
        <div className="card empty">No tienes permiso para ver esta sección.</div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <PageHeader
        title="Costos"
        subtitle="Costo estándar por producto, calculado a partir de sus factores. El costo total es fijo; aquí también ajustas el precio de venta (base) y revisas la utilidad."
      />
      {error && <div className="error">{error}</div>}
      {msg && <div className="msg-ok">{msg}</div>}

      <StickyBar>
        <div className="card" style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <label style={{ flex: 2, minWidth: 200 }}>
            Buscar
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Nombre o SKU…"
            />
          </label>
          <span className="muted small" style={{ flex: 1, textAlign: "right" }}>
            {filas.length} producto(s)
          </span>
        </div>
      </StickyBar>

      <div className="card" style={{ padding: 0 }}>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Producto</th>
                <th>SKU</th>
                <th>Tipo</th>
                <th className="num">Materiales</th>
                <th className="num">M.O.</th>
                <th className="num">Máquina</th>
                <th className="num">Molde</th>
                <th className="num">Ensamble</th>
                <th className="num">Empaque</th>
                <th className="num">Costo total</th>
                <th className="num">Precio</th>
                <th className="num">Margen</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f.productId}>
                  <td>
                    <strong>{f.nombre}</strong>
                    {!f.tieneReceta && <span className="badge" style={{ marginLeft: 8 }}>sin receta</span>}
                  </td>
                  <td className="muted-2">{f.skuBase}</td>
                  <td className="small">{tipoLabel(f)}</td>
                  <td className="num">{money(f.materiales)}</td>
                  <td className="num">{money(f.manoObra)}</td>
                  <td className="num">{money(f.maquina)}</td>
                  <td className="num">{money(f.molde)}</td>
                  <td className="num">{money(f.ensamble)}</td>
                  <td className="num">{money(f.empaque)}</td>
                  <td className="num">
                    <strong>{money(f.total)}</strong>
                  </td>
                  <td className="num">{f.precio > 0 ? money(f.precio) : "—"}</td>
                  <td className="num">{f.margen === null ? "—" : `${money(f.margen)} (${pct(f.margenPct)})`}</td>
                  <td className="row-actions">
                    <button type="button" className="btn sm" onClick={() => abrir(f.productId)}>
                      Editar
                    </button>
                  </td>
                </tr>
              ))}
              {filas.length === 0 && (
                <tr>
                  <td colSpan={13} className="empty">
                    Sin productos.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {detalle && !cargandoDetalle && (
        <Modal
          title={`Costo · ${detalle.nombre} (${detalle.skuBase})`}
          onClose={cerrar}
          size="lg"
          footer={
            <>
              {detalle.tieneReceta && (
                <button type="button" className="btn ghost" disabled={guardando} onClick={eliminarReceta}>
                  Eliminar receta
                </button>
              )}
              <button type="button" className="btn ghost" onClick={cerrar}>
                Cancelar
              </button>
              <button type="submit" form="form-costo" className="btn primary" disabled={guardando}>
                {guardando ? "Guardando…" : "Guardar"}
              </button>
            </>
          }
        >
          <form id="form-costo" onSubmit={guardar}>
            <HelpNote>
              Captura manual por concepto. En <strong>comprados</strong> usa el costo de compra; en{" "}
              <strong>fabricados</strong> usa materiales + operaciones. Todo es por unidad. El costo total
              se calcula y no se edita; el precio de venta sí.
            </HelpNote>

            {/* Materiales + compra */}
            <h4 style={{ marginBottom: 4 }}>Materiales</h4>
            <table className="table" style={{ marginTop: 0 }}>
              <thead>
                <tr>
                  <th>Material</th>
                  <th style={{ width: 110 }}>Cantidad</th>
                  <th style={{ width: 130 }}>Costo unitario</th>
                  <th style={{ width: 110 }} className="num">Importe</th>
                  <th style={{ width: 40 }}></th>
                </tr>
              </thead>
              <tbody>
                {materiales.map((m, i) => (
                  <tr key={i}>
                    <td>
                      <input
                        value={m.nombre}
                        onChange={(e) => setMaterial(i, "nombre", e.target.value)}
                        placeholder="Nombre del material"
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        step="0.001"
                        min="0"
                        value={m.cantidad}
                        onChange={(e) => setMaterial(i, "cantidad", e.target.value)}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={m.costoUnitario}
                        onChange={(e) => setMaterial(i, "costoUnitario", e.target.value)}
                      />
                    </td>
                    <td className="num">{money(num(m.cantidad) * num(m.costoUnitario))}</td>
                    <td>
                      <button
                        type="button"
                        className="btn ghost sm"
                        title="Quitar"
                        onClick={() => setMateriales((prev) => prev.filter((_, j) => j !== i))}
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                ))}
                {materiales.length === 0 && (
                  <tr>
                    <td colSpan={5} className="empty">Sin materiales capturados.</td>
                  </tr>
                )}
              </tbody>
            </table>
            <div className="row" style={{ marginTop: 4 }}>
              <button
                type="button"
                className="btn ghost sm"
                onClick={() => setMateriales((prev) => [...prev, { nombre: "", cantidad: "1", costoUnitario: "" }])}
              >
                + Agregar material
              </button>
            </div>

            <div className="grid-2" style={{ marginTop: 16 }}>
              <label>
                Costo de compra (productos comprados)
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={costoCompra}
                  onChange={(e) => setCostoCompra(e.target.value)}
                  placeholder="0.00"
                />
              </label>
              <div />
            </div>

            {variantes.length > 0 && (
              <>
                <h4 style={{ marginBottom: 4, marginTop: 16 }}>Costo de compra por variante</h4>
                <p className="muted small" style={{ marginTop: 0 }}>
                  Para comprables con varias presentaciones (p. ej. pigmentos por color). Vacío = sin costo capturado.
                </p>
                <table className="table" style={{ marginTop: 0 }}>
                  <thead>
                    <tr>
                      <th>Variante</th>
                      <th>SKU</th>
                      <th style={{ width: 160 }}>Costo de compra</th>
                    </tr>
                  </thead>
                  <tbody>
                    {variantes.map((v, i) => (
                      <tr key={v.variantId}>
                        <td>{v.nombre}</td>
                        <td className="muted-2 small">{v.sku}</td>
                        <td>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={v.costoCompra}
                            onChange={(e) => setVariante(i, e.target.value)}
                            placeholder="0.00"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}

            {/* Mano de obra */}
            <h4 style={{ marginBottom: 4, marginTop: 16 }}>Mano de obra</h4>
            <div className="grid-2">
              <label>
                Horas por unidad
                <input
                  type="number"
                  step="0.001"
                  min="0"
                  value={horasManoObra}
                  onChange={(e) => setHorasManoObra(e.target.value)}
                  placeholder="0"
                />
              </label>
              <label>
                Tarifa por hora
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={tarifaManoObra}
                  onChange={(e) => setTarifaManoObra(e.target.value)}
                  placeholder="0.00"
                />
              </label>
            </div>

            {/* Máquina */}
            <h4 style={{ marginBottom: 4, marginTop: 16 }}>Máquina</h4>
            <div className="grid-2">
              <label>
                Horas-máquina por unidad
                <input
                  type="number"
                  step="0.001"
                  min="0"
                  value={horasMaquina}
                  onChange={(e) => setHorasMaquina(e.target.value)}
                  placeholder="0"
                />
              </label>
              <label>
                Tarifa por hora-máquina
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={tarifaMaquina}
                  onChange={(e) => setTarifaMaquina(e.target.value)}
                  placeholder="0.00"
                />
              </label>
            </div>

            {/* Molde */}
            <h4 style={{ marginBottom: 4, marginTop: 16 }}>Molde (amortización)</h4>
            <div className="grid-2">
              <label>
                Costo del molde
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={costoMolde}
                  onChange={(e) => setCostoMolde(e.target.value)}
                  placeholder="0.00"
                />
              </label>
              <label>
                Piezas de vida útil
                <input
                  type="number"
                  step="1"
                  min="0"
                  value={piezasMolde}
                  onChange={(e) => setPiezasMolde(e.target.value)}
                  placeholder="0"
                />
              </label>
            </div>

            {/* Ensamble y empaque */}
            <h4 style={{ marginBottom: 4, marginTop: 16 }}>Otros</h4>
            <div className="grid-2">
              <label>
                Costo de ensamble por unidad
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={costoEnsamble}
                  onChange={(e) => setCostoEnsamble(e.target.value)}
                  placeholder="0.00"
                />
              </label>
              <label>
                Costo de empaque por unidad
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={costoEmpaque}
                  onChange={(e) => setCostoEmpaque(e.target.value)}
                  placeholder="0.00"
                />
              </label>
            </div>

            <label style={{ marginTop: 16 }}>
              Notas
              <input value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Supuestos, fuente de tarifas…" />
            </label>

            {/* Precio de venta y utilidad */}
            <h4 style={{ marginBottom: 4, marginTop: 16 }}>Precio de venta y utilidad</h4>
            <p className="muted small" style={{ marginTop: 0 }}>
              Escribe el <strong>precio base</strong> o el <strong>margen deseado</strong>: el sistema calcula el otro.
              El precio se guarda en el catálogo (queda en el historial de precios).
            </p>
            <div className="grid-2">
              <label>
                Precio base
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={precioBase}
                  onChange={(e) => aplicarPrecio(e.target.value, live.total)}
                  placeholder="0.00"
                />
              </label>
              <label>
                Margen deseado (%)
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="99"
                  value={margenPctInput}
                  onChange={(e) => aplicarMargen(e.target.value, live.total)}
                  placeholder="—"
                />
              </label>
            </div>

            {/* Resumen en vivo */}
            <div className="card" style={{ marginTop: 16, background: "var(--surface-2, #f7f7f8)" }}>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <span>Materiales: <strong>{money(live.materialesTotal)}</strong></span>
                <span>Mano de obra: <strong>{money(live.manoObra)}</strong></span>
                <span>Máquina: <strong>{money(live.maquina)}</strong></span>
                <span>Molde: <strong>{money(live.molde)}</strong></span>
                <span>Ensamble: <strong>{money(live.ensamble)}</strong></span>
                <span>Empaque: <strong>{money(live.empaque)}</strong></span>
              </div>
              <div className="row" style={{ justifyContent: "space-between", marginTop: 8 }}>
                <span style={{ fontSize: "1.05rem" }}>Costo total: <strong>{money(live.total)}</strong></span>
                <span>
                  Precio: <strong>{live.precio > 0 ? money(live.precio) : "—"}</strong>{" "}
                  · Margen: <strong>{live.margen === null ? "—" : `${money(live.margen)} (${pct(live.margenPct)})`}</strong>
                </span>
              </div>
            </div>
          </form>
        </Modal>
      )}

      {cargandoDetalle && (
        <Modal title="Costo" onClose={cerrar}>
          <p className="muted">Cargando…</p>
        </Modal>
      )}
    </AppShell>
  );
}
