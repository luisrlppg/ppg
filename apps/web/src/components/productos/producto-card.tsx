"use client";

import { useState } from "react";
import Link from "next/link";
import { colorAvatar, iniciales } from "@/lib/avatar";
import { useFormatCantidad } from "@/lib/preferences";
import type { ProductoLite } from "@/lib/types";

interface Props {
  producto: ProductoLite;
}

export default function ProductoCard({ producto }: Props) {
  const formatCantidad = useFormatCantidad();
  const [imgError, setImgError] = useState(false);
  const src = producto.imagen;
  const mostrarPlaceholder = !src || imgError;

  return (
    <div className="product-card">
      <Link href={`/productos/${producto.id}`} className="product-card-link">
        <div
          className="product-thumb"
          style={mostrarPlaceholder ? { background: colorAvatar(producto.id) } : undefined}
        >
          {mostrarPlaceholder || !src ? (
            <span className="product-thumb-initials">{iniciales(producto.nombre)}</span>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={src} alt={producto.nombre} onError={() => setImgError(true)} />
          )}
        </div>
        <div className="product-card-body">
          <strong className="product-card-title">{producto.nombre}</strong>
          <span className="muted-2 small">{producto.skuBase}</span>
          <div className="product-card-meta">
            <span className="kbd-chip">{producto.categoria ?? "Sin categoría"}</span>
            <span className="kbd-chip">{producto.variantes} var.</span>
            <span className="kbd-chip">
              {formatCantidad(producto.stockTotal)} {producto.uom}
            </span>
          </div>
          <span className="muted small">${Number(producto.basePrice).toFixed(2)}</span>
        </div>
      </Link>
    </div>
  );
}
