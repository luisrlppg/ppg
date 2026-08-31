"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { api } from "@/lib/api";
import type { PublicUser } from "@ppg/shared";

const LINKS = [
  { href: "/", label: "Inicio" },
  { href: "/reportes", label: "Reportes" },
  { href: "/ventas", label: "Ventas" },
  { href: "/fabricacion", label: "Fabricación" },
  { href: "/productos", label: "Productos" },
  { href: "/inventario", label: "Inventario" },
  { href: "/clientes", label: "Clientes" },
  { href: "/monitor", label: "Monitor" },
];

function iniciales(nombre: string): string {
  return nombre
    .split(" ")
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

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
        <div className="nav-left">
          <span className="brand">
            <span className="mark">P</span>PPG
          </span>
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
        <div className="user-chip">
          <div className="user-meta">
            <strong>{user.nombre}</strong>
            <span>{user.role}</span>
          </div>
          <span className="avatar">{iniciales(user.nombre)}</span>
          <button
            className="btn ghost sm"
            type="button"
            onClick={() => api("/auth/logout", { method: "POST" }).then(() => location.reload())}
          >
            Salir
          </button>
        </div>
      </header>
      <main className="screen">{children}</main>
    </>
  );
}