"use client";

import Modal from "./modal";

interface Props {
  title: string;
  message?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export default function ConfirmDialog({
  title,
  message,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  danger,
  loading,
  onConfirm,
  onClose,
}: Props) {
  return (
    <Modal title={title} onClose={onClose} size="sm">
      {message && <div style={{ marginBottom: 8 }}>{message}</div>}
      <div className="row" style={{ justifyContent: "flex-end" }}>
        <button type="button" className="btn ghost" onClick={onClose}>
          {cancelLabel}
        </button>
        <button type="button" className={danger ? "btn danger" : "btn primary"} onClick={onConfirm} disabled={loading}>
          {loading ? "Procesando…" : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
