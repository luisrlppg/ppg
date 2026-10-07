import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { execFile, spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createReadStream, existsSync } from "node:fs";
import { mkdir, readdir, stat, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import type { Readable } from "node:stream";
import { promisify } from "node:util";
import { PrismaService } from "../prisma/prisma.service";

const execFileAsync = promisify(execFile);

interface ResultadoProceso {
  code: number;
  stderr: string;
}

interface Proceso {
  child: ChildProcessWithoutNullStreams;
  done: Promise<ResultadoProceso>;
}

export interface BackupFile {
  nombre: string;
  bytes: number;
  modificado: string;
  formato: "custom" | "sql";
}

@Injectable()
export class BackupsService {
  private readonly logger = new Logger(BackupsService.name);
  private readonly dir: string;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.dir = join(this.repoRoot(), "docs", "backups");
  }

  private get url(): string {
    const raw = this.config.get<string>("DATABASE_URL") ?? "";
    return raw.split("?")[0];
  }

  async listar(): Promise<BackupFile[]> {
    await mkdir(this.dir, { recursive: true });
    const entries = await readdir(this.dir);
    const files = await Promise.all(
      entries
        .filter((f) => f.endsWith(".dump") || f.endsWith(".sql"))
        .map(async (f) => {
          const info = await stat(join(this.dir, f));
          return {
            nombre: f,
            bytes: info.size,
            modificado: info.mtime.toISOString(),
            formato: f.endsWith(".dump") ? ("custom" as const) : ("sql" as const),
          };
        }),
    );
    return files.sort((a, b) => b.modificado.localeCompare(a.modificado));
  }

  async crear(nombre?: string): Promise<BackupFile> {
    await mkdir(this.dir, { recursive: true });
    const ts = new Date()
      .toISOString()
      .replace(/[-:T]/g, "")
      .slice(0, 14);
    const safe = (nombre ?? "").trim().replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-");
    const file = safe ? `ppg-${ts}-${safe}.dump` : `ppg-${ts}.dump`;
    const target = join(this.dir, file);

    this.logger.log(`Creando respaldo ${file}`);
    await execFileAsync("pg_dump", [this.url, "-Fc", "-f", target]);
    const info = await stat(target);
    return { nombre: file, bytes: info.size, modificado: info.mtime.toISOString(), formato: "custom" };
  }

  private resolveFile(nombre: string): string {
    if (isAbsolute(nombre) || nombre.includes("/") || nombre.includes("\\") || nombre.includes("..")) {
      throw new BadRequestException("Nombre de respaldo inválido");
    }
    return join(this.dir, basename(nombre));
  }

  /** Raíz del monorepo (busca `pnpm-workspace.yaml` hacia arriba). */
  private repoRoot(): string {
    let dir = __dirname;
    for (let i = 0; i < 8; i++) {
      if (existsSync(join(dir, "pnpm-workspace.yaml"))) return dir;
      const parent = dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
    return resolve(__dirname, "../../../..");
  }

  /** Lanza un proceso, captura su stderr y resuelve al cerrar. */
  private lanzar(bin: string, args: string[]): Proceso {
    const child = spawn(bin, args);
    let stderr = "";
    child.stderr.on("data", (d: Buffer) => {
      stderr += d.toString();
    });
    const done = new Promise<ResultadoProceso>((resolve, reject) => {
      child.on("error", reject);
      child.on("close", (code) => resolve({ code: code ?? 1, stderr }));
    });
    return { child, done };
  }

  /**
   * Aplica el respaldo dentro de UNA transacción: recrea el schema `public`
   * (`DROP SCHEMA ... CASCADE`) y luego vuelca `entrada`. Si algo falla, revierte
   * todo (no deja la BD a medias) y tampoco tropieza con objetos de un esquema
   * viejo que los `DROP` de `--clean` no pueden eliminar por dependencias.
   */
  private async aplicarAtomico(entrada: Readable, extra: Proceso | null, nombre: string): Promise<void> {
    const psql = this.lanzar("psql", [
      "-v",
      "ON_ERROR_STOP=1",
      "--single-transaction",
      "-f",
      "-",
      this.url,
    ]);
    psql.child.stdin.on("error", () => undefined); // EPIPE si psql aborta primero
    psql.child.stdout.resume(); // drena salida para evitar bloqueos por buffer
    psql.child.stdin.write("DROP SCHEMA IF EXISTS public CASCADE;\nCREATE SCHEMA public;\n");
    entrada.on("error", (e) => psql.child.stdin.destroy(e));
    entrada.pipe(psql.child.stdin, { end: false });
    entrada.on("end", () => psql.child.stdin.end());

    let psqlRes: ResultadoProceso;
    let extraRes: ResultadoProceso;
    try {
      [psqlRes, extraRes] = await Promise.all([
        psql.done,
        extra ? extra.done : Promise.resolve({ code: 0, stderr: "" }),
      ]);
    } catch (e) {
      psql.child.kill();
      extra?.child.kill();
      throw new InternalServerErrorException(`Falló la restauración de ${nombre}: ${(e as Error).message}`);
    }

    if (psqlRes.code !== 0 || extraRes.code !== 0) {
      const detalle = [extraRes.stderr, psqlRes.stderr]
        .map((s) => (s ?? "").trim())
        .filter(Boolean)
        .join("\n");
      this.logger.error(`Restauración (${nombre}) falló: ${detalle}`);
      throw new InternalServerErrorException(`Falló la restauración de ${nombre}: ${detalle}`);
    }
  }

  /** Aplica migraciones pendientes tras restaurar (sin depender de pnpm). */
  private async migrar(): Promise<void> {
    const root = this.repoRoot();
    await execFileAsync(
      "node",
      [
        "packages/db/node_modules/prisma/build/index.js",
        "migrate",
        "deploy",
        "--schema",
        "packages/db/prisma/schema.prisma",
      ],
      { cwd: root },
    );
  }

  /** Migraciones que existen en el código (carpetas versionadas). */
  private async migracionesLocales(): Promise<Set<string>> {
    const dir = join(this.repoRoot(), "packages", "db", "prisma", "migrations");
    const entries = await readdir(dir, { withFileTypes: true });
    return new Set(entries.filter((e) => e.isDirectory()).map((e) => e.name));
  }

  /** Migraciones ya aplicadas en la BD destino (historial de Prisma). */
  private async migracionesAplicadas(): Promise<string[]> {
    try {
      const rows = await this.prisma.$queryRaw<{ migration_name: string }[]>`
        SELECT migration_name FROM "_prisma_migrations"
        WHERE finished_at IS NOT NULL
        ORDER BY finished_at ASC
      `;
      return rows.map((r) => r.migration_name);
    } catch {
      // El respaldo puede no traer la tabla de historial (SQL plano / BD nueva).
      return [];
    }
  }

  private async migracionActual(): Promise<string | null> {
    const aplicadas = await this.migracionesAplicadas();
    return aplicadas[aplicadas.length - 1] ?? null;
  }

  /**
   * Evita dejar la BD con un esquema que el código no entiende: si el respaldo
   * trae migraciones que esta imagen no conoce, el admin debe actualizar
   * código/imagen (git pull + rebuild) antes de restaurarlo.
   */
  private async verificarCompatibilidad(): Promise<void> {
    const locales = await this.migracionesLocales();
    const aplicadas = await this.migracionesAplicadas();
    const desconocidas = aplicadas.filter((m) => !locales.has(m));
    if (desconocidas.length > 0) {
      throw new InternalServerErrorException(
        `El respaldo usa migraciones que este código desconoce (${desconocidas.join(", ")}). ` +
          "Actualiza el servidor (git pull + docker compose build) y vuelve a intentarlo.",
      );
    }
  }

  /** Vuelca un archivo de respaldo sobre la BD recreando el schema `public`. */
  private async aplicarArchivo(target: string, esCustom: boolean, nombre: string): Promise<void> {
    if (esCustom) {
      // `pg_restore --file -` genera el SQL; se aplica atómicamente por psql.
      const pg = this.lanzar("pg_restore", [
        "--clean",
        "--if-exists",
        "--no-owner",
        "--no-privileges",
        "--file",
        "-",
        target,
      ]);
      pg.child.stdin.end(); // pg_restore no lee stdin
      await this.aplicarAtomico(pg.child.stdout, pg, nombre);
    } else {
      await this.aplicarAtomico(createReadStream(target), null, nombre);
    }
  }

  async restaurar(nombre: string): Promise<{
    ok: true;
    archivo: string;
    formato: "custom" | "sql";
    respaldoPrevio: string | null;
    migracion: string | null;
  }> {
    const target = this.resolveFile(nombre);
    try {
      await stat(target);
    } catch {
      throw new NotFoundException(`No existe el respaldo ${nombre}`);
    }

    const esCustom = nombre.endsWith(".dump");
    this.logger.warn(`Restaurando respaldo ${nombre}`);

    // Punto de retorno automático: si algo falla, prod no se queda sin datos.
    let previo: BackupFile | null = null;
    try {
      previo = await this.crear("pre-restore");
      this.logger.log(`Respaldo previo creado: ${previo.nombre}`);
    } catch (e) {
      this.logger.warn(`No se pudo crear respaldo previo: ${(e as Error).message}`);
    }

    try {
      await this.aplicarArchivo(target, esCustom, nombre);
      await this.verificarCompatibilidad();
      this.logger.log("Aplicando migraciones pendientes…");
      await this.migrar();
      const migracion = await this.migracionActual();
      return {
        ok: true,
        archivo: nombre,
        formato: esCustom ? "custom" : "sql",
        respaldoPrevio: previo?.nombre ?? null,
        migracion,
      };
    } catch (e) {
      // Rollback: reintenta con el respaldo previo para no dejar la BD a medias.
      if (previo) {
        this.logger.error(`Restauración de ${nombre} falló; revirtiendo al respaldo previo ${previo.nombre}…`);
        try {
          await this.aplicarArchivo(join(this.dir, previo.nombre), true, previo.nombre);
          await this.migrar();
          this.logger.log("Rollback completado.");
        } catch (re) {
          this.logger.error(`Falló el rollback con ${previo.nombre}: ${(re as Error).message}`);
        }
      }
      throw e instanceof InternalServerErrorException
        ? e
        : new InternalServerErrorException(`Falló la restauración de ${nombre}: ${(e as Error).message}`);
    }
  }

  async guardarSubido(nombreOriginal: string, data: Buffer): Promise<BackupFile> {
    const limpio = basename(nombreOriginal || "").replace(/[^a-zA-Z0-9._-]/g, "-");
    if (!limpio.endsWith(".dump") && !limpio.endsWith(".sql")) {
      throw new BadRequestException("El archivo debe ser .dump (custom) o .sql (texto plano)");
    }
    await mkdir(this.dir, { recursive: true });
    const target = this.resolveFile(limpio);
    await writeFile(target, data);
    const info = await stat(target);
    return { nombre: limpio, bytes: info.size, modificado: info.mtime.toISOString(), formato: limpio.endsWith(".dump") ? "custom" : "sql" };
  }

  async eliminar(nombre: string): Promise<{ ok: true; archivo: string }> {
    const target = this.resolveFile(nombre);
    try {
      await unlink(target);
    } catch {
      throw new NotFoundException(`No existe el respaldo ${nombre}`);
    }
    return { ok: true, archivo: nombre };
  }

  stream(nombre: string) {
    const target = this.resolveFile(nombre);
    return createReadStream(target);
  }
}
