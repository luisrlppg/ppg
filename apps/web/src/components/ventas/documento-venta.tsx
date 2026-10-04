"use client";

import { useMemo, useState } from "react";
import { useFormatCantidad } from "@/lib/preferences";
import { colorAvatar, iniciales } from "@/lib/avatar";
import type { Venta, VentaLinea } from "@/lib/types";

interface Props {
  venta: Venta;
  onCerrar: () => void;
}

const IVA = 0.16;
const EMPRESA = "Plásticos Plasa";

function LineaImagen({ linea }: { linea: VentaLinea }) {
  const [error, setError] = useState(false);
  const src = linea.imagen;
  const placeholder = !src || error;
  return (
    <div className="doc-thumb" style={placeholder ? { background: colorAvatar(linea.variantId) } : undefined}>
      {placeholder ? (
        <span className="doc-thumb-iniciales">{iniciales(linea.producto)}</span>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={linea.producto} onError={() => setError(true)} />
      )}
    </div>
  );
}

export default function DocumentoVenta({ venta, onCerrar }: Props) {
  const formatCantidad = useFormatCantidad();
  const [cobrarIva, setCobrarIva] = useState(false);

  const subtotal = useMemo(() => venta.lines.reduce((a, l) => a + l.subtotal, 0), [venta.lines]);
  const iva = cobrarIva ? subtotal * IVA : 0;
  const total = subtotal + iva;

  const cliente = venta.partner;
  const nombreCliente = cliente?.nombre ?? venta.nombreEnvio ?? "Público general";
  const telefono = cliente?.telefono ?? venta.telefonoEnvio ?? null;
  const email = cliente?.email ?? venta.emailEnvio ?? null;
  const numeroCliente = cliente ? String(cliente.id).padStart(4, "0") : "—";

  return (
    <div className="doc-overlay">
      <div className="doc-toolbar no-print">
        <label className="doc-iva-toggle">
          <input type="checkbox" checked={cobrarIva} onChange={(e) => setCobrarIva(e.target.checked)} />
          Cobrar IVA (16%)
        </label>
        <div className="row" style={{ flex: 0 }}>
          <button type="button" className="btn ghost" onClick={onCerrar}>
            Cerrar
          </button>
          <button type="button" className="btn primary" onClick={() => window.print()}>
            Imprimir
          </button>
        </div>
      </div>

      <div className="print-doc">
        <header className="doc-header">
          <div>
            <div className="doc-empresa">{EMPRESA}</div>
            <div className="muted small">Documento de venta</div>
          </div>
          <div className="doc-titulo">Orden de compra</div>
        </header>

        <div className="doc-meta">
          <div>
            <span className="doc-meta-label">Nº de orden</span>
            <strong>{venta.numero}</strong>
          </div>
          <div>
            <span className="doc-meta-label">Fecha</span>
            <strong>{new Date(venta.fecha).toLocaleDateString("es-MX")}</strong>
          </div>
          <div>
            <span className="doc-meta-label">Nº de cliente</span>
            <strong>{numeroCliente}</strong>
          </div>
        </div>

        <section className="doc-cliente">
          <h4>Cliente</h4>
          <div className="doc-cliente-grid">
            <div><span className="doc-meta-label">Nombre</span>{nombreCliente}</div>
            {cliente?.empresa && <div><span className="doc-meta-label">Empresa</span>{cliente.empresa}</div>}
            {telefono && <div><span className="doc-meta-label">Teléfono</span>{telefono}</div>}
            {email && <div><span className="doc-meta-label">Email</span>{email}</div>}
            {cliente?.direccion && <div className="doc-cliente-full"><span className="doc-meta-label">Dirección</span>{cliente.direccion}</div>}
          </div>
        </section>

        <table className="doc-table">
          <thead>
            <tr>
              <th style={{ width: 56 }}></th>
              <th>Producto</th>
              <th className="num">Cant.</th>
              <th className="num">Precio</th>
              <th className="num">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {venta.lines.map((l) => (
              <tr key={l.id}>
                <td><LineaImagen linea={l} /></td>
                <td>
                  <strong>{l.producto}</strong>
                  <div className="small muted">{l.nombre} · {l.sku}</div>
                </td>
                <td className="num">{formatCantidad(l.cantidad)} {l.uom}</td>
                <td className="num">${(l.precioUnitario ?? 0).toFixed(2)}</td>
                <td className="num">${(l.subtotal ?? 0).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="doc-totales">
          <div className="doc-total-row">
            <span>Subtotal</span>
            <span>${subtotal.toFixed(2)}</span>
          </div>
          {cobrarIva && (
            <div className="doc-total-row">
              <span>IVA (16%)</span>
              <span>${iva.toFixed(2)}</span>
            </div>
          )}
          <div className="doc-total-row doc-total-final">
            <span>Total</span>
            <span>${total.toFixed(2)}</span>
          </div>
        </div>

        {venta.notas && (
          <div className="doc-notas">
            <span className="doc-meta-label">Notas</span>
            {venta.notas}
          </div>
        )}
      </div>
    </div>
  );
}
