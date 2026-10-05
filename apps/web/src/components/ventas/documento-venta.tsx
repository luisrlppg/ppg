"use client";

import { useEffect, useMemo, useState } from "react";
import { useFormatCantidad } from "@/lib/preferences";
import type { Venta } from "@/lib/types";

interface Props {
  venta: Venta;
  onCerrar: () => void;
}

function useLineaImagenes(venta: Venta) {
  const [imagenes, setImagenes] = useState<Record<number, string>>({});

  useEffect(() => {
    let activo = true;
    async function cargar() {
      const entradas = await Promise.all(
        venta.lines.map(async (l) => {
          if (!l.imagen) return [l.id, null] as const;
          try {
            const res = await fetch(l.imagen, { mode: "cors" });
            if (!res.ok) return [l.id, null] as const;
            const blob = await res.blob();
            const dataUrl = await new Promise<string>((resolve, reject) => {
              const fr = new FileReader();
              fr.onload = () => resolve(String(fr.result));
              fr.onerror = () => reject(fr.error);
              fr.readAsDataURL(blob);
            });
            return [l.id, dataUrl] as const;
          } catch {
            return [l.id, null] as const;
          }
        }),
      );
      if (!activo) return;
      const mapa: Record<number, string> = {};
      for (const [id, url] of entradas) {
        if (url) mapa[id] = url;
      }
      setImagenes(mapa);
    }
    void cargar();
    return () => {
      activo = false;
    };
  }, [venta]);

  return imagenes;
}

export default function DocumentoVenta({ venta, onCerrar }: Props) {
  const formatCantidad = useFormatCantidad();
  const [cobrarIva, setCobrarIva] = useState(false);
  const [descargando, setDescargando] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [generando, setGenerando] = useState(true);
  const imagenes = useLineaImagenes(venta);

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
