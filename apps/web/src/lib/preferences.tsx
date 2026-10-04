"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { formatCantidad as formatBase, type PublicUser, type SeparadorMiles } from "@ppg/shared";

interface Preferences {
  separadorMiles: SeparadorMiles;
  setSeparadorMiles: (s: SeparadorMiles) => Promise<void>;
  formatCantidad: (valor: number | string | null | undefined) => string;
}

interface Auth {
  user: PublicUser | null;
  loading: boolean;
  refresh: () => Promise<void>;
}

const PreferencesCtx = createContext<Preferences | null>(null);
const AuthCtx = createContext<Auth | null>(null);

export function PreferencesProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [separadorMiles, setSep] = useState<SeparadorMiles>("coma");

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<{ user: PublicUser }>("/auth/me");
      setUser(data.user);
      setSep(data.user.separadorMiles);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

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

  const prefs = useMemo(
    () => ({ separadorMiles, setSeparadorMiles, formatCantidad }),
    [separadorMiles, setSeparadorMiles, formatCantidad],
  );

  const auth = useMemo(() => ({ user, loading, refresh }), [user, loading, refresh]);

  return (
    <AuthCtx.Provider value={auth}>
      <PreferencesCtx.Provider value={prefs}>{children}</PreferencesCtx.Provider>
    </AuthCtx.Provider>
  );
}

export function usePreferences(): Preferences {
  const ctx = useContext(PreferencesCtx);
  if (!ctx) throw new Error("usePreferences debe usarse dentro de PreferencesProvider");
  return ctx;
}

export function useFormatCantidad() {
  return usePreferences().formatCantidad;
}

export function useAuth(): Auth {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth debe usarse dentro de PreferencesProvider");
  return ctx;
}
