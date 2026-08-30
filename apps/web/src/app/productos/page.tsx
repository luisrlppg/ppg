"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import AppShell from "@/components/app-shell";
import { api } from "@/lib/api";
import type { Categoria, ProductoLite } from "@/lib/types";

export default function ProductosPage() {
  const [productos, setProductos] = useState<ProductoLite[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [filtroCat, setFiltroCat] = useState("");
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  const cargar = useCallback(async () => {
    const qs = new URLSearchParams();
    if (busqueda) qs.set("search", busqueda);
    if (filtroCat) qs.set("categoria", filtroCat);
    setProductos(await api(`/productos?${qs.toString()}`));
  }, [busqueda, filtroCat]);

  useEffect(() => {
    api<Categoria[]>("/catalogos/categorias").then(setCategorias).catch(() => setCategorias([]));
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      cargar().catch((e) => setError(e.message));
    }, 200);
    return () => clearTimeout(t);
  }, [cargar]);

  // ---- Alta rápida ----
  const [nombre, setNombre] = useState("");
  const [sku, setSku] = useState("");
  const [uom, setUom] = useState("pieza");
  const [basePrice, setBasePrice] = useState("");
  const [hasVariants, setHasVariants] = useState(false);
  const [guardando, setGuardando] = useState(false);

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
          hasVariants,
        }),
      });
      setMsg(`Producto "${nombre}" creado.`);
      setNombre("");
      setSku("");
      setBasePrice("");
      setHasVariants(false);
      cargar();
      return p;
    } catch (e) {
      setError((e as Error).message);
      return null;
    } finally {
      setGuardando(false);
    }
  }

  return (
    <AppShell>
      <h2>Productos</h2>
      {error && <div className="error">{error}</div>}
      {msg && <div className="msg-ok">{msg}</div>}

      <div className="grid-2">
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Alta de producto</h3>
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
            <button className="btn primary block" disabled={guardando} style={{ marginTop: 8 }}>
              {guardando ? "Guardando…" : "Crear producto"}
            </button>
          </form>
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0 }}>Filtrar</h3>
          <label>
            Buscar
            <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Nombre o SKU…" />
          </label>
          <label>
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
        </div>
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
    </AppShell>
  );
}