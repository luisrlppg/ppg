"use client";

import Link from "next/link";
import AppShell from "@/components/app-shell";
import { HOME_BY_ROLE } from "@ppg/shared";

const MODULES = [
  { href: "/productos", title: "Productos y variantes", desc: "Catálogo, grid de combos, precios y listas de materiales (BOM)." },
  { href: "/inventario", title: "Inventario", desc: "Existencia por ubicación, ajustes, transferencias y registro de ensambles." },
  { href: "/monitor", title: "Monitor de stock", desc: "Bajo stock, alertas por Telegram / WhatsApp / email y eventos." },
  { href: "/catalogos", title: "Catálogos", desc: "Categorías, empaques y atributos (ejes de los combos)." },
];

export default function Home() {
  return (
    <AppShell>
      <h2>Inicio</h2>
      <p className="muted">
        Tu área: <strong>{HOME_BY_ROLE["admin"]}</strong> (adaptable por rol en E2+).
      </p>
      <div className="grid-2">
        {MODULES.map((m) => (
          <Link key={m.href} href={m.href} style={{ textDecoration: "none", color: "inherit" }}>
            <div className="card" style={{ height: "100%" }}>
              <h3 style={{ marginTop: 0 }}>{m.title}</h3>
              <p className="muted">{m.desc}</p>
            </div>
          </Link>
        ))}
      </div>
    </AppShell>
  );
}