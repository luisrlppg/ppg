"use client";

import { useCallback, useEffect, useState } from "react";
import AppShell from "@/components/app-shell";
import PageHeader from "@/components/ui/page-header";
import Modal from "@/components/ui/modal";
import ConfirmDialog from "@/components/ui/confirm-dialog";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/preferences";
import { ROLES, type Role } from "@ppg/shared";
import type { Usuario } from "@/lib/types";

const ETIQUETA_ROL: Record<Role, string> = {
  admin: "Administrador",
  operador: "Operador",
};

export default function UsuariosPage() {
  const { user } = useAuth();
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  const cargar = useCallback(async () => {
    setUsuarios(await api<Usuario[]>("/usuarios"));
  }, []);

  useEffect(() => {
    cargar().catch((e) => setError((e as Error).message));
  }, [cargar]);

  // ------------------------------------------------------------ Alta/edición
  const [showModal, setShowModal] = useState(false);
  const [editando, setEditando] = useState<Usuario | null>(null);
  const [form, setForm] = useState({
    username: "",
    nombre: "",
    password: "",
    role: "operador" as Role,
    active: true,
  });
  const [guardando, setGuardando] = useState(false);

  function abrirNuevo() {
    setEditando(null);
    setForm({ username: "", nombre: "", password: "", role: "operador", active: true });
    setError("");
    setShowModal(true);
  }

  function abrirEditar(u: Usuario) {
    setEditando(u);
    setForm({ username: u.username, nombre: u.nombre, password: "", role: u.role, active: u.active });
    setError("");
    setShowModal(true);
  }

  async function guardar() {
    setGuardando(true);
    setError("");
    try {
      if (editando) {
        await api(`/usuarios/${editando.id}`, {
          method: "PATCH",
          body: JSON.stringify({ nombre: form.nombre, role: form.role, active: form.active }),
        });
        setMsg(`Usuario "${form.nombre}" actualizado.`);
      } else {
        await api("/usuarios", {
          method: "POST",
          body: JSON.stringify({
            username: form.username,
            nombre: form.nombre,
            password: form.password,
            role: form.role,
          }),
        });
        setMsg(`Usuario "${form.nombre}" creado.`);
      }
      setShowModal(false);
      setEditando(null);
      await cargar();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGuardando(false);
    }
  }

  // ---------------------------------------------------------------- Password
  const [cambiando, setCambiando] = useState<Usuario | null>(null);
  const [nuevaPass, setNuevaPass] = useState("");
  const [guardandoPass, setGuardandoPass] = useState(false);

  async function cambiarPassword() {
    if (!cambiando) return;
    setGuardandoPass(true);
    setError("");
    try {
      await api(`/usuarios/${cambiando.id}/password`, {
        method: "PATCH",
        body: JSON.stringify({ password: nuevaPass }),
      });
      setMsg(`Contraseña actualizada para "${cambiando.nombre}".`);
      setCambiando(null);
      setNuevaPass("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGuardandoPass(false);
    }
  }

  // ----------------------------------------------------- Activar/desactivar
  const [porDesactivar, setPorDesactivar] = useState<Usuario | null>(null);
  const [procesando, setProcesando] = useState(false);

  async function alternarActivo(u: Usuario, active: boolean) {
    setProcesando(true);
    setError("");
    try {
      await api(`/usuarios/${u.id}`, { method: "PATCH", body: JSON.stringify({ active }) });
      await cargar();
      setMsg(`Usuario "${u.nombre}" ${active ? "activado" : "desactivado"}.`);
      setPorDesactivar(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setProcesando(false);
    }
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
        title="Usuarios"
        subtitle="Cuentas de acceso al ERP y el rol de cada una."
        actions={
          <button type="button" className="btn primary" onClick={abrirNuevo}>
            + Nuevo usuario
          </button>
        }
      />
      {error && <div className="error">{error}</div>}
      {msg && <div className="msg-ok">{msg}</div>}

      <div className="card" style={{ padding: 0 }}>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Usuario</th>
                <th>Rol</th>
                <th>Estado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {usuarios.map((u) => (
                <tr key={u.id}>
                  <td>
                    <strong>{u.nombre}</strong>
                  </td>
                  <td>{u.username}</td>
                  <td>{ETIQUETA_ROL[u.role]}</td>
                  <td>
                    {u.active ? (
                      <span className="badge normal">activo</span>
                    ) : (
                      <span className="badge critico">inactivo</span>
                    )}
                  </td>
                  <td>
                    <button type="button" className="btn sm" onClick={() => abrirEditar(u)}>
                      Editar
                    </button>{" "}
                    <button
                      type="button"
                      className="btn ghost sm"
                      onClick={() => {
                        setCambiando(u);
                        setNuevaPass("");
                        setError("");
                      }}
                    >
                      Contraseña
                    </button>{" "}
                    {u.active ? (
                      <button
                        type="button"
                        className="btn ghost sm"
                        disabled={u.id === user?.id}
                        title={u.id === user?.id ? "No puedes desactivar tu propia cuenta" : undefined}
                        onClick={() => {
                          setPorDesactivar(u);
                          setError("");
                        }}
                      >
                        Desactivar
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn ghost sm"
                        disabled={procesando}
                        onClick={() => alternarActivo(u, true)}
                      >
                        Activar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {usuarios.length === 0 && (
                <tr>
                  <td colSpan={5} className="empty">Sin usuarios.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <Modal
          title={editando ? `Editar ${editando.nombre}` : "Nuevo usuario"}
          onClose={() => { setShowModal(false); setEditando(null); }}
          footer={
            <>
              <button type="button" className="btn ghost" onClick={() => { setShowModal(false); setEditando(null); }}>
                Cancelar
              </button>
              <button type="button" className="btn primary" disabled={guardando} onClick={guardar}>
                {guardando ? "Guardando…" : "Guardar"}
              </button>
            </>
          }
        >
          <div style={{ display: "grid", gap: 12 }}>
            <label>
              Usuario
              <input
                value={form.username}
                disabled={editando !== null}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                placeholder="juan"
              />
            </label>
            <label>
              Nombre
              <input
                value={form.nombre}
                onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                placeholder="Juan Pérez"
              />
            </label>
            {!editando && (
              <label>
                Contraseña
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  placeholder="Mínimo 4 caracteres"
                />
              </label>
            )}
            <label>
              Rol
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ETIQUETA_ROL[r]}
                  </option>
                ))}
              </select>
            </label>
            {editando && (
              <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  type="checkbox"
                  checked={form.active}
                  disabled={editando.id === user?.id}
                  onChange={(e) => setForm({ ...form, active: e.target.checked })}
                />
                Cuenta activa
              </label>
            )}
          </div>
        </Modal>
      )}

      {cambiando && (
        <Modal
          title={`Cambiar contraseña · ${cambiando.nombre}`}
          size="sm"
          onClose={() => { setCambiando(null); setNuevaPass(""); }}
          footer={
            <>
              <button type="button" className="btn ghost" onClick={() => { setCambiando(null); setNuevaPass(""); }}>
                Cancelar
              </button>
              <button
                type="button"
                className="btn primary"
                disabled={guardandoPass || nuevaPass.length < 4}
                onClick={cambiarPassword}
              >
                {guardandoPass ? "Guardando…" : "Cambiar"}
              </button>
            </>
          }
        >
          <label>
            Nueva contraseña
            <input
              type="password"
              value={nuevaPass}
              onChange={(e) => setNuevaPass(e.target.value)}
              placeholder="Mínimo 4 caracteres"
            />
          </label>
        </Modal>
      )}

      {porDesactivar && (
        <ConfirmDialog
          title="Desactivar usuario"
          message={
            <>
              ¿Seguro que deseas desactivar a <strong>{porDesactivar.nombre}</strong>? No podrá iniciar sesión.
            </>
          }
          confirmLabel="Desactivar"
          danger
          loading={procesando}
          onConfirm={() => alternarActivo(porDesactivar, false)}
          onClose={() => setPorDesactivar(null)}
        />
      )}
    </AppShell>
  );
}
