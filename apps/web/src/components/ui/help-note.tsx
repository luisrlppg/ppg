"use client";

import { useState } from "react";

export default function HelpNote({
  children,
  closable = false,
}: {
  children: React.ReactNode;
  closable?: boolean;
}) {
  const [oculto, setOculto] = useState(false);
  if (closable && oculto) return null;

  return (
    <div className="help-note">
      <span className="help-icon">i</span>
      <div className="help-note-body">{children}</div>
      {closable && (
        <button type="button" className="help-close" onClick={() => setOculto(true)} aria-label="Cerrar">
          ×
        </button>
      )}
    </div>
  );
}
