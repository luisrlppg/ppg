import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { execFile } from "node:child_process";
import { createReadStream, existsSync } from "node:fs";
import { mkdir, readdir, stat, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

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

  constructor(private readonly config: ConfigService) {
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

  /** Ejecuta un comando de restauración y propaga el stderr ante error. */
  private async ejecutar(bin: string, args: string[]): Promise<void> {
    try {
      await execFileAsync(bin, args);
    } catch (e) {
      const err = e as { stderr?: string; message?: string };
      const detalle = (err.stderr ?? err.message ?? "").trim();
      this.logger.error(`${bin} falló: ${detalle}`);
      throw new InternalServerErrorException(`Falló la restauración: ${detalle}`);
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

  async restaurar(nombre: string): Promise<{ ok: true; archivo: string; formato: "custom" | "sql" }> {
    const target = this.resolveFile(nombre);
    try {
      await stat(target);
    } catch {
      throw new NotFoundException(`No existe el respaldo ${nombre}`);
    }

    const esCustom = nombre.endsWith(".dump");
    this.logger.warn(`Restaurando respaldo ${nombre}`);

    if (esCustom) {
      // --single-transaction + --exit-on-error: si algo falla, se revierte todo
      // (no deja la BD a medias); el stderr se propaga para diagnosticar.
      await this.ejecutar("pg_restore", [
        "--clean",
        "--if-exists",
        "--no-owner",
        "--no-privileges",
        "--single-transaction",
        "--exit-on-error",
        "-d",
        this.url,
        target,
      ]);
    } else {
      await this.ejecutar("psql", [
        this.url,
        "-v",
        "ON_ERROR_STOP=1",
        "-c",
        "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;",
      ]);
      await this.ejecutar("psql", [this.url, "-v", "ON_ERROR_STOP=1", "-f", target]);
    }

    // Deja la BD al día con el esquema del repo (evita quedar desactualizada).
    this.logger.log("Aplicando migraciones pendientes…");
    await this.migrar();

    return { ok: true, archivo: nombre, formato: esCustom ? "custom" : "sql" };
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
