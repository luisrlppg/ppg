"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { api } from "@/lib/api";
import { POR_UBICAR_EVENT } from "@/lib/por-ubicar";
import { useAuth } from "@/lib/preferences";
import type { PorUbicarCount } from "@/lib/types";

interface NavItem {
  href: string;
  label: string;
  icon: string;
  match?: string[];
  roles?: string[];
}

interface NavSection {
  id: string;
  label: string;
  roles?: string[];
  items: NavItem[];
}

const LINKS: NavItem[] = [
  { href: "/", label: "Inicio", icon: "🏠" },
  { href: "/reportes", label: "Reportes", icon: "📋" },
  { href: "/ventas", label: "Ventas", icon: "🧾" },
  { href: "/fabricacion", label: "Fabricación", icon: "🏭" },
  { href: "/bandeja", label: "Bandeja", icon: "📍" },
  { href: "/productos", label: "Productos", icon: "📦", match: ["/productos", "/catalogos"] },
  { href: "/inventario", label: "Inventario", icon: "📊" },
  { href: "/inventario-historico", label: "Alm. histórico", icon: "🗃️" },
  { href: "/clientes", label: "Clientes", icon: "👥" },
];

const SECTIONS: NavSection[] = [
  {
    id: "admin",
    label: "Administración",
    roles: ["admin"],
    items: [
      { href: "/usuarios", label: "Usuarios", icon: "👤", roles: ["admin"] },
      { href: "/costos", label: "Costos", icon: "💰", roles: ["admin"] },
    ],
  },
  {
    id: "ajustes",
    label: "Ajustes",
    items: [
      { href: "/ajustes", label: "Ajustes", icon: "⚙️" },
      { href: "/backups", label: "Respaldos", icon: "💾", roles: ["admin"] },
    ],
  },
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

function esActivo(href: string, match: string[] | undefined, pathname: string): boolean {
  return (match ?? [href]).some((p) =>
    p === "/" ? pathname === "/" : pathname === p || pathname.startsWith(`${p}/`),
  );
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [seccionesAbiertas, setSeccionesAbiertas] = useState<Record<string, boolean>>({});
  const [porUbicar, setPorUbicar] = useState(0);
  const pathname = usePathname();

  const cargarPorUbicar = useCallback(async () => {
    try {
      const { total } = await api<PorUbicarCount>("/reportes/por-ubicar");
      setPorUbicar(total);
    } catch {
      /* sin sesión o error: se ignora */
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    cargarPorUbicar();
    const t = setInterval(cargarPorUbicar, 30000);
    window.addEventListener(POR_UBICAR_EVENT, cargarPorUbicar);
    return () => {
      clearInterval(t);
      window.removeEventListener(POR_UBICAR_EVENT, cargarPorUbicar);
    };
  }, [user, cargarPorUbicar]);

  useEffect(() => {
    if (user) cargarPorUbicar();
  }, [pathname, user, cargarPorUbicar]);

  useEffect(() => {
    const saved = localStorage.getItem("ppg.sidebar.collapsed");
    if (saved !== null) setCollapsed(saved === "1");

    const abiertas: Record<string, boolean> = {};
    for (const s of SECTIONS) {
      const v = localStorage.getItem(`ppg.sidebar.section.${s.id}`);
      abiertas[s.id] = v === null ? true : v === "1";
    }
    setSeccionesAbiertas(abiertas);
  }, []);

  useEffect(() => {
    const activa = SECTIONS.find((s) =>
      s.items.some((it) => esActivo(it.href, it.match, pathname)),
    );
    if (activa) {
      setSeccionesAbiertas((prev) => (prev[activa.id] ? prev : { ...prev, [activa.id]: true }));
    }
  }, [pathname]);

  function toggleCollapsed() {
    setCollapsed((c) => {
      localStorage.setItem("ppg.sidebar.collapsed", c ? "0" : "1");
      return !c;
    });
  }

  function toggleSeccion(id: string) {
    setSeccionesAbiertas((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      localStorage.setItem(`ppg.sidebar.section.${id}`, next[id] ? "1" : "0");
      return next;
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
        <h1>PLASA</h1>
        <p className="muted">Inicia sesión para continuar.</p>
        <Link className="btn primary block" href="/login" style={{ marginTop: 16 }}>
          Iniciar sesión
        </Link>
      </main>
    );
  }

  const visible = (roles: string[] | undefined) => !roles || roles.includes(user.role);

  function renderLink(item: NavItem) {
    const active = esActivo(item.href, item.match, pathname);
    const badge = item.href === "/bandeja" ? porUbicar : 0;
    return (
      <Link key={item.href} href={item.href} className={active ? "active" : ""} title={item.label}>
        <span className="icon" aria-hidden="true">
          {item.icon}
        </span>
        <span className="label">{item.label}</span>
        {badge > 0 && <span className="nav-count" aria-label={`${badge} pendientes de ubicar`}>{badge > 99 ? "99+" : badge}</span>}
      </Link>
    );
  }

  return (
    <div className={`app-layout${collapsed ? " collapsed" : ""}`}>
      <aside className="sidebar">
        <div className="sidebar-header">
          <span className="brand">
            <span className="brand-text">PLASA</span>
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
          {LINKS.filter((l) => visible(l.roles)).map(renderLink)}
          {SECTIONS.filter((s) => visible(s.roles)).map((section) => {
            const abierta = collapsed || (seccionesAbiertas[section.id] ?? true);
            return (
              <div key={section.id} className="sidebar-section">
                <button
                  type="button"
                  className="sidebar-section-header"
                  onClick={() => toggleSeccion(section.id)}
                  aria-expanded={seccionesAbiertas[section.id] ?? true}
                >
                  <span className="section-label">{section.label}</span>
                  <span className="chevron" aria-hidden="true">
                    {abierta ? "▾" : "▸"}
                  </span>
                </button>
                {abierta && (
                  <div className="sidebar-section-items">
                    {section.items.filter((it) => visible(it.roles)).map(renderLink)}
                  </div>
                )}
              </div>
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
