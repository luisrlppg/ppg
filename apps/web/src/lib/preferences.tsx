"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { formatCantidad as formatBase, type SeparadorMiles } from "@ppg/shared";

interface Preferences {
  separadorMiles: SeparadorMiles;
  setSeparadorMiles: (s: SeparadorMiles) => Promise<void>;
  formatCantidad: (valor: number | string | null | undefined) => string;
}

const Ctx = createContext<Preferences | null>(null);

export function PreferencesProvider({
  initial,
  children,
}: {
  initial: SeparadorMiles;
  children: React.ReactNode;
}) {
  const [separadorMiles, setSep] = useState<SeparadorMiles>(initial);

  const setSeparadorMiles = useCallback(
    async (s: SeparadorMiles) => {
      const prev = separadorMiles;
      setSep(s);
      try {
        await api("/auth/preferences", {
          method: "PATCH",
          body: JSON.stringify({ separadorMiles: s }),
        });
      } catch (e) {
        setSep(prev);
        throw e;
      }
    },
    [separadorMiles],
  );

  const formatCantidad = useCallback(
    (valor: number | string | null | undefined) => formatBase(valor, separadorMiles),
    [separadorMiles],
  );

  const value = useMemo(
    () => ({ separadorMiles, setSeparadorMiles, formatCantidad }),
    [separadorMiles, setSeparadorMiles, formatCantidad],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePreferences(): Preferences {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("usePreferences debe usarse dentro de PreferencesProvider");
  return ctx;
}

export function useFormatCantidad() {
  return usePreferences().formatCantidad;
}
