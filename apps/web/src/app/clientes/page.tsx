"use client";

import { useCallback, useEffect, useState } from "react";
import AppShell from "@/components/app-shell";
import PageHeader from "@/components/ui/page-header";
import Modal from "@/components/ui/modal";
import ConfirmDialog from "@/components/ui/confirm-dialog";
import Segmented from "@/components/ui/segmented";
import StickyBar from "@/components/ui/sticky-bar";
import ClienteCard from "@/components/clientes/cliente-card";
import ClienteFormModal from "@/components/clientes/cliente-form-modal";
import { api } from "@/lib/api";
import { guardarVistaClientes, leerVistaClientes, type VistaClientes } from "@/lib/local-store";
import type { Partner } from "@/lib/types";

export default function ClientesPage() {
  const [clientes, setClientes] = useState<Partner[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  const [vista, setVista] = useState<VistaClientes>("tabla");
  useEffect(() => {
    setVista(leerVistaClientes());
  }, []);
  function cambiarVista(v: VistaClientes) {
    setVista(v);
    guardarVistaClientes(v);
  }

  // ------------------------------------------------------------- Alta/edición
  const [showModal, setShowModal] = useState(false);
  const [editando, setEditando] = useState<Partner | null>(null);

  function abrirNuevo() {
    setEditando(null);
    setError("");
    setShowModal(true);
  }

  function abrirEditar(c: Partner) {
    setEditando(c);
    setError("");
    setShowModal(true);
  }

  function cerrarModal() {
    setShowModal(false);
    setEditando(null);
  }

  const cargar = useCallback(async () => {
    const qs = busqueda ? `?search=${encodeURIComponent(busqueda)}` : "";
    setClientes(await api<Partner[]>(`/clientes${qs}`));
  }, [busqueda]);

  useEffect(() => {
    const t = setTimeout(() => cargar().catch((e) => setError(e.message)), 150);
    return () => clearTimeout(t);
  }, [cargar]);

  async function guardado(esNuevo: boolean) {
    cerrarModal();
    setError("");
    setMsg(esNuevo ? "Cliente agregado." : "Cliente actualizado.");
    await cargar();
  }

  // ------------------------------------------------------------------ Eliminar
  const [porEliminar, setPorEliminar] = useState<Partner | null>(null);
  const [eliminando, setEliminando] = useState(false);
  const [bloqueo, setBloqueo] = useState<{ c: Partner; motivo: string } | null>(null);

  async function eliminar(c: Partner) {
    setEliminando(true);
    try {
      await api(`/clientes/${c.id}/definitivo`, { method: "DELETE" });
      setPorEliminar(null);
      await cargar();
      setError("");
      setMsg(`Cliente "${c.nombre}" eliminado.`);
    } catch (err) {
      setPorEliminar(null);
      setBloqueo({ c, motivo: (err as Error).message });
    } finally {
      setEliminando(false);
    }
  }

  async function desactivar(c: Partner) {
    try {
      await api(`/clientes/${c.id}`, { method: "DELETE" });
      setBloqueo(null);
      await cargar();
      setError("");
      setMsg(`Cliente "${c.nombre}" desactivado.`);
    } catch (err) {
      setBloqueo(null);
      setMsg("");
      setError((err as Error).message);
    }
  }

  // -------------------------------------------------------------------- CSV
  const [mostrarCsv, setMostrarCsv] = useState(false);
  const [csv, setCsv] = useState("");
  const [importando, setImportando] = useState(false);

  async function importar() {
    if (!csv.trim()) {
      setError("Pega el contenido del CSV.");
      return;
    }
    setImportando(true);
    setError("");
    try {
      const r = await api<{ creados: number; omitidos: number }>("/clientes/importar", {
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
        title="Clientes"
        subtitle="Alta, edición e importación por CSV de los clientes."
        actions={
          <>
            <button type="button" className="btn ghost" onClick={() => { setMostrarCsv(true); setError(""); }}>
              Importar CSV
            </button>
            <button type="button" className="btn primary" onClick={abrirNuevo}>
              + Nuevo cliente
            </button>
          </>
        }
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
            placeholder="Nombre, teléfono o email…"
          />
        </label>
        <div style={{ flex: 1, minWidth: 200, display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 12 }}>
          <span className="muted small">{clientes.length} cliente(s)</span>
          <Segmented
            value={vista}
            onChange={(v) => cambiarVista(v as VistaClientes)}
            options={[
              { value: "tabla", label: "Tabla" },
              { value: "grid", label: "Grid" },
            ]}
          />
        </div>
      </div>
      </StickyBar>

      {vista === "grid" ? (
        clientes.length === 0 ? (
          <div className="card empty">Sin clientes todavía. Usa “Nuevo cliente” para crear el primero.</div>
        ) : (
          <div className="cards-grid">
            {clientes.map((c) => (
              <ClienteCard key={c.id} cliente={c} onEditar={abrirEditar} />
            ))}
          </div>
        )
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <div className="table-wrap">
            <table className="table" style={{ overflowWrap: "anywhere" }}>
              <thead>
                <tr>
                  <th style={{ whiteSpace: "nowrap" }}>Nombre</th>
                  <th style={{ whiteSpace: "nowrap" }}>Empresa</th>
                  <th style={{ whiteSpace: "nowrap" }}>Teléfono</th>
                  <th style={{ whiteSpace: "nowrap" }}>Dirección</th>
                  <th className="num" style={{ whiteSpace: "nowrap" }}>Ventas</th>
                </tr>
              </thead>
              <tbody>
                {clientes.map((c) => (
                  <tr
                    key={c.id}
                    role="button"
                    tabIndex={0}
                    style={{ cursor: "pointer" }}
                    onClick={() => abrirEditar(c)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        abrirEditar(c);
                      }
                    }}
                  >
                    <td>
                      <strong>{c.nombre}</strong>
                      {!c.activo && <span className="badge critico" style={{ marginLeft: 8 }}>inactivo</span>}
                    </td>
                    <td>{c.empresa ?? "—"}</td>
                    <td style={{ whiteSpace: "nowrap" }}>{c.telefono ?? "—"}</td>
                    <td>{c.direccion ?? "—"}</td>
                    <td className="num">{c.ordenes ?? 0}</td>
                  </tr>
                ))}
                {clientes.length === 0 && (
                  <tr>
                    <td colSpan={5} className="empty">Sin clientes.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showModal && (
        <ClienteFormModal
          cliente={editando}
          onGuardado={() => guardado(editando === null)}
          onEliminar={(c) => { cerrarModal(); setPorEliminar(c); }}
          onCerrar={cerrarModal}
        />
      )}

      {mostrarCsv && (
        <Modal
          title="Importar clientes (CSV)"
          onClose={() => { setMostrarCsv(false); setCsv(""); }}
          size="lg"
        >
          <p className="muted small">
            Pega el contenido: <code>nombre,telefono,direccion,email,empresa</code> (empresa opcional; una fila por cliente,
            encabezado opcional). Duplicados por nombre + empresa se omiten.
          </p>
          <textarea
            rows={8}
            value={csv}
            onChange={(e) => setCsv(e.target.value)}
            placeholder={"Maria Lopez,555-1234,Calle 5 #12,maria@michoacana.mx,Dulceria La Michoacana\nJugueria El Tesoro,555-9876,Fco. Larrosa 40,,Jugueria El Tesoro"}
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

      {porEliminar && (
        <ConfirmDialog
          title="Eliminar cliente"
          message={
            <>
              ¿Seguro que deseas eliminar <strong>{porEliminar.nombre}</strong>? Esta acción no se puede deshacer.
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
          onConfirm={() => desactivar(bloqueo.c)}
          onClose={() => setBloqueo(null)}
        />
      )}
    </AppShell>
  );
}
