"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getPasosCached, getPasosConSeleccion } from "./pasos-cache";
import {
  buildPaneles,
  esPanelResuelto,
  limpiarSeleccionesInvalidas,
  resolver,
  seleccionActual,
  seleccionAntesDe,
  seleccionResaltadaDe,
} from "./pasos-wizard";
import type { Passo, PassoOption, ResolucionVariante } from "./types";

/**
 * Estado y transiciones del wizard de configuración (tienda + modal de ventas).
 *
 * Reglas:
 * - Seleccionar una opción NO recarga la lista (se puede cambiar libremente).
 * - "Siguiente" toma la opción resaltada si no hubo clic y aplica la cascada:
 *   el siguiente panel se pide con la selección de los pasos ANTERIORES, para que
 *   muestre todas sus opciones.
 * - "Atrás" reofrece todas las opciones del panel anterior y conserva la elección
 *   previa de ese panel; limpia en silencio los pasos posteriores inválidos.
 */
export function usePasosWizard(productId: number) {
  const [passos, setPassos] = useState<Passo[]>([]);
  const [panelActual, setPanelActual] = useState(0);
  const [selIdx, setSelIdx] = useState<Record<number, number | undefined>>({});
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancel = false;
    setCargando(true);
    getPasosCached(productId)
      .then((ps) => { if (!cancel) setPassos(ps); })
      .catch((e) => { if (!cancel) setError((e as Error).message); })
      .finally(() => { if (!cancel) setCargando(false); });
    return () => { cancel = true; };
  }, [productId]);

  const paneles = useMemo(() => buildPaneles(passos), [passos]);
  const esRevision = panelActual >= paneles.length;
  const panel = paneles[panelActual];

  const seleccionarOpcion = useCallback((pasoIdx: number, opt: PassoOption) => {
    setSelIdx((prev) => ({ ...prev, [pasoIdx]: opt.valueId }));
  }, []);

  const avanzar = useCallback(async () => {
    const actual = paneles[panelActual];
    if (!actual) return;
    // Acepta la opción resaltada de los pasos del panel sin clic.
    const conSugeridas = seleccionResaltadaDe(passos, selIdx, actual);
    const primerIdxSiguiente = paneles[panelActual + 1]?.pasos[0];
    let nuevos = passos;
    if (primerIdxSiguiente !== undefined) {
      const sel = seleccionAntesDe(passos, conSugeridas, primerIdxSiguiente);
      try { nuevos = await getPasosConSeleccion(productId, sel); } catch { nuevos = passos; }
    }
    setPassos(nuevos);
    setSelIdx(limpiarSeleccionesInvalidas(nuevos, conSugeridas, (primerIdxSiguiente ?? passos.length)).next);
    setPanelActual(panelActual + 1);
  }, [paneles, panelActual, passos, selIdx, productId]);

  const retroceder = useCallback(async () => {
    if (panelActual === 0) return;
    const objetivo = panelActual - 1;
    const panelObjetivo = paneles[objetivo];
    const primerIdxObjetivo = panelObjetivo.pasos[0];
    const sel = seleccionAntesDe(passos, selIdx, primerIdxObjetivo);
    let nuevos = passos;
    // Recarga siempre (incluso con selección vacía) para recuperar todas las opciones del panel.
    try { nuevos = await getPasosConSeleccion(productId, sel); } catch { nuevos = passos; }
    setPassos(nuevos);
    // Conserva la elección del panel objetivo; limpia en silencio los posteriores inválidos.
    setSelIdx(limpiarSeleccionesInvalidas(nuevos, selIdx, primerIdxObjetivo + panelObjetivo.pasos.length).next);
    setPanelActual(objetivo);
  }, [paneles, panelActual, passos, selIdx, productId]);

  const panelResuelto = useCallback((p: { pasos: number[] }) => esPanelResuelto(p, selIdx), [selIdx]);

  const resolverSeleccion = useCallback(
    (crear: boolean): Promise<ResolucionVariante> => resolver(productId, passos, selIdx, crear),
    [productId, passos, selIdx],
  );

  return {
    passos,
    paneles,
    panel,
    panelActual,
    esRevision,
    selIdx,
    cargando,
    error,
    seleccionarOpcion,
    avanzar,
    retroceder,
    panelResuelto,
    resolverSeleccion,
    seleccionActual: () => seleccionActual(passos, selIdx),
  };
}
