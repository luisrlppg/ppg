"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { api } from "@/lib/api";
import type { PublicUser } from "@ppg/shared";

const LINKS = [
  { href: "/", label: "Inicio" },
  { href: "/productos", label: "Productos" },
  { href: "/inventario", label: "Inventario" },
  { href: "/monitor", label: "Monitor" },
  { href: "/catalogos", label: "Catálogos" },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [loading, setLoading] = useState(true);
  const pathname = usePathname();

  useEffect(() => {
    (async () => {
      try {
        const data = await api<{ user: PublicUser }>("/auth/me");
        setUser(data.user);
      } catch {
        setUser(null);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <main className="screen card center-card">
        <p className="muted">Cargando…</p>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="screen card center-card">
        <h1>PPG</h1>
        <p className="muted">Inicia sesión para continuar.</p>
        <Link className="btn primary block" href="/login" style={{ marginTop: 16 }}>
          Iniciar sesión
        </Link>
      </main>
    );
  }

  return (
    <>
      <header className="nav">
        <div className="row" style={{ gap: 0, justifyContent: "flex-start" }}>
          <span className="brand">PPG</span>
          <nav className="nav-links">
            {LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={pathname === l.href || (l.href !== "/" && pathname.startsWith(l.href)) ? "active" : ""}
              >
                {l.label}
              </Link>
            ))}
          </nav>
        </div>
        <span className="user">
          <span>
            {user.nombre} · {user.role}
          </span>
          <button
            className="btn ghost"
            style={{ color: "#fff", borderColor: "#fff" }}
            type="button"
            onClick={() => api("/auth/logout", { method: "POST" }).then(() => location.reload())}
          >
            Salir
          </button>
        </span>
      </header>
      <main className="screen">{children}</main>
    </>
  );
}