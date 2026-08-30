"use client";

import { useCallback, useEffect, useState } from "react";
import AppShell from "@/components/app-shell";
import { api } from "@/lib/api";
import type { Partner } from "@/lib/types";

interface Form {
  nombre: string;
  telefono: string;
  direccion: string;
  email: string;
}

const vacio: Form = { nombre: "", telefono: "", direccion: "", email: "" };

export default function ClientesPage() {
  const [clientes, setClientes] = useState<Partner[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [form, setForm] = useState<Form>(vacio);
  const [editId, setEditId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [csv, setCsv] = useState("");
  const [mostrarCsv, setMostrarCsv] = useState(false);
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    const qs = busqueda ? `?search=${encodeURIComponent(busqueda)}` : "";
    setClientes(await api<Partner[]>(`/clientes${qs}`));
  }, [busqueda]);

  useEffect(() => {
    const t = setTimeout(() => cargar().catch((e) => setError(e.message)), 150);
    return () => clearTimeout(t);
  }, [cargar]);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (!form.nombre.trim()) {
      setError("El nombre es obligatorio.");
      return;
    }
    setGuardando(true);
    setError("");
    try {
      const body = JSON.stringify({ ...form, nombre: form.nombre.trim() });
      if (editId === null) {
        await api("/clientes", { method: "POST", body });
        setMsg("Cliente agregado.");
      } else {
        await api(`/clientes/${editId}`, { method: "PATCH", body });
        setMsg("Cliente actualizado.");
      }
      setForm(vacio);
      setEditId(null);
      cargar();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setGuardando(false);
    }
  }

  async function eliminar(c: Partner) {
    if (!window.confirm(`¿Eliminar a "${c.nombre}"? Esta acción es irreversible.`)) return;
    try {
      await api(`/clientes/${c.id}`, { method: "DELETE" });
      setMsg("Cliente eliminado.");
      if (editId === c.id) {
        setEditId(null);
        setForm(vacio);
      }
      cargar();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function importar() {
    if (!csv.trim()) {
      setError("Pega el contenido del CSV.");
      return;
    }
    setGuardando(true);
    setError("");
    try {
      const r = await api<{ importados: number; omitidosPorDuplicado: number }>("/clientes/importar", {
        method: "POST",
        body: JSON.stringify({ csv }),
      });
      setMsg(`${r.importados} importados, ${r.omitidosPorDuplicado} omitidos por duplicado.`);
      setCsv("");
      setMostrarCsv(false);
      cargar();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setGuardando(false);
    }
  }

  const filtra = clientes.filter((c) =>
    busqueda.trim() === "" || (c.nombre + " " + (c.telefono ?? "") + " " + (c.email ?? "")).toLowerCase().includes(busqueda.toLowerCase().trim()),
  );

  return (
    <AppShell>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h2 style={{ margin: 0 }}>Clientes</h2>
        <div className="row" style={{ flex: 0 }}>
          <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar…" />
          <button
            className="btn ghost"
            style={{ flex: 0 }}
            onClick={() => {
              setForm(vacio);
              setEditId(null);
              setError("");
            }}
          >
            Nuevo cliente
          </button>
        </div>
      </div>
      {error && <div className="error">{error}</div>}
      {msg && <div className="msg-ok">{msg}</div>}

      <div className="grid-2">
        <div>
          <div className="card">
            <h3 style={{ marginTop: 0 }}>{editId === null ? "Nuevo cliente" : "Editar cliente"}</h3>
            <form onSubmit={guardar}>
              <label>
                Nombre *
                <input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} placeholder="Razón social / nombre" />
              </label>
              <label>
                Teléfono
                <input value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} placeholder="opcional" />
              </label>
              <label>
                Dirección
                <input value={form.direccion} onChange={(e) => setForm({ ...form, direccion: e.target.value })} placeholder="opcional" />
              </label>
              <label>
                Email
                <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="opcional" />
              </label>
              <button className="btn primary block" disabled={guardando}>
                {guardando ? "Guardando…" : editId === null ? "Agregar cliente" : "Guardar cambios"}
              </button>
              {editId !== null && (
                <button type="button" className="btn ghost block" style={{ marginTop: 8 }} onClick={() => { setEditId(null); setForm(vacio); }}>
                  Cancelar edición
                </button>
              )}
            </form>
          </div>

          {mostrarCsv ? (
            <div className="card">
              <h3 style={{ marginTop: 0 }}>Importar clientes (CSV)</h3>
              <p className="muted small">Pega el contenido: <code>nombre,telefono,direccion,email</code> (una fila por cliente, encabezado opcional). Duplicados por nombre se omiten.</p>
              <textarea rows={8} value={csv} onChange={(e) => setCsv(e.target.value)} placeholder={"Dulceria La Michoacana,555-1234,Calle 5 #12,ventas@michoacana.mx\nJugueria El Tesoro,555-9876,Fco. Larrosa 40,,tesoro@puntitos.mx"} />
              <div className="row">
                <button className="btn primary" disabled={guardando} onClick={importar}>
                  Importar
                </button>
                <button className="btn ghost" style={{ flex: 0 }} onClick={() => { setMostrarCsv(false); setCsv(""); }}>
                  Cerrar
                </button>
              </div>
            </div>
          ) : (
            <button className="btn ghost block" onClick={() => { setMostrarCsv(true); setError(""); }}>
              Importar CSV
            </button>
          )}
        </div>

        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <table className="table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Teléfono</th>
                <th>Dirección</th>
                <th>Email</th>
                <th>Ventas</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtra.map((c) => (
                <tr key={c.id}>
                  <td>
                    <strong>{c.nombre}</strong>
                    {!c.activo && <span className="badge critico" style={{ marginLeft: 8 }}>inactivo</span>}
                  </td>
                  <td>{c.telefono ?? "—"}</td>
                  <td>{c.direccion ?? "—"}</td>
                  <td>{c.email ?? "—"}</td>
                  <td>{c.ordenes ?? 0}</td>
                  <td>
                    <button className="btn s" onClick={() => { setEditId(c.id); setForm({ nombre: c.nombre, telefono: c.telefono ?? "", direccion: c.direccion ?? "", email: c.email ?? "" }); setError(""); }}>
                      Editar
                    </button>{" "}
                    <button className="btn ghost s" onClick={() => eliminar(c)}>
                      Eliminar
                    </button>
                  </td>
                </tr>
              ))}
              {filtra.length === 0 && (
                <tr>
                  <td colSpan={6} className="empty">Sin clientes.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}