"use client";

import { useEffect, useMemo, useState } from "react";
import { colorAvatar, iniciales } from "@/lib/avatar";
import { useImagenEstatica, useImagenesLineas } from "@/lib/imagenes";
import type { EtiquetaEmbarque, Venta, VentaLinea } from "@/lib/types";

interface Props {
  venta: Venta;
  linea: VentaLinea;
  onCerrar: () => void;
}

const HEADER_DEFAULT = {
  titulo: "Plásticos Plasa de Guadalajara S.A. de C.V.",
  direccion: "Calle Florentino Acosta #1090",
  ciudad: "Guadalajara, Jalisco   C.P.44329",
  contacto: "Teléfono: 33-3651-5424    www.plasticosplasa.com",
};

const FOOTER_DEFAULT = "Generado por Plásticos Plasa - Etiqueta personalizada";

export default function ModalEtiqueta({ venta, linea, onCerrar }: Props) {
  const [cantidad, setCantidad] = useState(String(linea.cantidad));
  const [pesoBruto, setPesoBruto] = useState("");
  const [pesoNeto, setPesoNeto] = useState("");
  const [pesoUnitario, setPesoUnitario] = useState("");
  const [descargando, setDescargando] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [generando, setGenerando] = useState(true);

  const imagenes = useImagenesLineas([linea]);
  const imagenProducto = imagenes[linea.id] ?? null;
  const imagenFragil = useImagenEstatica("/etiqueta-fragil.png");

  const etiqueta = useMemo<EtiquetaEmbarque>(
    () => ({
      cliente: {
        nombre: venta.partner?.nombre ?? venta.nombreEnvio ?? "Público general",
        telefono: venta.partner?.telefono ?? venta.telefonoEnvio ?? "",
        direccion: venta.partner?.direccion ?? "",
        email: venta.partner?.email ?? venta.emailEnvio ?? "",
      },
      producto: {
        nombre: linea.producto,
        sku: linea.sku,
        valoracion: linea.valoracion ?? [],
      },
      cantidad,
      pesoBruto,
      pesoNeto,
      pesoUnitario,
      header: HEADER_DEFAULT,
      footer: FOOTER_DEFAULT,
    }),
    [venta, linea, cantidad, pesoBruto, pesoNeto, pesoUnitario],
  );

  const props = useMemo(
    () => ({
      etiqueta,
      imagenProducto,
      imagenFragil,
      avatarProducto: { color: colorAvatar(linea.variantId), iniciales: iniciales(linea.producto) },
    }),
    [etiqueta, imagenProducto, imagenFragil, linea.variantId, linea.producto],
  );

  useEffect(() => {
    let activo = true;
    setGenerando(true);
    (async () => {
      const [{ pdf }, { EtiquetaPDF: Doc }] = await Promise.all([
        import("@react-pdf/renderer"),
        import("./etiqueta-pdf"),
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
      const [{ pdf }, { EtiquetaPDF: Doc }] = await Promise.all([
        import("@react-pdf/renderer"),
        import("./etiqueta-pdf"),
      ]);
      const blob = await pdf(<Doc {...props} />).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Etiqueta-${venta.numero}-${linea.sku}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setDescargando(false);
    }
  }

  return (
    <div className="doc-overlay">
      <div className="doc-toolbar" style={{ maxWidth: 980 }}>
        <div className="row" style={{ flex: 1, minWidth: 320, margin: 0 }}>
          <label style={{ flex: 1, minWidth: 110 }}>
            Cantidad
            <input value={cantidad} onChange={(e) => setCantidad(e.target.value)} />
          </label>
          <label style={{ flex: 1, minWidth: 110 }}>
            Peso bruto
            <input value={pesoBruto} onChange={(e) => setPesoBruto(e.target.value)} placeholder="Ej: 25 kg" />
          </label>
          <label style={{ flex: 1, minWidth: 110 }}>
            Peso neto
            <input value={pesoNeto} onChange={(e) => setPesoNeto(e.target.value)} placeholder="Ej: 23 kg" />
          </label>
          <label style={{ flex: 1, minWidth: 110 }}>
            Peso unitario
            <input value={pesoUnitario} onChange={(e) => setPesoUnitario(e.target.value)} placeholder="Ej: 0.23 kg" />
          </label>
        </div>
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

      <div className="doc-pdf-frame" style={{ maxWidth: 980 }}>
        {pdfUrl ? (
          <iframe
            title={`Etiqueta ${linea.sku}`}
            src={pdfUrl}
            style={{ width: "100%", height: "100%", border: 0 }}
          />
        ) : (
          <div className="doc-pdf-loading">Generando etiqueta…</div>
        )}
      </div>
    </div>
  );
}
