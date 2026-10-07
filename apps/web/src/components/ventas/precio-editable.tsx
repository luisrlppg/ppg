"use client";

import { useRef, useState } from "react";

interface Props {
  value: number;
  disabled?: boolean;
  onSave: (nuevo: number) => Promise<void> | void;
}

/**
 * Celda de precio editable. Clic para editar; Enter y blur confirman,
 * Esc cancela. Si el valor no cambia o queda vacío, no se registra nada.
 */
export default function PrecioEditable({ value, disabled, onSave }: Props) {
  const [editando, setEditando] = useState(false);
  const [val, setVal] = useState("");
  const cancelarRef = useRef(false);
  const guardandoRef = useRef(false);

  function empezar() {
    if (disabled) return;
    setVal(String(value));
    cancelarRef.current = false;
    setEditando(true);
  }

  async function commit() {
    if (guardandoRef.current) return;
    setEditando(false);
    if (val.trim() === "") return;
    const nuevo = Number(val);
    if (!Number.isFinite(nuevo) || nuevo < 0 || nuevo === value) return;
    guardandoRef.current = true;
    try {
      await onSave(nuevo);
    } finally {
      guardandoRef.current = false;
    }
  }

  if (editando) {
    return (
      <input
        type="number"
        step="0.01"
        min="0"
        value={val}
        autoFocus
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => setVal(e.target.value)}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            e.currentTarget.blur();
          } else if (e.key === "Escape") {
            cancelarRef.current = true;
            e.currentTarget.blur();
          }
        }}
        onBlur={() => {
          if (cancelarRef.current) {
            cancelarRef.current = false;
            setEditando(false);
            return;
          }
          void commit();
        }}
        className="cell-editable-input"
      />
    );
  }

  return (
    <button
      type="button"
      className="cell-editable"
      onClick={empezar}
      disabled={disabled}
      title="Clic para editar el precio (solo esta venta)"
    >
      ${value.toFixed(2)}
    </button>
  );
}
