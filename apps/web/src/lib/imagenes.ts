"use client";

import { useEffect, useState } from "react";

export async function imagenADataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { mode: "cors" });
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result));
      fr.onerror = () => reject(fr.error);
      fr.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export function useImagenesLineas(
  lineas: { id: number; imagen: string | null }[],
): Record<number, string> {
  const [imagenes, setImagenes] = useState<Record<number, string>>({});
  const clave = lineas.map((l) => `${l.id}:${l.imagen ?? ""}`).join("|");

  useEffect(() => {
    let activo = true;
    async function cargar() {
      const entradas = await Promise.all(
        lineas.map(async (l) => {
          if (!l.imagen) return [l.id, null] as const;
          return [l.id, await imagenADataUrl(l.imagen)] as const;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave]);

  return imagenes;
}

export function useImagenEstatica(src: string | null): string | null {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let activo = true;
    if (!src) {
      setDataUrl(null);
      return;
    }
    void imagenADataUrl(src).then((d) => {
      if (activo) setDataUrl(d);
    });
    return () => {
      activo = false;
    };
  }, [src]);

  return dataUrl;
}
