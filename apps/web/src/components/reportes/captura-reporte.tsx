"use client";

import { forwardRef, useImperativeHandle, useState, type FormEvent } from "react";
import { api } from "@/lib/api";
import type { CepillosNylonGrid, EnsartadoData, ReporteDetalle } from "@/lib/types";
import PasoSetup from "./captura/paso-setup";
import PasoCepillos from "./captura/paso-cepillos";
import PasoEnsartado from "./captura/paso-ensartado";
import PasoInformativas from "./captura/paso-informativas";
import {
  HORAS_TURNO,
  hoy,
  turnoPorHora,
  type EnsartadoForm,
  type Fase,
  type InformativaForm,
  type LineaExtra,
  type LineaForm,
  type SeccionInformativa,
  type TurnoCaptura,
} from "./captura/comun";

interface PayloadLinea {
  variantId?: number;
  productoTexto?: string;
  seccion: string;
  tipo: string;
  ok: number;
}

export interface CapturaReporteHandle {
  editar: (id: number) => void;
}

interface Props {
  setError: (m: string) => void;
  setMsg: (m: string) => void;
  onGuardado: () => void;
}

const CapturaReporte = forwardRef<CapturaReporteHandle, Props>(function CapturaReporte(
  { setError, setMsg, onGuardado },
  ref,
) {
  const [fase, setFase] = useState<Fase>("setup");
  const [turno, setTurno] = useState<TurnoCaptura>(turnoPorHora);
  const [fecha, setFecha] = useState(hoy);
  const [personas, setPersonas] = useState("1");
  const [lines, setLines] = useState<LineaForm[]>([]);
  const [guardando, setGuardando] = useState(false);
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [extras, setExtras] = useState<LineaExtra[]>([]);
  const [ensartadoLines, setEnsartadoLines] = useState<EnsartadoForm[]>([]);
  const [informativas, setInformativas] = useState<InformativaForm[]>([]);

  function limpiarForm() {
    setFase("setup");
    setLines([]);
    setPersonas("1");
    setFecha(hoy());
    setEnsartadoLines([]);
    setInformativas([]);
    setExtras([]);
    setEditandoId(null);
  }

  function construirLineas(): PayloadLinea[] {
    const consumo = new Map<number, number>();
    for (const l of ensartadoLines) {
      consumo.set(l.mangoVariantId, (consumo.get(l.mangoVariantId) ?? 0) + Number(l.cantidad));
    }
    return [
      ...lines.map((l) => ({ variantId: l.variantId, seccion: l.seccion, tipo: l.tipo, ok: Number(l.cantidad) })),
      ...ensartadoLines.map((l) => ({ variantId: l.pincelVariantId, seccion: "ensartado" as const, tipo: "final" as const, ok: Number(l.cantidad) })),
      ...[...consumo].map(([variantId, ok]) => ({ variantId, seccion: "ensartado" as const, tipo: "consumo" as const, ok })),
      ...informativas.map((i) => ({ productoTexto: i.producto, seccion: i.seccion, tipo: "informativo" as const, ok: Number(i.cantidad) })),
      ...extras,
    ];
  }

  function comenzar() {
    if (!(Number(personas) >= 1)) {
      setError("Indica al menos 1 persona.");
      return;
    }
    setError("");
    setMsg("");
    setFase("captura");
  }

  async function guardar(e: FormEvent) {
    e.preventDefault();
    const nuevas = construirLineas();
    if (nuevas.length === 0) {
      setError("Agrega al menos un cepillo, pincel o sección.");
      return;
    }
    const dto = {
      turno,
      fecha,
      personas: Number(personas) || 1,
      horasTrabajadas: HORAS_TURNO[turno],
      lines: nuevas,
    };
    setGuardando(true);
    setError("");
    setMsg("");
    try {
      if (editandoId !== null) {
        await api(`/reportes/${editandoId}`, { method: "PATCH", body: JSON.stringify(dto) });
        setMsg("Reporte actualizado.");
      } else {
        await api("/reportes", { method: "POST", body: JSON.stringify(dto) });
        setMsg("Reporte guardado; queda pendiente de ubicar en la Bandeja.");
      }
      limpiarForm();
      onGuardado();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setGuardando(false);
    }
  }

  async function editar(id: number) {
    setError("");
    setMsg("");
    try {
      const [g, ens, rep] = await Promise.all([
        api<CepillosNylonGrid>("/reportes/cepillos-nylon"),
        api<EnsartadoData>("/reportes/ensartado"),
        api<ReporteDetalle>(`/reportes/${id}`),
      ]);

      const sIdx = g.ejes.findIndex((e) => /forma/i.test(e.nombre));
      const cIdx = g.ejes.findIndex((e) => /color/i.test(e.nombre));

      const nuevasLineas: LineaForm[] = [];
      const nuevosPinceles: EnsartadoForm[] = [];
      const nuevasInfos: InformativaForm[] = [];
      const nuevosExtras: LineaExtra[] = [];

      for (const l of rep.lines) {
        if (l.tipo === "informativo") {
          nuevasInfos.push({
            key: `${l.seccion}-${l.id}`,
            seccion: (l.seccion as SeccionInformativa),
            producto: l.productoTexto ?? l.nombre ?? "",
            cantidad: String(l.ok),
          });
          continue;
        }
        if (l.seccion === "ensartado" && l.tipo === "consumo") continue;
        if (l.tipo === "final" && /^maquina/.test(l.seccion) && l.variantId != null) {
          const ex = g.existentes.find((v) => v.varianteId === l.variantId);
          if (ex) {
            const fId = ex.valueIds[sIdx];
            const coId = ex.valueIds[cIdx];
            nuevasLineas.push({
              key: `${l.variantId}-${l.seccion}-${l.id}`,
              variantId: l.variantId,
              sku: ex.sku,
              nombre: ex.nombre,
              producto: g.nombre,
              uom: "pieza",
              seccion: l.seccion,
              tipo: "final",
              cantidad: String(l.ok),
              forma: g.ejes[sIdx]?.valores.find((v) => v.id === fId)?.valor ?? "—",
              color: g.ejes[cIdx]?.valores.find((v) => v.id === coId)?.valor ?? "—",
            });
            continue;
          }
        }
        if (l.tipo === "final" && l.seccion === "ensartado" && l.variantId != null) {
          const combo = ens.combinaciones.find((c) => c.pincelVariantId === l.variantId);
          if (combo) {
            const mango = ens.mangos.find((m) => m.variantId === combo.mangoVariantId);
            nuevosPinceles.push({
              key: `${l.variantId}-${l.id}`,
              pincelVariantId: l.variantId,
              pincelSku: l.sku ?? "",
              pincelNombre: l.nombre ?? "",
              mangoVariantId: combo.mangoVariantId,
              mango: mango?.etiqueta ?? "",
              colorId: combo.colorId,
              color: ens.colores.find((c) => c.id === combo.colorId)?.valor ?? "—",
              cantidad: String(l.ok),
            });
            continue;
          }
        }
        nuevosExtras.push({
          variantId: l.variantId ?? undefined,
          productoTexto: l.productoTexto ?? undefined,
          seccion: l.seccion,
          tipo: l.tipo,
          ok: l.ok,
        });
      }

      setLines(nuevasLineas);
      setEnsartadoLines(nuevosPinceles);
      setInformativas(nuevasInfos);
      setExtras(nuevosExtras);
      setTurno(rep.turno === "nocturno" ? "matutino" : (rep.turno as TurnoCaptura));
      setFecha(rep.fecha.slice(0, 10));
      setPersonas(String(rep.personas));
      setEditandoId(id);
      setFase(nuevasLineas.length > 0 || nuevosPinceles.length > 0 ? "captura" : "informativas");
      setMsg(`Editando ${rep.numero}. Al finalizar se reemplaza el contenido.`);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  useImperativeHandle(ref, () => ({ editar }));

  if (fase === "setup") {
    return (
      <PasoSetup
        turno={turno}
        setTurno={setTurno}
        fecha={fecha}
        setFecha={setFecha}
        personas={personas}
        setPersonas={setPersonas}
        editandoId={editandoId}
        onComenzar={comenzar}
        onDescartar={limpiarForm}
      />
    );
  }

  if (fase === "captura") {
    return (
      <PasoCepillos
        lines={lines}
        setLines={setLines}
        turno={turno}
        fecha={fecha}
        personas={personas}
        onContinuar={() => setFase("ensartado")}
        onReiniciar={limpiarForm}
        setError={setError}
        setMsg={setMsg}
      />
    );
  }

  if (fase === "ensartado") {
    return (
      <PasoEnsartado
        ensartadoLines={ensartadoLines}
        setEnsartadoLines={setEnsartadoLines}
        turno={turno}
        fecha={fecha}
        personas={personas}
        onContinuar={() => setFase("informativas")}
        onAtras={() => setFase("captura")}
        setError={setError}
        setMsg={setMsg}
      />
    );
  }

  return (
    <PasoInformativas
      informativas={informativas}
      setInformativas={setInformativas}
      turno={turno}
      fecha={fecha}
      personas={personas}
      guardando={guardando}
      editandoId={editandoId}
      onSubmit={guardar}
      onAtras={() => setFase("ensartado")}
      onReiniciar={limpiarForm}
      setError={setError}
      setMsg={setMsg}
    />
  );
});

export default CapturaReporte;
