import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@ppg/db";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class ClientesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: { search?: string; incluirInactivos?: boolean }) {
    const where: Prisma.PartnerWhereInput = {
      ...(query.incluirInactivos ? {} : { activo: true }),
      ...(query.search
        ? {
            OR: [
              { nombre: { contains: query.search, mode: "insensitive" } },
              { telefono: { contains: query.search, mode: "insensitive" } },
              { email: { contains: query.search, mode: "insensitive" } },
            ],
          }
        : {}),
    };
    const rows = await this.prisma.partner.findMany({
      where,
      orderBy: { nombre: "asc" },
      include: { _count: { select: { orders: true } } },
    });
    return rows.map((r) => ({ ...r, ordenes: r._count.orders, _count: undefined }));
  }

  async get(id: number) {
    const p = await this.prisma.partner.findUnique({
      where: { id },
      include: { orders: { include: { lines: true }, orderBy: { fecha: "desc" }, take: 20 } },
    });
    if (!p) throw new NotFoundException("Cliente no encontrado");
    return p;
  }

  create(data: { nombre: string; telefono?: string; direccion?: string; email?: string }) {
    const nombre = data.nombre.trim();
    if (!nombre) throw new BadRequestException("El nombre es obligatorio");
    return this.prisma.partner.create({
      data: { nombre, telefono: data.telefono ?? null, direccion: data.direccion ?? null, email: data.email ?? null },
    });
  }

  async update(
    id: number,
    data: Partial<{ nombre: string; telefono: string; direccion: string; email: string; activo: boolean }>,
  ) {
    const exists = await this.prisma.partner.findUnique({ where: { id } });
    if (!exists) throw new NotFoundException("Cliente no encontrado");
    return this.prisma.partner.update({
      where: { id },
      data: {
        ...(data.nombre !== undefined ? { nombre: data.nombre.trim() } : {}),
        ...(data.telefono !== undefined ? { telefono: data.telefono } : {}),
        ...(data.direccion !== undefined ? { direccion: data.direccion } : {}),
        ...(data.email !== undefined ? { email: data.email } : {}),
        ...(data.activo !== undefined ? { activo: data.activo } : {}),
      },
    });
  }

  async deactivate(id: number) {
    const exists = await this.prisma.partner.findUnique({ where: { id } });
    if (!exists) throw new NotFoundException("Cliente no encontrado");
    await this.prisma.partner.update({ where: { id }, data: { activo: false } });
    return { ok: true };
  }

  /** Importa clientes desde CSV pegado (columnas: nombre, telefono, direccion, email).
   *  Encabezado opcional; las filas duplicadas por nombre se omiten. */
  async importar(csv: string): Promise<{ creados: number; omitidos: number }> {
    const lineas = csv
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    if (lineas.length === 0) throw new BadRequestException("El CSV está vacío");

    const esEncabezado = (row: string[]) => row.length > 0 && /nombre/i.test(row[0]);
    const filas = lineas
      .map((l) => l.split(",").map((c) => c.trim().replace(/^["']|["']$/g, "")))
      .filter((row) => row.length >= 1 && row[0] !== "")
      .filter((row) => !esEncabezado(row));

    let creados = 0;
    let omitidos = 0;
    for (const row of filas) {
      const [nombreRaw, telefono, direccion, email] = row;
      const nombre = nombreRaw.trim();
      if (!nombre) continue;
      const exists = await this.prisma.partner.findFirst({ where: { nombre } });
      if (exists) {
        omitidos++;
        continue;
      }
      await this.prisma.partner.create({
        data: {
          nombre,
          telefono: telefono || null,
          direccion: direccion || null,
          email: email || null,
        },
      });
      creados++;
    }
    return { creados, omitidos };
  }
}