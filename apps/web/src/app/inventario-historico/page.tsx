"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import AppShell from "@/components/app-shell";
import PageHeader from "@/components/ui/page-header";
import Modal from "@/components/ui/modal";
import ConfirmDialog from "@/components/ui/confirm-dialog";
import Segmented from "@/components/ui/segmented";
import StickyBar from "@/components/ui/sticky-bar";
import BuscadorAtributos, { FiltroAtributosModal } from "@/components/ui/buscador-atributos";
import ItemFormModal from "@/components/inventario-historico/item-form-modal";
import { api } from "@/lib/api";
import { descargarCSV } from "@/lib/csv";
import { useFiltroAtributos, type ItemFiltrable } from "@/lib/filtro-atributos";
import { useAuth } from "@/lib/preferences";
import type { InventarioHistoricoItem, ProductoLite } from "@/lib/types";

type FiltroTipo = "todos" | "descontinuado" | "subensamble";

export default function InventarioHistoricoPage() {
  const { user } = useAuth();
  const esAdmin = user?.role === "admin";

  const [items, setItems] = useState<InventarioHistoricoItem[]>([]);
  const [productos, setProductos] = useState<{ id: number; nombre: string }[]>([]);
  const [q, setQ] = useState("");
  const [tipo, setTipo] = useState<FiltroTipo>("todos");
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  const cargar = useCallback(async () => {
    const [rows, prods] = await Promise.all([
      api<InventarioHistoricoItem[]>("/inventario-historico"),
      api<ProductoLite[]>("/productos"),
    ]);
    setItems(rows);
    setProductos(prods.map((p) => ({ id: p.id, nombre: p.nombre })));
  }, []);

  useEffect(() => {
    cargar().catch((e) => setError(e.message));
  }, [cargar]);

  // Filtro por familia + atributos (componente compartido).
  const filtrables = useMemo<(InventarioHistoricoItem & ItemFiltrable)[]>(
    () =>
      items.map((it) => ({
        ...it,
        productoId: it.familiaProductoId ?? 0,
        producto: it.familia ?? "Sin familia",
        valoracion: it.atributos.map((a) => ({ attribute: a.nombre, valor: a.valor })),
      })),
    [items],
  );
  const filtro = useFiltroAtributos(filtrables);

  const visibles = useMemo(() => {
    const term = q.trim().toLowerCase();
    return filtro.filtradas.filter((it) => {
      if (tipo !== "todos" && it.tipo !== tipo) return false;
      if (!term) return true;
      return [it.nombre, it.sku ?? "", it.ubicacion].some((v) => v.toLowerCase().includes(term));
    });
  }, [filtro.filtradas, q, tipo]);

  const totalUnidades = useMemo(() => visibles.reduce((a, it) => a + Number(it.cantidad || 0), 0), [visibles]);

  // ------------------------------------------------------------- Alta/edición
  const [showModal, setShowModal] = useState(false);
  const [editando, setEditando] = useState<InventarioHistoricoItem | null>(null);

  function abrirNuevo() {
    setEditando(null);
    setError("");
    setShowModal(true);
  }

  function abrirEditar(it: InventarioHistoricoItem) {
    if (!esAdmin) return;
    setEditando(it);
    setError("");
    setShowModal(true);
  }

  async function guardado(esNuevo: boolean) {
    setShowModal(false);
    setEditando(null);
    setError("");
    setMsg(esNuevo ? "Registro agregado." : "Registro actualizado.");
    await cargar();
  }

  // ------------------------------------------------------------------ Eliminar
  const [porEliminar, setPorEliminar] = useState<InventarioHistoricoItem | null>(null);
  const [eliminando, setEliminando] = useState(false);

  async function eliminar(it: InventarioHistoricoItem) {
    setEliminando(true);
    try {
      await api(`/inventario-historico/${it.id}`, { method: "DELETE" });
      setPorEliminar(null);
      await cargar();
      setError("");
      setMsg("Registro eliminado.");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setEliminando(false);
    }
  }

  // -------------------------------------------------------------------- CSV
  const [mostrarCsv, setMostrarCsv] = useState(false);
  const [csv, setCsv] = useState("");
  const [importando, setImportando] = useState(false);

  function exportar() {
    const filas: (string | number)[][] = [
      ["nombre", "sku", "tipo", "cantidad", "ubicacion", "notas", "atributos"],
      ...visibles.map((it) => [
        it.nombre,
        it.sku ?? "",
        it.tipo,
        it.cantidad,
        it.ubicacion,
        it.notas ?? "",
        it.atributos.map((a) => `${a.nombre}=${a.valor}`).join(";"),
      ]),
    ];
    descargarCSV("inventario-historico.csv", filas);
  }

  async function importar() {
    if (!csv.trim()) {
      setError("Pega el contenido del CSV.");
      return;
    }
    setImportando(true);
    setError("");
    try {
      const r = await api<{ creados: number; omitidos: number }>("/inventario-historico/importar", {
        method: "POST",
        body: JSON.stringify({ csv }),
      });
      setMsg(`${r.creados} importados, ${r.omitidos} omitidos por duplicado.`);
      setCsv("");
      setMostrarCsv(false);
      await cargar();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setImportando(false);
    }
  }

  return (
    <AppShell>
      <PageHeader
        title="Inventario histórico"
        subtitle="Existencias de productos descontinuados y subensambles. Aislado del inventario vivo."
        actions={
          esAdmin ? (
            <>
              <button type="button" className="btn ghost" onClick={() => { setMostrarCsv(true); setError(""); }}>
                Importar CSV
              </button>
              <button type="button" className="btn ghost" onClick={exportar}>
                Exportar CSV
              </button>
              <button type="button" className="btn primary" onClick={abrirNuevo}>
                + Nuevo registro
              </button>
            </>
          ) : (
            <button type="button" className="btn ghost" onClick={exportar}>
              Exportar CSV
            </button>
          )
        }
      />
      {error && <div className="error">{error}</div>}
      {msg && <div className="msg-ok">{msg}</div>}

      <StickyBar>
        <div className="card" style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <label style={{ flex: 2, minWidth: 200 }}>
            Buscar
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nombre, SKU o ubicación…" />
          </label>
          <div style={{ flex: 2, minWidth: 220, display: "flex", alignItems: "center", gap: 12 }}>
            <BuscadorAtributos filtro={filtro} />
          </div>
          <div style={{ flex: 1, minWidth: 200, display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 12 }}>
            <span className="muted small">
              {visibles.length} registro(s) · {totalUnidades.toLocaleString("es-MX")} u
            </span>
            <Segmented
              value={tipo}
              onChange={(v) => setTipo(v as FiltroTipo)}
              options={[
                { value: "todos", label: "Todos" },
                { value: "descontinuado", label: "Descontinuado" },
                { value: "subensamble", label: "Subensamble" },
              ]}
            />
          </div>
        </div>
      </StickyBar>

      <div className="card" style={{ padding: 0 }}>
        <div className="table-wrap">
          <table className="table" style={{ overflowWrap: "anywhere" }}>
            <thead>
              <tr>
                <th style={{ whiteSpace: "nowrap" }}>Nombre</th>
                <th style={{ whiteSpace: "nowrap" }}>SKU</th>
                <th style={{ whiteSpace: "nowrap" }}>Tipo</th>
                <th className="num" style={{ whiteSpace: "nowrap" }}>Cantidad</th>
                <th style={{ whiteSpace: "nowrap" }}>Ubicación</th>
                <th style={{ whiteSpace: "nowrap" }}>Atributos</th>
                {esAdmin && <th />}
              </tr>
            </thead>
            <tbody>
              {visibles.map((it) => (
                <tr
                  key={it.id}
                  role={esAdmin ? "button" : undefined}
                  tabIndex={esAdmin ? 0 : undefined}
                  style={esAdmin ? { cursor: "pointer" } : undefined}
                  onClick={() => abrirEditar(it)}
                  onKeyDown={(e) => {
                    if (esAdmin && (e.key === "Enter" || e.key === " ")) {
                      e.preventDefault();
                      abrirEditar(it);
                    }
                  }}
                >
                  <td>
                    <strong>{it.nombre}</strong>
                    {it.familia && <div className="muted small">{it.familia}</div>}
                  </td>
                  <td>{it.sku ?? "—"}</td>
                  <td>
                    <span className={`badge ${it.tipo === "subensamble" ? "info" : ""}`}>{it.tipo}</span>
                  </td>
                  <td className="num">{Number(it.cantidad).toLocaleString("es-MX")}</td>
                  <td style={{ whiteSpace: "nowrap" }}>{it.ubicacion}</td>
                  <td>
                    {it.atributos.length === 0 ? (
                      <span className="muted">—</span>
                    ) : (
                      <span className="attr-list">
                        {it.atributos.map((a) => (
                          <span key={a.nombre} className="attr-item">
                            <span className="attr-name">{a.nombre}</span> {a.valor}
                          </span>
                        ))}
                      </span>
                    )}
                  </td>
                  {esAdmin && (
                    <td className="num">
                      <button
                        type="button"
                        className="btn ghost sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          setPorEliminar(it);
                        }}
                      >
                        Eliminar
                      </button>
                    </td>
                  )}
                </tr>
              ))}
              {visibles.length === 0 && (
                <tr>
                  <td colSpan={esAdmin ? 7 : 6} className="empty">
                    Sin registros.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <FiltroAtributosModal filtro={filtro} />

      {showModal && (
        <ItemFormModal
          item={editando}
          productos={productos}
          onGuardado={() => guardado(editando === null)}
          onCerrar={() => { setShowModal(false); setEditando(null); }}
        />
      )}

      {porEliminar && (
        <ConfirmDialog
          title="Eliminar registro"
          message={
            <>
              ¿Seguro que deseas eliminar <strong>{porEliminar.nombre}</strong> ({porEliminar.ubicacion})? Esta acción no
              se puede deshacer.
            </>
          }
          confirmLabel="Eliminar"
          danger
          loading={eliminando}
          onConfirm={() => eliminar(porEliminar)}
          onClose={() => setPorEliminar(null)}
        />
      )}

      {mostrarCsv && (
        <Modal
          title="Importar inventario histórico (CSV)"
          onClose={() => { setMostrarCsv(false); setCsv(""); }}
          size="lg"
        >
          <p className="muted small">
            Columnas: <code>nombre,sku,tipo,cantidad,ubicacion,notas,atributos</code>. El campo <code>atributos</code> va
            como <code>Atributo=Valor;Atributo=Valor</code>. Encabezado opcional; los duplicados por nombre + ubicación +
            tipo se omiten. Los valores con comas deben ir entre comillas dobles.
          </p>
          <textarea
            rows={8}
            value={csv}
            onChange={(e) => setCsv(e.target.value)}
            placeholder={
              'nombre,sku,tipo,cantidad,ubicacion,notas,atributos\n' +
              '"Vastago · 29mm · Blanco",VST-0014,descontinuado,27000,H3,,"Altura de Vastago=29mm;Color de Vastago=Blanco"'
            }
          />
          <div className="row" style={{ marginTop: 12, justifyContent: "flex-end" }}>
            <button type="button" className="btn ghost" onClick={() => { setMostrarCsv(false); setCsv(""); }}>
              Cancelar
            </button>
            <button type="button" className="btn primary" disabled={importando} onClick={importar}>
              {importando ? "Importando…" : "Importar"}
            </button>
          </div>
        </Modal>
      )}
    </AppShell>
  );
}
