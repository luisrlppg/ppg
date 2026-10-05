"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import AppShell from "@/components/app-shell";
import PageHeader from "@/components/ui/page-header";
import ConfirmDialog from "@/components/ui/confirm-dialog";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/preferences";
import type { BackupFile } from "@/lib/types";

function humano(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export default function BackupsPage() {
  const { user } = useAuth();
  const [archivos, setArchivos] = useState<BackupFile[]>([]);
  const [nombre, setNombre] = useState("");
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [cargando, setCargando] = useState(false);
  const [aRestaurar, setARestaurar] = useState<BackupFile | null>(null);
  const [aBorrar, setABorrar] = useState<BackupFile | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const cargar = useCallback(async () => {
    const data = await api<BackupFile[]>("/backups");
    setArchivos(data);
  }, []);

  useEffect(() => {
    cargar().catch((e) => setError((e as Error).message));
  }, [cargar]);

  async function crear() {
    setCargando(true);
    setError("");
    setMsg("");
    try {
      const b = await api<BackupFile>("/backups", {
        method: "POST",
        body: JSON.stringify({ nombre: nombre.trim() || undefined }),
      });
      setNombre("");
      await cargar();
      setMsg(`Punto de retorno creado: ${b.nombre}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCargando(false);
    }
  }

  async function restaurar() {
    if (!aRestaurar) return;
    setCargando(true);
    setError("");
    setMsg("");
    try {
      await api(`/backups/${encodeURIComponent(aRestaurar.nombre)}/restaurar`, { method: "POST" });
      setMsg(`Base de datos restaurada desde ${aRestaurar.nombre}. Migraciones aplicadas.`);
      setARestaurar(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCargando(false);
    }
  }

  async function borrar() {
    if (!aBorrar) return;
    setCargando(true);
    setError("");
    setMsg("");
    try {
      await api(`/backups/${encodeURIComponent(aBorrar.nombre)}`, { method: "DELETE" });
      await cargar();
      setMsg(`Respaldo eliminado: ${aBorrar.nombre}`);
      setABorrar(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCargando(false);
    }
  }

  async function subir(file: File) {
    setCargando(true);
    setError("");
    setMsg("");
    try {
      const form = new FormData();
      form.append("archivo", file);
      const res = await fetch("/api/backups/subir", { method: "POST", credentials: "include", body: form });
      if (!res.ok) {
        let m = `Error ${res.status}`;
        try {
          const body = await res.json();
          m = Array.isArray(body?.message) ? body.message.join(", ") : body?.message || m;
        } catch {
          // sin cuerpo JSON
        }
        throw new Error(m);
      }
      const b = (await res.json()) as BackupFile;
      await cargar();
      setMsg(`Respaldo subido: ${b.nombre}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCargando(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  if (user && user.role !== "admin") {
    return (
      <AppShell>
        <div className="card empty">No tienes permiso para ver esta sección.</div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <PageHeader
        title="Respaldos de la base de datos"
        subtitle="Crea puntos de retorno antes de pruebas que puedan escribir datos no reales y restaura cuando quieras volver al estado exacto. Restaurar sobrescribe TODOS los datos actuales."
      />
      {error && <div className="error">{error}</div>}
      {msg && <div className="msg-ok">{msg}</div>}

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Nuevo punto de retorno</h3>
        <p className="small muted">
          Se guarda comprimido con <code>pg_dump -Fc</code> en <code>docs/backups/</code>. El nombre es opcional
          (ej. <em>pre-prueba-ventas</em>).
        </p>
        <div className="row" style={{ alignItems: "center", flexWrap: "wrap" }}>
          <input
            className="input"
            placeholder="nombre (opcional)"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            style={{ maxWidth: 280 }}
          />
          <button className="btn primary" disabled={cargando} onClick={crear}>
            Crear respaldo
          </button>
          <span className="spacer" />
          <input
            ref={fileInput}
            type="file"
            accept=".dump,.sql"
            style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) subir(f);
            }}
          />
          <button className="btn ghost" disabled={cargando} onClick={() => fileInput.current?.click()}>
            Subir archivo (.dump / .sql)
          </button>
        </div>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <h3 style={{ margin: 16 }}>Respaldos ({archivos.length})</h3>
        <table className="table" style={{ margin: 0 }}>
          <thead>
            <tr>
              <th>Archivo</th>
              <th>Formato</th>
              <th>Tamaño</th>
              <th>Fecha</th>
              <th style={{ textAlign: "right" }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {archivos.map((b) => (
              <tr key={b.nombre}>
                <td>
                  <strong>{b.nombre}</strong>
                </td>
                <td>
                  <span className="badge normal">{b.formato === "custom" ? "comprimido" : "SQL"}</span>
                </td>
                <td className="muted-2">{humano(b.bytes)}</td>
                <td className="small muted">{new Date(b.modificado).toLocaleString("es-MX")}</td>
                <td>
                  <div className="row" style={{ justifyContent: "flex-end" }}>
                    <a className="btn ghost sm" href={`/api/backups/${encodeURIComponent(b.nombre)}/descargar`}>
                      Descargar
                    </a>
                    <button className="btn primary sm" disabled={cargando} onClick={() => setARestaurar(b)}>
                      Restaurar
                    </button>
                    <button className="btn danger sm" disabled={cargando} onClick={() => setABorrar(b)}>
                      Eliminar
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {archivos.length === 0 && (
              <tr>
                <td colSpan={5} className="empty">
                  Sin respaldos todavía. Crea el primero arriba.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {aRestaurar && (
        <ConfirmDialog
          title="Restaurar respaldo"
          danger
          loading={cargando}
          confirmLabel="Restaurar y sobrescribir"
          message={
            <>
              Se reemplazarán <strong>todos los datos actuales</strong> por los del respaldo{" "}
              <strong>{aRestaurar.nombre}</strong>. Esta acción no se puede deshacer. Al terminar se
              aplican las migraciones pendientes.
            </>
          }
          onConfirm={restaurar}
          onClose={() => setARestaurar(null)}
        />
      )}

      {aBorrar && (
        <ConfirmDialog
          title="Eliminar respaldo"
          danger
          loading={cargando}
          confirmLabel="Eliminar"
          message={<>¿Eliminar el archivo <strong>{aBorrar.nombre}</strong>? No afecta a la base de datos.</>}
          onConfirm={borrar}
          onClose={() => setABorrar(null)}
        />
      )}
    </AppShell>
  );
}
