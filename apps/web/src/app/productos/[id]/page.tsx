"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import AppShell from "@/components/app-shell";
import PageHeader from "@/components/ui/page-header";
import HelpNote from "@/components/ui/help-note";
import ConfirmDialog from "@/components/ui/confirm-dialog";
import SeccionDatos from "@/components/productos/detalle/seccion-datos";
import SeccionAtributos from "@/components/productos/detalle/seccion-atributos";
import SeccionBom from "@/components/productos/detalle/seccion-bom";
import SeccionPasos from "@/components/productos/detalle/seccion-pasos";
import SeccionVariantes from "@/components/productos/detalle/seccion-variantes";
import { api } from "@/lib/api";
import { borrarSeleccion } from "@/lib/local-store";
import type { Atributo, Categoria, Grid, ProductoDetalle } from "@/lib/types";

export default function ProductoDetallePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const prodId = Number(id);
  const [d, setD] = useState<ProductoDetalle | null>(null);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [atributos, setAtributos] = useState<Atributo[]>([]);
  const [grid, setGrid] = useState<Grid | null>(null);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  const [confirmElimProducto, setConfirmElimProducto] = useState(false);
  const [eliminandoProducto, setEliminandoProducto] = useState(false);
  const [bloqueoProducto, setBloqueoProducto] = useState<string | null>(null);

  const cargarGrid = useCallback(async () => {
    const g = await api<Grid>(`/productos/${prodId}/grid`);
    setGrid(g);
  }, [prodId]);

  const cargar = useCallback(async () => {
    const [pd, g] = await Promise.all([
      api<ProductoDetalle>(`/productos/${prodId}`),
      api<Grid>(`/productos/${prodId}/grid`),
    ]);
    setD(pd);
    setGrid(g);
  }, [prodId]);

  useEffect(() => {
    api<Categoria[]>("/catalogos/categorias").then(setCategorias).catch(() => setCategorias([]));
    api<Atributo[]>("/catalogos/atributos").then(setAtributos).catch(() => setAtributos([]));
  }, []);

  useEffect(() => {
    cargar().catch((e) => setError(e.message));
  }, [cargar]);

  const notify = (e: Error | null, okMsg: string) => {
    if (e) { setError(e.message); setMsg(""); }
    else { setError(""); setMsg(okMsg); }
  };

  const [nombreEdit, setNombreEdit] = useState<string | null>(null);

  async function guardarNombre() {
    if (!nombreEdit?.trim()) { setNombreEdit(null); return; }
    try {
      await api(`/productos/${prodId}`, { method: "PATCH", body: JSON.stringify({ nombre: nombreEdit.trim() }) });
      await cargar();
      setNombreEdit(null);
      notify(null, "Nombre actualizado.");
    } catch (e) { notify(e as Error, ""); }
  }

  async function eliminarProducto() {
    setEliminandoProducto(true);
    try {
      await api(`/productos/${prodId}/definitivo`, { method: "DELETE" });
      borrarSeleccion(prodId);
      router.push("/productos");
    } catch (e) {
      setConfirmElimProducto(false);
      setBloqueoProducto((e as Error).message);
      notify(e as Error, "");
    } finally {
      setEliminandoProducto(false);
    }
  }

  async function desactivarProducto() {
    try {
      await api(`/productos/${prodId}`, { method: "DELETE" });
      setBloqueoProducto(null);
      router.push("/productos");
    } catch (e) { setBloqueoProducto(null); notify(e as Error, ""); }
  }

  if (!d) {
    return (
      <AppShell>
        <p className="muted">Cargando producto…</p>
      </AppShell>
    );
  }

  return (
    <AppShell>
      {error && <div className="error">{error}</div>}
      {msg && <div className="msg-ok">{msg}</div>}

      <PageHeader
        breadcrumb={[{ label: "Productos", href: "/productos" }, { label: d.nombre }]}
        title={
          nombreEdit !== null ? (
            <input
              value={nombreEdit}
              onChange={(e) => setNombreEdit(e.target.value)}
              onBlur={guardarNombre}
              onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
              autoFocus
            />
          ) : (
            <span onClick={() => setNombreEdit(d.nombre)} style={{ cursor: "pointer" }} title="Clic para editar">
              {d.nombre}
            </span>
          )
        }
        subtitle={`SKU base: ${d.skuBase} · UOM: ${d.uom} · ${d.hasVariants ? "Con variantes" : "Variante única"}`}
        actions={
          <button type="button" className="btn danger" onClick={() => setConfirmElimProducto(true)}>
            Eliminar producto
          </button>
        }
      />

      {confirmElimProducto && (
        <ConfirmDialog
          title="Eliminar producto"
          message={
            <>
              ¿Seguro que deseas eliminar <strong>{d.nombre}</strong>? Esta acción no se puede deshacer.
              {d.variantes.length > 0 && <> Se eliminarán también sus {d.variantes.length} variante(s).</>}
            </>
          }
          confirmLabel="Eliminar"
          danger
          loading={eliminandoProducto}
          onConfirm={eliminarProducto}
          onClose={() => setConfirmElimProducto(false)}
        />
      )}

      {bloqueoProducto && (
        <ConfirmDialog
          title="No se pudo eliminar"
          message={bloqueoProducto}
          confirmLabel="Desactivar en su lugar"
          cancelLabel="Cerrar"
          onConfirm={desactivarProducto}
          onClose={() => setBloqueoProducto(null)}
        />
      )}

      <HelpNote>
        Sigue este orden: <strong>datos base</strong>, <strong>atributos</strong> (ejes de combinación),{" "}
        <strong>lista de materiales (BOM)</strong> y materializa las <strong>variantes</strong>. Los{" "}
        <strong>empaques</strong> se configuran dentro de cada variante.
      </HelpNote>

      <nav className="section-nav">
        <a href="#datos">1 · Datos base</a>
        <a href="#atributos">2 · Atributos</a>
        <a href="#bom">3 · BOM</a>
        <a href="#pasos">4 · Pasos</a>
        <a href="#variantes">5 · Variantes</a>
      </nav>

      <SeccionDatos prodId={prodId} d={d} categorias={categorias} cargar={cargar} notify={notify} />
      <SeccionAtributos prodId={prodId} atributos={atributos} cargarGrid={cargarGrid} notify={notify} />
      <SeccionBom prodId={prodId} componentes={d.componentes} notify={notify} />
      <SeccionPasos prodId={prodId} pasosIniciales={d.pasos} atributos={atributos} cargar={cargar} notify={notify} />
      <SeccionVariantes prodId={prodId} d={d} grid={grid} cargar={cargar} notify={notify} />
    </AppShell>
  );
}
