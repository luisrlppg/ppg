"use client";

import { useEffect, useState } from "react";
import Modal from "@/components/ui/modal";
import { api } from "@/lib/api";
import type { Partner } from "@/lib/types";

export interface ClienteForm {
  nombre: string;
  empresa: string;
  telefono: string;
  direccion: string;
  email: string;
}

export const clienteFormVacio: ClienteForm = { nombre: "", empresa: "", telefono: "", direccion: "", email: "" };

interface Props {
  cliente?: Partner | null;
  onGuardado: (partner: Partner) => void;
  onCerrar: () => void;
}

function aForm(c: Partner | null | undefined): ClienteForm {
  if (!c) return clienteFormVacio;
  return {
    nombre: c.nombre,
    empresa: c.empresa ?? "",
    telefono: c.telefono ?? "",
    direccion: c.direccion ?? "",
    email: c.email ?? "",
  };
}

export default function ClienteFormModal({ cliente, onGuardado, onCerrar }: Props) {
  const editId = cliente?.id ?? null;
  const [form, setForm] = useState<ClienteForm>(() => aForm(cliente));
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    setForm(aForm(cliente));
  }, [cliente]);

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
      const partner =
        editId === null
          ? await api<Partner>("/clientes", { method: "POST", body })
          : await api<Partner>(`/clientes/${editId}`, { method: "PATCH", body });
      onGuardado(partner);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Modal title={editId === null ? "Nuevo cliente" : "Editar cliente"} onClose={onCerrar} size="lg">
      {error && <div className="error">{error}</div>}
      <form onSubmit={guardar}>
        <label>
          Nombre *
          <input
            value={form.nombre}
            onChange={(e) => setForm({ ...form, nombre: e.target.value })}
            placeholder="Nombre de la persona o empresa"
            autoFocus
          />
        </label>
        <label>
          Empresa
          <input value={form.empresa} onChange={(e) => setForm({ ...form, empresa: e.target.value })} placeholder="opcional" />
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
        <div className="row" style={{ marginTop: 12, justifyContent: "flex-end" }}>
          <button type="button" className="btn ghost" onClick={onCerrar}>
            Cancelar
          </button>
          <button className="btn primary" disabled={guardando}>
            {guardando ? "Guardando…" : editId === null ? "Agregar cliente" : "Guardar cambios"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
