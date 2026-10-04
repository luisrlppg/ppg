"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/preferences";

const LINKS: { href: string; label: string; icon: string; match?: string[] }[] = [
  { href: "/", label: "Inicio", icon: "🏠" },
  { href: "/reportes", label: "Reportes", icon: "📋" },
  { href: "/ventas", label: "Ventas", icon: "🧾" },
  { href: "/fabricacion", label: "Fabricación", icon: "🏭" },
  { href: "/productos", label: "Productos", icon: "📦", match: ["/productos", "/catalogos"] },
  { href: "/inventario", label: "Inventario", icon: "📊" },
  { href: "/clientes", label: "Clientes", icon: "👥" },
  { href: "/monitor", label: "Monitor", icon: "🔔" },
  { href: "/backups", label: "Respaldos", icon: "💾" },
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
  const { user, loading } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    const saved = localStorage.getItem("ppg.sidebar.collapsed");
    if (saved !== null) setCollapsed(saved === "1");
  }, []);

  function toggleCollapsed() {
    setCollapsed((c) => {
      localStorage.setItem("ppg.sidebar.collapsed", c ? "0" : "1");
      return !c;
    });
  }

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
    <div className={`app-layout${collapsed ? " collapsed" : ""}`}>
      <aside className="sidebar">
        <div className="sidebar-header">
          <span className="brand">
            <span className="mark">P</span>
            <span className="brand-text">PPG</span>
          </span>
          <button
            type="button"
            className="sidebar-toggle"
            onClick={toggleCollapsed}
            aria-label={collapsed ? "Expandir menú" : "Colapsar menú"}
            title={collapsed ? "Expandir menú" : "Colapsar menú"}
          >
            {collapsed ? "»" : "«"}
          </button>
        </div>
        <nav className="sidebar-links">
          {LINKS.map((l) => {
            const active = (l.match ?? [l.href]).some((p) =>
              p === "/" ? pathname === "/" : pathname === p || pathname.startsWith(`${p}/`),
            );
            return (
              <Link key={l.href} href={l.href} className={active ? "active" : ""} title={l.label}>
                <span className="icon" aria-hidden="true">
                  {l.icon}
                </span>
                <span className="label">{l.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="sidebar-footer">
          <div className="sidebar-user">
            <span className="avatar">{iniciales(user.nombre)}</span>
            <div className="user-meta">
              <strong>{user.nombre}</strong>
              <span>{user.role}</span>
            </div>
          </div>
          <div className="sidebar-actions">
            <Link className="btn ghost sm" href="/ajustes" title="Ajustes">
              <span className="label">Ajustes</span>
            </Link>
            <button
              className="btn ghost sm"
              type="button"
              title="Salir"
              onClick={() => api("/auth/logout", { method: "POST" }).then(() => location.reload())}
            >
              <span className="label">Salir</span>
            </button>
          </div>
        </div>
      </aside>
      <div className="backdrop" onClick={toggleCollapsed} />
      <main className="content">
        <div className="content-inner">{children}</div>
      </main>
    </div>
  );
}
