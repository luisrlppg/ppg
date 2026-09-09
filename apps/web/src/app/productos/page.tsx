"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AppShell from "@/components/app-shell";
import { api } from "@/lib/api";
import type { Atributo, Categoria, Packaging, ProductoLite } from "@/lib/types";

export default function ProductosPage() {
  const router = useRouter();
  const [tab, setTab] = useState<"productos" | "catalogos">("productos");
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  const notify = (e: Error | null, okMsg: string) => {
    if (e) {
      setError(e.message);
      setMsg("");
    } else {
      setError("");
      setMsg(okMsg);
    }
  };

  // ---------------------------------------------------------------- Datos base
  const [productos, setProductos] = useState<ProductoLite[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [empaques, setEmpaques] = useState<Packaging[]>([]);
  const [atributos, setAtributos] = useState<Atributo[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [filtroCat, setFiltroCat] = useState("");

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
    Promise.all([
      api<Categoria[]>("/catalogos/categorias"),
      api<Packaging[]>("/catalogos/empaques"),
      api<Atributo[]>("/catalogos/atributos"),
    ])
      .then(([c, e, a]) => {
        setCategorias(c);
        setEmpaques(e);
        setAtributos(a);
      })
      .catch(() => undefined);
  }, []);

  // --------------------------------------------------------------- Alta
  const [showModal, setShowModal] = useState(false);
  const [nombre, setNombre] = useState("");
  const [sku, setSku] = useState("");
  const [uom, setUom] = useState("pieza");
  const [basePrice, setBasePrice] = useState("");
  const [hasVariants, setHasVariants] = useState(false);
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
      setCategorias(await api<Categoria[]>("/catalogos/categorias"));
      setCatAlta(String(c.id));
      setNuevaCat("");
      setShowNuevaCat(false);
      notify(null, `Categoría "${n}" creada y seleccionada.`);
    } catch (e) {
      notify(e as Error, "");
    } finally {
      setCreandoCat(false);
    }
  }

  // --------------------------------------------------------- Catálogos base
  const [catNombre, setCatNombre] = useState("");
  const [empNombre, setEmpNombre] = useState("");
  const [attrNombre, setAttrNombre] = useState("");
  const [valorNuevo, setValorNuevo] = useState<Record<number, string>>({});

  async function recargarCatalogos() {
    const [c, e, a] = await Promise.all([
      api<Categoria[]>("/catalogos/categorias"),
      api<Packaging[]>("/catalogos/empaques"),
      api<Atributo[]>("/catalogos/atributos"),
    ]);
    setCategorias(c);
    setEmpaques(e);
    setAtributos(a);
  }

  async function agregarCategoria(e: React.FormEvent) {
    e.preventDefault();
    if (!catNombre.trim()) return;
    try {
      await api("/catalogos/categorias", { method: "POST", body: JSON.stringify({ nombre: catNombre }) });
      setCatNombre("");
      await recargarCatalogos();
      notify(null, "Categoría agregada.");
    } catch (err) {
      notify(err as Error, "");
    }
  }

  async function agregarEmpaque(e: React.FormEvent) {
    e.preventDefault();
    if (!empNombre.trim()) return;
    try {
      await api("/catalogos/empaques", { method: "POST", body: JSON.stringify({ nombre: empNombre }) });
      setEmpNombre("");
      await recargarCatalogos();
      notify(null, "Empaque agregado.");
    } catch (err) {
      notify(err as Error, "");
    }
  }

  async function agregarAtributo(e: React.FormEvent) {
    e.preventDefault();
    if (!attrNombre.trim()) return;
    try {
      await api("/catalogos/atributos", { method: "POST", body: JSON.stringify({ nombre: attrNombre }) });
      setAttrNombre("");
      await recargarCatalogos();
      notify(null, "Atributo agregado.");
    } catch (err) {
      notify(err as Error, "");
    }
  }

  async function agregarValor(a: Atributo) {
    const valor = valorNuevo[a.id];
    if (!valor?.trim()) return;
    try {
      await api(`/catalogos/atributos/${a.id}/valores`, { method: "POST", body: JSON.stringify({ valor }) });
      setValorNuevo({ ...valorNuevo, [a.id]: "" });
      await recargarCatalogos();
      notify(null, `Valor agregado a "${a.nombre}".`);
    } catch (err) {
      notify(err as Error, "");
    }
  }

  return (
    <AppShell>
      <h2>Productos</h2>
      {error && <div className="error">{error}</div>}
      {msg && <div className="msg-ok">{msg}</div>}

      <div className="subnav">
        <button className={`btn ${tab === "productos" ? "primary" : "ghost"}`} onClick={() => { setTab("productos"); setError(""); setMsg(""); }}>
          Productos
        </button>
        <button className={`btn ${tab === "catalogos" ? "primary" : "ghost"}`} onClick={() => { setTab("catalogos"); setError(""); setMsg(""); }}>
          Catálogos base
        </button>
      </div>

      {tab === "catalogos" ? (
        <>
          <p className="muted small">
            Listas compartidas que usan los productos: aquí se crean los <strong>nombres</strong>. La asignación (categoría de un producto, cantidad por empaque de cada variante) se hace desde el producto.
          </p>
          <div className="grid-2">
            <div className="card">
              <h3 style={{ marginTop: 0 }}>Categorías</h3>
              <form className="inline-form" onSubmit={agregarCategoria}>
                <input value={catNombre} onChange={(e) => setCatNombre(e.target.value)} placeholder="Nueva categoría…" />
                <button className="btn primary" style={{ flex: 0 }}>
                  Agregar
                </button>
              </form>
              <ul className="step-list" style={{ fontSize: "0.95rem" }}>
                {categorias.map((c) => (
                  <li key={c.id} style={{ padding: "10px 12px" }}>
                    {c.nombre} <span className="badge normal">{c.productos} productos</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="card">
              <h3 style={{ marginTop: 0 }}>Empaques</h3>
              <form className="inline-form" onSubmit={agregarEmpaque}>
                <input value={empNombre} onChange={(e) => setEmpNombre(e.target.value)} placeholder="Nuevo empaque…" />
                <button className="btn primary" style={{ flex: 0 }}>
                  Agregar
                </button>
              </form>
              <ul className="step-list" style={{ fontSize: "0.95rem" }}>
                {empaques.map((p) => (
                  <li key={p.id} style={{ padding: "10px 12px" }}>
                    {p.nombre}
                  </li>
                ))}
              </ul>
              <p className="muted small">La cantidad de piezas que caben en cada empaque se define en el producto (detalle → "Empaques por variante").</p>
            </div>
          </div>

          <div className="card">
            <h3 style={{ marginTop: 0 }}>Atributos (ejes de combos)</h3>
            <form className="inline-form" onSubmit={agregarAtributo}>
              <input value={attrNombre} onChange={(e) => setAttrNombre(e.target.value)} placeholder="Nuevo atributo…" />
              <button className="btn primary" style={{ flex: 0 }}>
                Agregar
              </button>
            </form>
            <div className="spacer" />
            {atributos.map((a) => (
              <div key={a.id} className="card" style={{ padding: 16, margin: "8px 0" }}>
                <h4 style={{ margin: "0 0 8px" }}>{a.nombre}</h4>
                <div>
                  {a.valores.map((v) => (
                    <span className="kbd-chip" key={v.id} style={{ margin: "0 6px 6px 0" }}>
                      {v.valor}
                    </span>
                  ))}
                  {a.valores.length === 0 && <span className="muted small">Sin valores todavía.</span>}
                </div>
                <div className="inline-form" style={{ marginTop: 8 }}>
                  <input value={valorNuevo[a.id] ?? ""} onChange={(e) => setValorNuevo({ ...valorNuevo, [a.id]: e.target.value })} placeholder="Nuevo valor…" />
                  <button className="btn ghost" style={{ flex: 0 }} onClick={() => agregarValor(a)}>
                    Agregar valor
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <>
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
            <button className="btn primary" style={{ flex: 0 }} onClick={() => setShowModal(true)}>
              Nuevo
            </button>
          </div>

          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Producto</th>
                  <th>SKU</th>
                  <th>UOM</th>
                  <th>Precio</th>
                  <th>Categoría</th>
                  <th>Variantes</th>
                  <th>Stock</th>
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
                    <td>${Number(p.basePrice).toFixed(2)}</td>
                    <td>{p.categoria ?? "—"}</td>
                    <td>{p.variantes}</td>
                    <td>{p.stockTotal}</td>
                  </tr>
                ))}
                {productos.length === 0 && (
                  <tr>
                    <td colSpan={7} className="empty">
                      Sin productos todavía.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {showModal && (
            <div className="modal-overlay" onClick={() => { setShowModal(false); resetForm(); }}>
              <div className="modal" onClick={(e) => e.stopPropagation()} style={{ minWidth: 480, maxWidth: 640 }}>
                <h3 style={{ marginTop: 0 }}>Nuevo producto</h3>
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
                      <input type="checkbox" checked={hasVariants} onChange={(e) => setHasVariants(e.target.checked)} style={{ width: "auto", margin: 0 }} />
                      {" "}
                      Tiene variantes (grid de combos)
                    </label>
                  </div>
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
                    <button type="button" className="btn ghost" onClick={() => { setShowModal(false); resetForm(); }}>
                      Cancelar
                    </button>
                    <button className="btn primary" disabled={guardando}>
                      {guardando ? "Guardando…" : "Crear producto"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </>
      )}
    </AppShell>
  );
}