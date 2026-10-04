"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AppShell from "@/components/app-shell";
import PageHeader from "@/components/ui/page-header";
import HelpNote from "@/components/ui/help-note";
import Modal from "@/components/ui/modal";
import ConfirmDialog from "@/components/ui/confirm-dialog";
import Segmented from "@/components/ui/segmented";
import ProductoCard from "@/components/productos/producto-card";
import { api } from "@/lib/api";
import { guardarVistaProductos, leerVistaProductos, type VistaProductos } from "@/lib/local-store";
import { useFormatCantidad } from "@/lib/preferences";
import type { Categoria, ProductoLite } from "@/lib/types";

const CATALOGOS = [
  { href: "/catalogos?tab=categorias", title: "Categorías", desc: "Agrupa productos. Ej.: Taparroscas, Pinceles." },
  { href: "/catalogos?tab=empaques", title: "Empaques", desc: "Presentaciones de venta. Ej.: bolsa, caja master." },
  { href: "/catalogos?tab=atributos", title: "Atributos", desc: "Ejes de combinación. Ej.: tamaño rosca, color tapa." },
];

export default function ProductosPage() {
  const router = useRouter();
  const formatCantidad = useFormatCantidad();
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  const [productos, setProductos] = useState<ProductoLite[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [filtroCat, setFiltroCat] = useState("");

  const [porEliminar, setPorEliminar] = useState<ProductoLite | null>(null);
  const [eliminando, setEliminando] = useState(false);
  const [bloqueo, setBloqueo] = useState<{ p: ProductoLite; motivo: string } | null>(null);

  const [vista, setVista] = useState<VistaProductos>("tabla");
  useEffect(() => {
    setVista(leerVistaProductos());
  }, []);
  function cambiarVista(v: VistaProductos) {
    setVista(v);
    guardarVistaProductos(v);
  }

  const cargar = useCallback(async () => {
    const qs = new URLSearchParams();
    if (busqueda) qs.set("search", busqueda);
    if (filtroCat) qs.set("categoria", filtroCat);
    setProductos(await api(`/productos?${qs.toString()}`));
  }, [busqueda, filtroCat]);

  useEffect(() => {
    cargar().catch((e) => setError(e.message));
  }, [cargar]);

  useEffect(() => {
    api<Categoria[]>("/catalogos/categorias").then(setCategorias).catch(() => setCategorias([]));
  }, []);

  async function recargarCategorias() {
    try {
      setCategorias(await api<Categoria[]>("/catalogos/categorias"));
    } catch {
      /* noop */
    }
  }

  async function toggleVendible(p: ProductoLite) {
    setError("");
    setMsg("");
    try {
      await api(`/productos/${p.id}`, { method: "PATCH", body: JSON.stringify({ vendible: !p.vendible }) });
      await cargar();
      setMsg(`"${p.nombre}" ${!p.vendible ? "marcado como vendible" : "ya no es vendible"}.`);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function toggleFlag(p: ProductoLite, campo: "fabricable" | "comprable", etiqueta: string) {
    setError("");
    setMsg("");
    try {
      await api(`/productos/${p.id}`, { method: "PATCH", body: JSON.stringify({ [campo]: !p[campo] }) });
      await cargar();
      setMsg(`"${p.nombre}" ${!p[campo] ? `marcado como ${etiqueta}` : `ya no es ${etiqueta}`}.`);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  // --------------------------------------------------------------- Alta
  const [showModal, setShowModal] = useState(false);
  const [nombre, setNombre] = useState("");
  const [sku, setSku] = useState("");
  const [uom, setUom] = useState("pieza");
  const [basePrice, setBasePrice] = useState("");
  const [hasVariants, setHasVariants] = useState(false);
  const [vendible, setVendible] = useState(false);
  const [fabricable, setFabricable] = useState(false);
  const [comprable, setComprable] = useState(false);
  const [catAlta, setCatAlta] = useState("");
  const [nuevaCat, setNuevaCat] = useState("");
  const [showNuevaCat, setShowNuevaCat] = useState(false);
  const [creandoCat, setCreandoCat] = useState(false);
  const [guardando, setGuardando] = useState(false);

  function resetForm() {
    setNombre("");
    setSku("");
    setBasePrice("");
    setHasVariants(false);
    setVendible(false);
    setFabricable(false);
    setComprable(false);
    setCatAlta("");
    setNuevaCat("");
    setShowNuevaCat(false);
  }

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    setGuardando(true);
    setError("");
    setMsg("");
    try {
      const p = await api<{ id: number }>("/productos", {
        method: "POST",
        body: JSON.stringify({
          nombre,
          skuBase: sku,
          uom,
          basePrice: basePrice === "" ? 0 : Number(basePrice),
          categoryId: catAlta ? Number(catAlta) : undefined,
          hasVariants,
          vendible,
          fabricable,
          comprable,
        }),
      });
      resetForm();
      setShowModal(false);
      router.push(`/productos/${p.id}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGuardando(false);
    }
  }

  async function crearNuevaCat() {
    const n = nuevaCat.trim();
    if (!n) return;
    setCreandoCat(true);
    try {
      const c = await api<{ id: number }>("/catalogos/categorias", { method: "POST", body: JSON.stringify({ nombre: n }) });
      await recargarCategorias();
      setCatAlta(String(c.id));
      setNuevaCat("");
      setShowNuevaCat(false);
      setMsg(`Categoría "${n}" creada y seleccionada.`);
      setError("");
    } catch (e) {
      setError((e as Error).message);
      setMsg("");
    } finally {
      setCreandoCat(false);
    }
  }

  // --------------------------------------------------------------- Eliminar
  async function eliminar(p: ProductoLite) {
    setEliminando(true);
    try {
      await api(`/productos/${p.id}/definitivo`, { method: "DELETE" });
      setPorEliminar(null);
      await cargar();
      setError("");
      setMsg(`Producto "${p.nombre}" eliminado.`);
    } catch (e) {
      setPorEliminar(null);
      setBloqueo({ p, motivo: (e as Error).message });
    } finally {
      setEliminando(false);
    }
  }

  async function desactivar(p: ProductoLite) {
    try {
      await api(`/productos/${p.id}`, { method: "DELETE" });
      setBloqueo(null);
      await cargar();
      setError("");
      setMsg(`Producto "${p.nombre}" desactivado.`);
    } catch (e) {
      setBloqueo(null);
      setMsg("");
      setError((e as Error).message);
    }
  }

  return (
    <AppShell>
      {error && <div className="error">{error}</div>}
      {msg && <div className="msg-ok">{msg}</div>}

      <PageHeader
        title="Productos"
        subtitle="Catálogo de productos y sus variantes. Desde cada producto se definen sus atributos, lista de materiales (BOM), variantes y empaques."
        actions={
          <button className="btn primary" onClick={() => setShowModal(true)}>
            + Nuevo producto
          </button>
        }
      />

      <h3 style={{ marginBottom: 4 }}>Catálogos base</h3>
      <HelpNote>
        Son listas compartidas por todos los productos: aquí se crean los nombres y valores. La asignación
        (categoría de un producto, cantidad por empaque) se hace desde cada producto.
      </HelpNote>
      <div className="nav-cards">
        {CATALOGOS.map((c) => (
          <Link key={c.href} href={c.href} className="nav-card">
            <strong>{c.title} →</strong>
            <span>{c.desc}</span>
          </Link>
        ))}
      </div>

      <div className="card" style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
        <label style={{ flex: 2, minWidth: 180 }}>
          Buscar
          <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Nombre o SKU…" />
        </label>
        <label style={{ flex: 1, minWidth: 150 }}>
          Categoría
          <select value={filtroCat} onChange={(e) => setFiltroCat(e.target.value)}>
            <option value="">Todas</option>
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </label>
        <div style={{ flex: 1, minWidth: 200, display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 12 }}>
          <span className="muted small">{productos.length} producto(s)</span>
          <Segmented
            value={vista}
            onChange={(v) => cambiarVista(v as VistaProductos)}
            options={[
              { value: "tabla", label: "Tabla" },
              { value: "grid", label: "Grid" },
            ]}
          />
        </div>
      </div>

      {vista === "grid" ? (
        productos.length === 0 ? (
          <div className="card empty">Sin productos todavía. Usa “Nuevo producto” para crear el primero.</div>
        ) : (
          <div className="product-grid">
            {productos.map((p) => (
              <ProductoCard key={p.id} producto={p} onEliminar={setPorEliminar} />
            ))}
          </div>
        )
      ) : (
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Producto</th>
                <th>SKU</th>
                <th>UOM</th>
                <th className="num">Precio</th>
                <th>Categoría</th>
                <th>Vendible</th>
                <th>Fabricable</th>
                <th>Comprable</th>
                <th className="num">Variantes</th>
                <th className="num">Stock</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {productos.map((p) => (
                <tr key={p.id}>
                  <td>
                    <Link href={`/productos/${p.id}`}>{p.nombre}</Link>
                  </td>
                  <td className="muted-2">{p.skuBase}</td>
                  <td>{p.uom}</td>
                  <td className="num">${Number(p.basePrice).toFixed(2)}</td>
                  <td>{p.categoria ?? "—"}</td>
                  <td>
                    <input
                      type="checkbox"
                      checked={p.vendible}
                      onChange={() => toggleVendible(p)}
                      style={{ width: "auto" }}
                      title="Vender en el modal de Ventas"
                    />
                  </td>
                  <td>
                    <input
                      type="checkbox"
                      checked={p.fabricable}
                      onChange={() => toggleFlag(p, "fabricable", "fabricable")}
                      style={{ width: "auto" }}
                      title="Se puede producir (genera OF)"
                    />
                  </td>
                  <td>
                    <input
                      type="checkbox"
                      checked={p.comprable}
                      onChange={() => toggleFlag(p, "comprable", "comprable")}
                      style={{ width: "auto" }}
                      title="Se puede adquirir por compra"
                    />
                  </td>
                  <td className="num">{p.variantes}</td>
                  <td className="num">{formatCantidad(p.stockTotal)}</td>
                  <td>
                    <button type="button" className="btn ghost sm" onClick={() => setPorEliminar(p)}>
                      Eliminar
                    </button>
                  </td>
                </tr>
              ))}
              {productos.length === 0 && (
                <tr>
                  <td colSpan={11} className="empty">
                    Sin productos todavía. Usa “Nuevo producto” para crear el primero.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      )}

      {showModal && (
        <Modal
          title="Nuevo producto"
          onClose={() => {
            setShowModal(false);
            resetForm();
          }}
          size="lg"
        >
          <form onSubmit={crear}>
            <label>
              Nombre
              <input value={nombre} onChange={(e) => setNombre(e.target.value)} required />
            </label>
            <div className="row">
              <label>
                SKU base
                <input value={sku} onChange={(e) => setSku(e.target.value)} required placeholder="EJ: CEP45" />
              </label>
              <label>
                UOM
                <select value={uom} onChange={(e) => setUom(e.target.value)}>
                  <option value="pieza">pieza</option>
                  <option value="metro">metro</option>
                </select>
              </label>
            </div>
            <div className="row">
              <label>
                Precio base (neto)
                <input type="number" step="0.01" min="0" value={basePrice} onChange={(e) => setBasePrice(e.target.value)} />
              </label>
              <label style={{ marginTop: 28 }}>
                <input type="checkbox" checked={hasVariants} onChange={(e) => setHasVariants(e.target.checked)} style={{ width: "auto", margin: 0 }} />{" "}
                Tiene variantes (grid de combos)
              </label>
            </div>
            <label className="row" style={{ gap: 8, alignItems: "center", marginTop: 8 }}>
              <input type="checkbox" checked={vendible} onChange={(e) => setVendible(e.target.checked)} style={{ width: "auto", margin: 0 }} />{" "}
              <span>Vendible en Ventas</span>
            </label>
            <label className="row" style={{ gap: 8, alignItems: "center", marginTop: 8 }}>
              <input type="checkbox" checked={fabricable} onChange={(e) => setFabricable(e.target.checked)} style={{ width: "auto", margin: 0 }} />{" "}
              <span>Fabricable</span>
            </label>
            <label className="row" style={{ gap: 8, alignItems: "center", marginTop: 8 }}>
              <input type="checkbox" checked={comprable} onChange={(e) => setComprable(e.target.checked)} style={{ width: "auto", margin: 0 }} />{" "}
              <span>Comprable</span>
            </label>
            <div className="row" style={{ alignItems: "flex-end" }}>
              <label style={{ flex: 2 }}>
                Categoría
                <select value={catAlta} onChange={(e) => setCatAlta(e.target.value)}>
                  <option value="">— Sin categoría —</option>
                  {categorias.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
                </select>
              </label>
              <button type="button" className="btn ghost sm" style={{ flex: 0 }} onClick={() => setShowNuevaCat(!showNuevaCat)}>
                {showNuevaCat ? "Cerrar" : "Nueva…"}
              </button>
            </div>
            {showNuevaCat && (
              <div className="inline-form" style={{ marginTop: 8 }}>
                <input value={nuevaCat} onChange={(e) => setNuevaCat(e.target.value)} placeholder="Nombre de la categoría…" />
                <button type="button" className="btn primary sm" style={{ flex: 0 }} disabled={creandoCat} onClick={crearNuevaCat}>
                  {creandoCat ? "Creando…" : "Crear"}
                </button>
              </div>
            )}
            <div className="row" style={{ marginTop: 12, justifyContent: "flex-end" }}>
              <button
                type="button"
                className="btn ghost"
                onClick={() => {
                  setShowModal(false);
                  resetForm();
                }}
              >
                Cancelar
              </button>
              <button className="btn primary" disabled={guardando}>
                {guardando ? "Guardando…" : "Crear producto"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {porEliminar && (
        <ConfirmDialog
          title="Eliminar producto"
          message={
            <>
              ¿Seguro que deseas eliminar <strong>{porEliminar.nombre}</strong>? Esta acción no se puede deshacer.
              {porEliminar.variantes > 0 && <> Se eliminarán también sus {porEliminar.variantes} variante(s).</>}
            </>
          }
          confirmLabel="Eliminar"
          danger
          loading={eliminando}
          onConfirm={() => eliminar(porEliminar)}
          onClose={() => setPorEliminar(null)}
        />
      )}

      {bloqueo && (
        <ConfirmDialog
          title="No se pudo eliminar"
          message={bloqueo.motivo}
          confirmLabel="Desactivar en su lugar"
          cancelLabel="Cerrar"
          onConfirm={() => desactivar(bloqueo.p)}
          onClose={() => setBloqueo(null)}
        />
      )}
    </AppShell>
  );
}
