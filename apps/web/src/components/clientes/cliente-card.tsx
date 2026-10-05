"use client";

import { colorAvatar, iniciales } from "@/lib/avatar";
import type { Partner } from "@/lib/types";

interface Props {
  cliente: Partner;
  onEditar: (c: Partner) => void;
}

export default function ClienteCard({ cliente, onEditar }: Props) {
  return (
    <div
      className="cliente-card"
      role="button"
      tabIndex={0}
      style={{ cursor: "pointer" }}
      onClick={() => onEditar(cliente)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onEditar(cliente);
        }
      }}
    >
      <div className="cliente-card-head">
        <span className="cliente-avatar" style={{ background: colorAvatar(cliente.id) }}>
          {iniciales(cliente.nombre)}
        </span>
        <div className="cliente-card-id">
          <strong className="cliente-card-nombre">{cliente.nombre}</strong>
          {cliente.empresa && <span className="muted small">{cliente.empresa}</span>}
          {!cliente.activo && <span className="badge critico">inactivo</span>}
        </div>
      </div>

      <div className="cliente-card-body">
        <span className="muted small">{cliente.telefono ? `Tel: ${cliente.telefono}` : "Sin teléfono"}</span>
        <span className="muted small">{cliente.email ?? "Sin email"}</span>
        {cliente.direccion && <span className="muted-2 small">{cliente.direccion}</span>}
      </div>

      <div className="cliente-card-foot">
        <span className="kbd-chip">{cliente.ordenes ?? 0} venta(s)</span>
      </div>
    </div>
  );
}
