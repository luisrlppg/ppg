"use client";

import { useEffect } from "react";
import { useFiltroAtributos, type VarianteFiltrable } from "@/lib/filtro-atributos";

interface Props<T extends VarianteFiltrable> {
  items: T[];
  value: number | null;
  onChange: (variantId: number | null) => void;
  /** Oculta la búsqueda de producto (útil cuando el producto ya es fijo). */
  ocultarBusqueda?: boolean;
  vacio?: string;
}

/**
 * Selector de una variante concreta: busca el producto por nombre y acota con
 * chips por atributo hasta dar con la variante. Reutiliza `useFiltroAtributos`
 * (mismos valores presentes en los items) y pinta todo inline, sin modal.
 */
export default function SelectorVariante<T extends VarianteFiltrable>({
  items,
  value,
  onChange,
  ocultarBusqueda = false,
  vacio = "Sin variantes que coincidan.",
}: Props<T>) {
  const {
    busqueda,
    setBusqueda,
    coincidenciasAbiertas,
    setCoincidenciasAbiertas,
    coincidenciasProducto,
    productoSel,
    seleccionarProducto,
    limpiarFiltro,
    atributosProducto,
    filtros,
    toggleValor,
    filtradas,
  } = useFiltroAtributos(items);

  // Producto fijo (`ocultarBusqueda`): se selecciona solo si hay uno único.
  useEffect(() => {
    if (!ocultarBusqueda || productoSel) return;
    const ids = new Set(items.map((i) => i.productoId));
    if (ids.size === 1) seleccionarProducto([...ids][0]);
  }, [ocultarBusqueda, items, productoSel, seleccionarProducto]);

  // Si los filtros dejan una sola variante, se elige automáticamente.
  useEffect(() => {
    if (filtradas.length === 1 && filtradas[0].variantId !== value) {
      onChange(filtradas[0].variantId);
    }
  }, [filtradas, value, onChange]);

  const elegirProducto = (productoId: number) => {
    seleccionarProducto(productoId);
    onChange(null);
  };

  const quitarProducto = () => {
    limpiarFiltro();
    onChange(null);
  };

  if (!productoSel) {
    if (ocultarBusqueda) return <p className="muted small" style={{ margin: 0 }}>{vacio}</p>;
    return (
      <div className="buscador-wrap">
        <input
          value={busqueda}
          onChange={(e) => {
            setBusqueda(e.target.value);
            setCoincidenciasAbiertas(true);
          }}
          onFocus={() => setCoincidenciasAbiertas(true)}
          placeholder="Buscar producto…"
        />
        {coincidenciasAbiertas && coincidenciasProducto.length > 0 && (
          <ul className="buscador-lista">
            {coincidenciasProducto.map((p) => (
              <li key={p.productoId}>
                <button type="button" onClick={() => elegirProducto(p.productoId)}>
                  {p.producto} <span className="muted small">({p.variantes})</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  return (
    <div className="selector-variante">
      {!ocultarBusqueda && (
        <div className="filtro-activo" style={{ marginBottom: 10 }}>
          <strong>{productoSel.producto}</strong>
          <button type="button" className="btn ghost sm" onClick={quitarProducto} aria-label="Cambiar producto">
            ×
          </button>
        </div>
      )}

      {atributosProducto.map(({ attribute, valores }) => (
        <div key={attribute} className="filtro-attr">
          <div className="filtro-attr-nombre">{attribute}</div>
          <div className="filtro-attr-valores">
            {valores.map((valor) => (
              <button
                key={valor}
                type="button"
                className={`chip-toggle ${filtros[attribute]?.has(valor) ? "on" : ""}`}
                onClick={() => toggleValor(attribute, valor)}
              >
                {valor}
              </button>
            ))}
          </div>
        </div>
      ))}

      <div className="selector-variante-lista">
        {filtradas.length === 0 ? (
          <p className="muted small" style={{ margin: "4px 0" }}>{vacio}</p>
        ) : (
          filtradas.map((v) => {
            const activo = v.variantId === value;
            return (
              <button
                key={v.variantId}
                type="button"
                className={`selector-variante-item ${activo ? "on" : ""}`}
                onClick={() => onChange(v.variantId)}
              >
                <span className="selector-variante-nombre">
                  {v.nombre || v.sku}
                  <span className="muted small"> · {v.sku}</span>
                </span>
                {v.valoracion.length > 0 && (
                  <span className="selector-variante-atributos">
                    {v.valoracion.map((a) => (
                      <span key={a.attribute} className="attr-item">
                        <span className="attr-name">{a.attribute}</span> {a.valor}
                      </span>
                    ))}
                  </span>
                )}
                {v.stockActual !== undefined && (
                  <span className="muted small">
                    Stock: {v.stockActual} {v.uom ?? ""}
                  </span>
                )}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
