"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import {
  HOME_BY_ROLE,
  type MeResponse,
  type PublicUser,
} from "@ppg/shared";

export default function Home() {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const data = await api<MeResponse>("/auth/me");
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
        <p className="muted">Inicia sesión para comenzar.</p>
        <Link className="btn primary block" href="/login" style={{ marginTop: 16 }}>
          Iniciar sesión
        </Link>
      </main>
    );
  }

  return (
    <>
      <header className="nav">
        <span className="brand">PPG</span>
        <span className="user">
          <span>Hola, {user.nombre}</span>
          <button className="btn ghost" type="button" onClick={() => api("/auth/logout", { method: "POST" }).then(() => location.reload())}>
            Salir
          </button>
        </span>
      </header>
      <main className="screen">
        <h2>{HOME_BY_ROLE[user.role]}</h2>
        <p className="muted">
          Tu rol es <strong>{user.role}</strong>. Aquí verás tus tareas de hoy.
        </p>
        <ul className="step-list">
          <li>Esta es la base (E0): usuarios, roles y sesión.</li>
          <li>En E1 llegará el inventario completo.</li>
        </ul>
      </main>
    </>
  );
}