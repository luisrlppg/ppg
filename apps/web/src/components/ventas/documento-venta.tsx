"use client";

import { useEffect, useMemo, useState } from "react";
import { useImagenesLineas } from "@/lib/imagenes";
import { useFormatCantidad } from "@/lib/preferences";
import type { Venta } from "@/lib/types";

interface Props {
  venta: Venta;
  onCerrar: () => void;
}

export default function DocumentoVenta({ venta, onCerrar }: Props) {
  const formatCantidad = useFormatCantidad();
  const [cobrarIva, setCobrarIva] = useState(false);
  const [descargando, setDescargando] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [generando, setGenerando] = useState(true);
  const imagenes = useImagenesLineas(venta.lines);

  const props = useMemo(
    () => ({ venta, cobrarIva, imagenes, formatCantidad }),
    [venta, cobrarIva, imagenes, formatCantidad],
  );

  useEffect(() => {
    let activo = true;
    setGenerando(true);
    (async () => {
      const [{ pdf }, { DocumentoPDF: Doc }] = await Promise.all([
        import("@react-pdf/renderer"),
        import("./documento-venta-pdf"),
      ]);
      const blob = await pdf(<Doc {...props} />).toBlob();
      if (!activo) return;
      setPdfUrl(URL.createObjectURL(blob));
      setGenerando(false);
    })().catch(() => {
      if (activo) setGenerando(false);
    });
    return () => {
      activo = false;
    };
  }, [props]);

  useEffect(() => {
    return () => {
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    };
  }, [pdfUrl]);

  async function descargar() {
    setDescargando(true);
    try {
      const [{ pdf }, { DocumentoPDF: Doc }] = await Promise.all([
        import("@react-pdf/renderer"),
        import("./documento-venta-pdf"),
      ]);
      const blob = await pdf(<Doc {...props} />).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Venta-${venta.numero}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setDescargando(false);
    }
  }

  return (
    <div className="doc-overlay">
      <div className="doc-toolbar">
        <label className="doc-iva-toggle">
          <input type="checkbox" checked={cobrarIva} onChange={(e) => setCobrarIva(e.target.checked)} />
          Cobrar IVA (16%)
        </label>
        <div className="row" style={{ flex: 0 }}>
          <button type="button" className="btn ghost" onClick={onCerrar}>
            Cerrar
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={descargando || generando}
            onClick={descargar}
          >
            {descargando ? "Generando…" : "Descargar PDF"}
          </button>
        </div>
      </div>

      <div className="doc-pdf-frame">
        {pdfUrl ? (
          <iframe
            title={`Venta ${venta.numero}`}
            src={pdfUrl}
            style={{ width: "100%", height: "100%", border: 0 }}
          />
        ) : (
          <div className="doc-pdf-loading">Generando documento…</div>
        )}
      </div>
    </div>
  );
}
