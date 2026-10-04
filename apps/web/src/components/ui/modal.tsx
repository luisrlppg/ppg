"use client";

import { useEffect } from "react";

interface Props {
  title?: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
  size?: "sm" | "default" | "lg";
  footer?: React.ReactNode;
}

export default function Modal({ title, onClose, children, size = "default", footer }: Props) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.body.classList.add("modal-open");
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
      document.body.classList.remove("modal-open");
    };
  }, [onClose]);

  const cls = size === "sm" ? "modal sm" : size === "lg" ? "modal lg" : "modal";

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className={cls} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <button type="button" className="modal-close" onClick={onClose} aria-label="Cerrar">
          ×
        </button>
        {title && <h3>{title}</h3>}
        {children}
        {footer && (
          <div className="row" style={{ marginTop: 16, justifyContent: "flex-end" }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
