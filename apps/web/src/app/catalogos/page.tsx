"use client";

import { useCallback, useEffect, useState } from "react";
import AppShell from "@/components/app-shell";
import { api } from "@/lib/api";
import type { Atributo, Categoria, Packaging } from "@/lib/types";

export default function CatalogosPage() {
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [empaques, setEmpaques] = useState<Packaging[]>([]);
  const [atributos, setAtributos] = useState<Atributo[]>([]);

  const cargar = useCallback(async () => {
    const [c, e, a] = await Promise.all([
      api<Categoria[]>("/catalogos/categorias"),
      api<Packaging[]>("/catalogos/empaques"),
      api<Atributo[]>("/catalogos/atributos"),
    ]);
    setCategorias(c);
    setEmpaques(e);
    setAtributos(a);
  }, []);

  useEffect(() => {
    cargar().catch((e) => setError(e.message));
  }, [cargar]);

  const notify = (e: Error | null, okMsg: string) => {
    if (e) {
      setError(e.message);
      setMsg("");
    } else {
      setError("");
      setMsg(okMsg);
      cargar().catch(() => undefined);
    }
  };

  // ---- Categorías ----
  const [catNombre, setCatNombre] = useState("");
  async function agregarCategoria(e: React.FormEvent) {
    e.preventDefault();
    if (!catNombre.trim()) return;
    try {
      await api("/catalogos/categorias", { method: "POST", body: JSON.stringify({ nombre: catNombre }) });
      setCatNombre("");
      notify(null, "Categoría agregada.");
    } catch (err) {
      notify(err as Error, "");
    }
  }

  // ---- Empaques ----
  const [empNombre, setEmpNombre] = useState("");
  async function agregarEmpaque(e: React.FormEvent) {
    e.preventDefault();
    if (!empNombre.trim()) return;
    try {
      await api("/catalogos/empaques", { method: "POST", body: JSON.stringify({ nombre: empNombre }) });
      setEmpNombre("");
      notify(null, "Empaque agregado.");
    } catch (err) {
      notify(err as Error, "");
    }
  }

  // ---- Atributos ----
  const [attrNombre, setAttrNombre] = useState("");
  const [valorNuevo, setValorNuevo] = useState<Record<number, string>>({});
  async function agregarAtributo(e: React.FormEvent) {
    e.preventDefault();
    if (!attrNombre.trim()) return;
    try {
      await api("/catalogos/atributos", { method: "POST", body: JSON.stringify({ nombre: attrNombre }) });
      setAttrNombre("");
      notify(null, "Atributo agregado.");
    } catch (err) {
      notify(err as Error, "");
    }
  }
  async function agregarValor(a: Atributo) {
    const valor = valorNuevo[a.id];
    if (!valor?.trim()) return;
    try {
      await api(`/catalogos/atributos/${a.id}/valores`, { method: "POST", body: JSON.stringify({ valor }) });
      setValorNuevo({ ...valorNuevo, [a.id]: "" });
      notify(null, `Valor agregado a "${a.nombre}".`);
    } catch (err) {
      notify(err as Error, "");
    }
  }

  return (
    <AppShell>
      <h2>Catálogos</h2>
      {error && <div className="error">{error}</div>}
      {msg && <div className="msg-ok">{msg}</div>}

      <div className="grid-2">
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Categorías</h3>
          <form className="inline-form" onSubmit={agregarCategoria}>
            <input value={catNombre} onChange={(e) => setCatNombre(e.target.value)} placeholder="Nueva categoría…" />
            <button className="btn primary" style={{ flex: 0 }}>
              Agregar
            </button>
          </form>
          <ul className="step-list" style={{ fontSize: "0.95rem" }}>
            {categorias.map((c) => (
              <li key={c.id} style={{ padding: "10px 12px" }}>
                {c.nombre} <span className="badge normal">{c.productos} productos</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0 }}>Empaques</h3>
          <form className="inline-form" onSubmit={agregarEmpaque}>
            <input value={empNombre} onChange={(e) => setEmpNombre(e.target.value)} placeholder="Nuevo empaque…" />
            <button className="btn primary" style={{ flex: 0 }}>
              Agregar
            </button>
          </form>
          <ul className="step-list" style={{ fontSize: "0.95rem" }}>
            {empaques.map((p) => (
              <li key={p.id} style={{ padding: "10px 12px" }}>
                {p.nombre}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Atributos (ejes de combos)</h3>
        <form className="inline-form" onSubmit={agregarAtributo}>
          <input value={attrNombre} onChange={(e) => setAttrNombre(e.target.value)} placeholder="Nuevo atributo…" />
          <button className="btn primary" style={{ flex: 0 }}>
            Agregar
          </button>
        </form>
        <div className="spacer" />
        {atributos.map((a) => (
          <div key={a.id} className="card" style={{ padding: 16, margin: "8px 0" }}>
            <h4 style={{ margin: "0 0 8px" }}>{a.nombre}</h4>
            <div>
              {a.valores.map((v) => (
                <span className="kbd-chip" key={v.id} style={{ margin: "0 6px 6px 0" }}>
                  {v.valor}
                </span>
              ))}
              {a.valores.length === 0 && <span className="muted small">Sin valores todavía.</span>}
            </div>
            <div className="inline-form" style={{ marginTop: 8 }}>
              <input value={valorNuevo[a.id] ?? ""} onChange={(e) => setValorNuevo({ ...valorNuevo, [a.id]: e.target.value })} placeholder="Nuevo valor…" />
              <button className="btn ghost" style={{ flex: 0 }} onClick={() => agregarValor(a)}>
                Agregar valor
              </button>
            </div>
          </div>
        ))}
      </div>
    </AppShell>
  );
}