import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@ppg/db";
import { PrismaService } from "../prisma/prisma.service";

export interface AtributoInput {
  nombre: string;
  valor: string;
}

export interface ItemInput {
  nombre: string;
  sku?: string | null;
  tipo?: string;
  cantidad?: number;
  ubicacion: string;
  notas?: string | null;
  familiaProductoId?: number | null;
  atributos?: AtributoInput[];
}

const TIPOS = new Set(["descontinuado", "subensamble"]);

const INCLUDE = {
  atributos: { orderBy: { nombre: "asc" as const } },
  familiaProducto: { select: { id: true, nombre: true } },
};

@Injectable()
export class InventarioHistoricoService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: {
    q?: string;
    tipo?: string;
    atributoNombre?: string;
    atributoValor?: string;
  }) {
    const where: Prisma.InventarioHistoricoWhereInput = {
      ...(query.tipo ? { tipo: query.tipo } : {}),
      ...(query.q
        ? {
            OR: [
              { nombre: { contains: query.q, mode: "insensitive" } },
              { sku: { contains: query.q, mode: "insensitive" } },
              { ubicacion: { contains: query.q, mode: "insensitive" } },
            ],
          }
        : {}),
      ...(query.atributoNombre
        ? {
            atributos: {
              some: {
                nombre: query.atributoNombre,
                ...(query.atributoValor
                  ? { valor: { contains: query.atributoValor, mode: "insensitive" } }
                  : {}),
              },
            },
          }
        : {}),
    };
    const rows = await this.prisma.inventarioHistorico.findMany({
      where,
      include: INCLUDE,
      orderBy: [{ tipo: "asc" }, { nombre: "asc" }, { ubicacion: "asc" }],
    });
    return rows.map((r) => this.serialize(r));
  }

  async get(id: number) {
    const row = await this.prisma.inventarioHistorico.findUnique({ where: { id }, include: INCLUDE });
    if (!row) throw new NotFoundException("Registro no encontrado");
    return this.serialize(row);
  }

  async create(data: ItemInput) {
    const nombre = data.nombre?.trim();
    if (!nombre) throw new BadRequestException("El nombre es obligatorio");
    const ubicacion = data.ubicacion?.trim();
    if (!ubicacion) throw new BadRequestException("La ubicación es obligatoria");

    const row = await this.prisma.inventarioHistorico.create({
      data: {
        nombre,
        sku: data.sku?.trim() || null,
        tipo: this.normalizarTipo(data.tipo),
        cantidad: new Prisma.Decimal(data.cantidad ?? 0),
        ubicacion,
        notas: data.notas?.trim() || null,
        familiaProductoId: data.familiaProductoId ?? null,
        atributos: { create: this.limpiarAtributos(data.atributos) },
      },
      include: INCLUDE,
    });
    return this.serialize(row);
  }

  async update(id: number, data: Partial<ItemInput>) {
    const exists = await this.prisma.inventarioHistorico.findUnique({ where: { id } });
    if (!exists) throw new NotFoundException("Registro no encontrado");

    await this.prisma.$transaction(async (tx) => {
      await tx.inventarioHistorico.update({
        where: { id },
        data: {
          ...(data.nombre !== undefined ? { nombre: data.nombre.trim() } : {}),
          ...(data.sku !== undefined ? { sku: data.sku?.trim() || null } : {}),
          ...(data.tipo !== undefined ? { tipo: this.normalizarTipo(data.tipo) } : {}),
          ...(data.cantidad !== undefined ? { cantidad: new Prisma.Decimal(data.cantidad) } : {}),
          ...(data.ubicacion !== undefined ? { ubicacion: data.ubicacion.trim() } : {}),
          ...(data.notas !== undefined ? { notas: data.notas?.trim() || null } : {}),
          ...(data.familiaProductoId !== undefined
            ? { familiaProductoId: data.familiaProductoId }
            : {}),
        },
      });

      if (data.atributos !== undefined) {
        await tx.inventarioHistoricoAtributo.deleteMany({ where: { itemId: id } });
        const attrs = this.limpiarAtributos(data.atributos);
        if (attrs.length > 0) {
          await tx.inventarioHistoricoAtributo.createMany({
            data: attrs.map((a) => ({ ...a, itemId: id })),
          });
        }
      }
    });

    return this.get(id);
  }

  async remove(id: number) {
    const exists = await this.prisma.inventarioHistorico.findUnique({ where: { id } });
    if (!exists) throw new NotFoundException("Registro no encontrado");
    await this.prisma.inventarioHistorico.delete({ where: { id } });
    return { ok: true };
  }

  /** Importa desde CSV. Columnas: nombre,sku,tipo,cantidad,ubicacion,notas,atributos.
   *  `atributos` va serializado como `Nombre=Valor;Nombre=Valor`. Encabezado opcional.
   *  Duplicados por nombre + ubicación + tipo se omiten. La familia se infiere por SKU. */
  async importar(csv: string): Promise<{ creados: number; omitidos: number }> {
    const rows = this.parseCsv(csv).filter((r) => r.some((c) => c.trim() !== ""));
    if (rows.length === 0) throw new BadRequestException("El CSV está vacío");

    const esEncabezado = (row: string[]) => row.length > 0 && /nombre/i.test(row[0]);
    const cuerpo = esEncabezado(rows[0]) ? rows.slice(1) : rows;

    const productos = await this.prisma.product.findMany({ select: { id: true, skuBase: true } });
    const familias = productos
      .map((p) => ({ id: p.id, base: p.skuBase.toUpperCase() }))
      .sort((a, b) => b.base.length - a.base.length);
    const inferirFamilia = (sku: string | null): number | null => {
      if (!sku) return null;
      const s = sku.toUpperCase();
      const hit = familias.find((f) => s === f.base || s.startsWith(`${f.base}-`));
      return hit?.id ?? null;
    };

    let creados = 0;
    let omitidos = 0;
    for (const row of cuerpo) {
      const [nombreRaw, skuRaw, tipoRaw, cantidadRaw, ubicacionRaw, notasRaw, attrsRaw] = row;
      const nombre = (nombreRaw ?? "").trim();
      const ubicacion = (ubicacionRaw ?? "").trim();
      if (!nombre || !ubicacion) continue;
      const sku = (skuRaw ?? "").trim() || null;
      const tipo = this.normalizarTipo(tipoRaw);

      const existe = await this.prisma.inventarioHistorico.findFirst({
        where: { nombre, ubicacion, tipo },
      });
      if (existe) {
        omitidos++;
        continue;
      }

      const cantidad = Number((cantidadRaw ?? "").replace(/[^0-9.-]/g, "")) || 0;
      await this.prisma.inventarioHistorico.create({
        data: {
          nombre,
          sku,
          tipo,
          cantidad: new Prisma.Decimal(cantidad),
          ubicacion,
          notas: (notasRaw ?? "").trim() || null,
          familiaProductoId: inferirFamilia(sku),
          atributos: { create: this.limpiarAtributos(this.parseAtributos(attrsRaw)) },
        },
      });
      creados++;
    }
    return { creados, omitidos };
  }

  // ------------------------------------------------------------------ helpers

  private normalizarTipo(tipo?: string): string {
    const t = (tipo ?? "").trim().toLowerCase();
    return TIPOS.has(t) ? t : "descontinuado";
  }

  private limpiarAtributos(attrs?: AtributoInput[]): { nombre: string; valor: string }[] {
    if (!attrs) return [];
    const map = new Map<string, string>();
    for (const a of attrs) {
      const nombre = (a.nombre ?? "").trim();
      const valor = (a.valor ?? "").trim();
      if (nombre && valor) map.set(nombre, valor);
    }
    return [...map.entries()].map(([nombre, valor]) => ({ nombre, valor }));
  }

  private parseAtributos(raw?: string): AtributoInput[] {
    if (!raw?.trim()) return [];
    return raw
      .split(";")
      .map((par) => {
        const idx = par.indexOf("=");
        if (idx < 0) return null;
        return { nombre: par.slice(0, idx).trim(), valor: par.slice(idx + 1).trim() };
      })
      .filter((a): a is AtributoInput => a !== null);
  }

  /** Parser CSV mínimo (RFC4180): soporta comillas dobles, comas y `""` escapado. */
  private parseCsv(text: string): string[][] {
    const rows: string[][] = [];
    let row: string[] = [];
    let field = "";
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inQuotes) {
        if (c === '"') {
          if (text[i + 1] === '"') {
            field += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          field += c;
        }
        continue;
      }
      if (c === '"') inQuotes = true;
      else if (c === ",") {
        row.push(field);
        field = "";
      } else if (c === "\n") {
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
      } else if (c !== "\r") {
        field += c;
      }
    }
    if (field !== "" || row.length > 0) {
      row.push(field);
      rows.push(row);
    }
    return rows;
  }

  private serialize(row: {
    id: number;
    nombre: string;
    sku: string | null;
    tipo: string;
    cantidad: Prisma.Decimal;
    ubicacion: string;
    notas: string | null;
    familiaProductoId: number | null;
    familiaProducto: { id: number; nombre: string } | null;
    atributos: { nombre: string; valor: string }[];
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: row.id,
      nombre: row.nombre,
      sku: row.sku,
      tipo: row.tipo,
      cantidad: Number(row.cantidad),
      ubicacion: row.ubicacion,
      notas: row.notas,
      familiaProductoId: row.familiaProductoId,
      familia: row.familiaProducto?.nombre ?? null,
      atributos: row.atributos.map((a) => ({ nombre: a.nombre, valor: a.valor })),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
