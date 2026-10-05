"use client";

import Modal from "@/components/ui/modal";
import type { FiltroAtributos } from "@/lib/filtro-atributos";

/**
 * Buscador de producto con chip de filtro activo. Va dentro de la `StickyBar`.
 * El estado vive en `useFiltroAtributos`; este componente sólo lo pinta.
 */
export default function BuscadorAtributos({ filtro }: { filtro: FiltroAtributos }) {
  const {
    busqueda,
    setBusqueda,
    coincidenciasAbiertas,
    setCoincidenciasAbiertas,
    coincidenciasProducto,
    productoSel,
    seleccionarProducto,
    limpiarFiltro,
    nFiltrosActivos,
    setShowFiltros,
  } = filtro;

  if (productoSel) {
    return (
      <span className="filtro-activo">
        <strong>{productoSel.producto}</strong>
        {nFiltrosActivos > 0 && <span className="muted"> · {nFiltrosActivos} filtro(s)</span>}
        <button type="button" className="btn ghost sm" onClick={() => setShowFiltros(true)}>
          Atributos
        </button>
        <button type="button" className="btn ghost sm" onClick={limpiarFiltro} aria-label="Quitar filtro">
          ×
        </button>
      </span>
    );
  }

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
        style={{ maxWidth: 300 }}
      />
      {coincidenciasAbiertas && coincidenciasProducto.length > 0 && (
        <ul className="buscador-lista">
          {coincidenciasProducto.map((p) => (
            <li key={p.productoId}>
              <button type="button" onClick={() => seleccionarProducto(p.productoId)}>
                {p.producto} <span className="muted small">({p.variantes})</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Modal de chips por atributo del producto seleccionado. */
export function FiltroAtributosModal({ filtro }: { filtro: FiltroAtributos }) {
  const { showFiltros, setShowFiltros, productoSel, atributosProducto, filtros, toggleValor, nFiltrosActivos, setFiltros } =
    filtro;
  if (!showFiltros || !productoSel) return null;
  return (
    <Modal title={`Filtrar: ${productoSel.producto}`} onClose={() => setShowFiltros(false)} size="lg">
      {atributosProducto.length === 0 ? (
        <p className="muted small">Este producto no tiene atributos definidos.</p>
      ) : (
        <>
          <p className="muted small" style={{ marginTop: 0 }}>
            Selecciona los valores. Dentro de un atributo es “alguno de”; entre atributos se combinan (Y). La tabla de
            atrás ya está filtrada.
          </p>
          {atributosProducto.map(({ attribute, valores }) => (
            <div key={attribute} className="filtro-attr">
              <div className="filtro-attr-nombre">{attribute}</div>
              <div className="filtro-attr-valores">
                {valores.map((valor) => {
                  const activo = filtros[attribute]?.has(valor) ?? false;
                  return (
                    <button
                      key={valor}
                      type="button"
                      className={`chip-toggle ${activo ? "on" : ""}`}
                      onClick={() => toggleValor(attribute, valor)}
                    >
                      {valor}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </>
      )}
      <div className="row" style={{ marginTop: 12, justifyContent: "flex-end" }}>
        <button type="button" className="btn ghost" onClick={() => setFiltros({})} disabled={nFiltrosActivos === 0}>
          Limpiar filtros
        </button>
        <button type="button" className="btn primary" onClick={() => setShowFiltros(false)}>
          Cerrar
        </button>
      </div>
    </Modal>
  );
}
