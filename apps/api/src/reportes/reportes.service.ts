import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@ppg/db";
import { dec } from "../common/util";
import { PrismaService } from "../prisma/prisma.service";
import { MonitorService } from "../monitor/monitor.service";

export const TURNOS = ["matutino", "vespertino", "nocturno"] as const;
export type Turno = (typeof TURNOS)[number];

export const SECCIONES = ["maquina1", "maquina2", "maquina3", "ensamble", "ensartado", "pegado", "perforado"] as const;
export type Seccion = (typeof SECCIONES)[number];

export const HORAS_TURNO: Record<Turno, number> = {
  matutino: 8,
  vespertino: 7.5,
  nocturno: 8,
};

interface LineaInput {
  variantId: number;
  seccion: string;
  tipo: string;
  ok: number;
}

export interface CrearReporteInput {
  turno: string;
  fecha?: string;
  personas?: number;
  horasTrabajadas?: number;
  notas?: string;
  manufacturingOrderId?: number;
  lines: LineaInput[];
}

function placeholderNumero(): string {
  return `PEND-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

@Injectable()
export class ReportesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly monitor: MonitorService,
  ) {}

  private horaInicio(fecha?: string): Date {
    const f = fecha ? new Date(`${fecha}T12:00:00`) : new Date();
    const d = new Date(f);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  // ---------------------------------------------------------------- Lista
  async list(query: { search?: string; estado?: string; turno?: string; fecha?: string; of?: string }) {
    const estados = ["pendiente", "aplicado", "cancelado"] as const;
    const estadoOk = query.estado && (estados as readonly string[]).includes(query.estado);
    const turnoOk = query.turno && (TURNOS as readonly string[]).includes(query.turno);
    const ini = this.horaInicio(query.fecha);
    const fin = new Date(ini);
    fin.setDate(fin.getDate() + 1);

    const where: Prisma.ProductionReportWhereInput = {
      ...(estadoOk ? { estado: query.estado as Prisma.ProductionReportWhereInput["estado"] } : {}),
      ...(turnoOk ? { turno: query.turno as Prisma.ProductionReportWhereInput["turno"] } : {}),
      ...(query.fecha ? { fecha: { gte: ini, lt: fin } } : {}),
      ...(query.search ? { numero: { contains: query.search, mode: "insensitive" } } : {}),
      ...(query.of ? { manufacturingOrder: { numero: query.of } } : {}),
    };

    const rows = await this.prisma.productionReport.findMany({
      where,
      orderBy: { fecha: "desc" },
      include: {
        manufacturingOrder: { select: { numero: true } },
        lines: {
          include: { variant: { include: { product: { select: { nombre: true, uom: true } } } } },
        },
      },
    });

    return rows.map((r) => {
      const secciones = [...new Set(r.lines.map((l) => l.seccion))];
      const totalFinal = r.lines.filter((l) => l.tipo === "final").reduce((a, l) => a + dec(l.ok), 0);
      const totalConsumo = r.lines.filter((l) => l.tipo === "consumo").reduce((a, l) => a + dec(l.ok), 0);
      return {
        id: r.id,
        numero: r.numero,
        turno: r.turno,
        fecha: r.fecha,
        personas: r.personas,
        horasTrabajadas: r.horasTrabajadas,
        notas: r.notas,
        estado: r.estado,
        aplicadoAt: r.aplicadoAt,
        manufacturingOrder: r.manufacturingOrder?.numero ?? null,
        lineas: r.lines.length,
        secciones,
        totalFinal,
        totalConsumo,
      };
    });
  }

// ------------------------------------------------- Prefill jornada anterior
  async ultimo(turno?: string) {
    const turnoOk = turno && (TURNOS as readonly string[]).includes(turno);
    const r = await this.prisma.productionReport.findFirst({
      where: turnoOk ? { turno: turno as Turno, estado: { not: "cancelado" } } : undefined,
      orderBy: { fecha: "desc" },
      include: {
        lines: {
          orderBy: { id: "asc" },
          include: { variant: { include: { product: { select: { nombre: true, uom: true } } } } },
        },
      },
    });
    if (!r) return null;
    return {
      id: r.id,
      turno: r.turno,
      fecha: r.fecha.toISOString().slice(0, 10),
      personas: r.personas,
      horasTrabajadas: dec(r.horasTrabajadas) > 0 ? dec(r.horasTrabajadas) : undefined,
      notas: r.notas,
      manufacturingOrderId: r.manufacturingOrderId ?? undefined,
      lines: r.lines.map((l) => ({
        variantId: l.variantId,
        sku: l.variant.sku,
        nombre: l.variant.nombre,
        producto: l.variant.product.nombre,
        uom: l.variant.product.uom,
        seccion: l.seccion,
        tipo: l.tipo,
        ok: dec(l.ok),
      })),
    };
  }

  // ------------------------------------------------------------ Detalle
  async get(id: number) {
    const r = await this.prisma.productionReport.findUnique({
      where: { id },
      include: {
        manufacturingOrder: { select: { numero: true, estado: true } },
        lines: {
          include: { variant: { include: { product: { select: { nombre: true, uom: true } } } } },
        },
      },
    });
    if (!r) throw new NotFoundException("Reporte no encontrado");
    return {
      ...r,
      manufacturingOrder: r.manufacturingOrder,
      lines: r.lines.map((l) => ({
        id: l.id,
        variantId: l.variantId,
        sku: l.variant.sku,
        nombre: l.variant.nombre,
        producto: l.variant.product.nombre,
        uom: l.variant.product.uom,
        seccion: l.seccion,
        tipo: l.tipo,
        ok: l.ok,
        qtyAplicada: l.qtyAplicada,
        qtyUbicada: l.qtyUbicada,
        pendienteUbicar: dec(l.qtyAplicada) - dec(l.qtyUbicada),
      })),
    };
  }

  // -------------------------------------------------------------- Crear
  async crear(input: CrearReporteInput, userId?: number) {
    this.validar(input);
    const id = await this.prisma.$transaction(async (tx) => {
      const created = await tx.productionReport.create({
        data: {
          numero: placeholderNumero(),
          turno: input.turno as Turno,
          fecha: input.fecha ? new Date(`${input.fecha}T12:00:00`) : undefined,
          personas: input.personas ?? 1,
          horasTrabajadas: input.horasTrabajadas ?? null,
          manufacturingOrderId: input.manufacturingOrderId ?? null,
          notas: input.notas ?? null,
          userId,
        },
      });
      const numero = `RPT-${String(created.id).padStart(4, "0")}`;
      await tx.productionReport.update({ where: { id: created.id }, data: { numero } });
      await tx.productionReportLine.createMany({
        data: input.lines.map((l) => ({ reportId: created.id, variantId: l.variantId, seccion: l.seccion as Seccion, tipo: l.tipo as "final" | "consumo", ok: dec(l.ok) })),
      });
      return created.id;
    });
    return this.get(id);
  }

  // -------------------------------------------------------------- Editar
  async editar(id: number, input: CrearReporteInput, userId?: number) {
    this.validar(input);
    await this.prisma.$transaction(async (tx) => {
      const r = await tx.productionReport.findUnique({ where: { id } });
      if (!r) throw new NotFoundException("Reporte no encontrado");
      if (r.estado !== "pendiente") throw new BadRequestException("Solo se edita un reporte pendiente");
      await tx.productionReport.update({
        where: { id },
        data: {
          turno: input.turno as Turno,
          notas: input.notas ?? null,
          personas: input.personas ?? 1,
          horasTrabajadas: input.horasTrabajadas ?? null,
          manufacturingOrderId: input.manufacturingOrderId ?? null,
        },
      });
      await tx.productionReportLine.deleteMany({ where: { reportId: id } });
      await tx.productionReportLine.createMany({
        data: input.lines.map((l) => ({ reportId: id, variantId: l.variantId, seccion: l.seccion as Seccion, tipo: l.tipo as "final" | "consumo", ok: dec(l.ok) })),
      });
    });
    return this.get(id);
  }

  // ------------------------------------------------------- Aplicar (§8.2)
  async aplicar(id: number, userId?: number) {
    const recibo = await this.prisma.location.findFirst({ where: { nombre: "Recibo de Producción" } });
    if (!recibo) throw new BadRequestException("Falta la ubicación 'Recibo de Producción'");
    const notificar: number[] = [];

    await this.prisma.$transaction(async (tx) => {
      const r = await tx.productionReport.findUnique({
        where: { id },
        include: { lines: { orderBy: { id: "asc" } } },
      });
      if (!r) throw new NotFoundException("Reporte no encontrado");
      if (r.estado !== "pendiente") throw new BadRequestException("Solo se aplica un reporte pendiente");

      for (const line of r.lines) {
        const ok = dec(line.ok);
        if (ok <= 0) continue;
        if (line.tipo === "final") {
          const level = await tx.stockLevel.findUnique({
            where: { variantId_locationId: { variantId: line.variantId, locationId: recibo.id } },
          });
          if (level) {
            await tx.stockLevel.update({ where: { id: level.id }, data: { qty: { increment: ok } } });
          } else {
            await tx.stockLevel.create({ data: { variantId: line.variantId, locationId: recibo.id, qty: ok } });
          }
          await tx.stockMove.create({
            data: { variantId: line.variantId, locationId: recibo.id, qty: ok, motivo: "produccion", ref: r.numero, userId },
          });
        } else {
          // consumo: decrementa del stock (prefiere "Almacén principal", igual que el despacho)
          const levels = await tx.stockLevel.findMany({ where: { variantId: line.variantId } });
          const preferido = await tx.location.findFirst({ where: { nombre: "Almacén principal" } });
          levels.sort(
            (a, b) => Number(a.locationId === (preferido?.id ?? null) ? 0 : 1) - Number(b.locationId === (preferido?.id ?? null) ? 0 : 1),
          );
          const total = levels.reduce((a, l) => a + dec(l.qty), 0);
          if (total < ok) {
            throw new BadRequestException(`Stock insuficiente del consumible en el reporte (hay ${total} y se consumen ${ok})`);
          }
          let restante = ok;
          for (const level of levels) {
            if (restante <= 0) break;
            const usar = Math.min(restante, dec(level.qty));
            await tx.stockLevel.update({
              where: { id: level.id },
              data: { qty: { decrement: usar } },
            });
            await tx.stockMove.create({
              data: { variantId: line.variantId, locationId: level.locationId, qty: -usar, motivo: "consumo", ref: r.numero, userId },
            });
            restante -= usar;
          }
        }
        await tx.productionReportLine.update({ where: { id: line.id }, data: { qtyAplicada: ok } });
        notificar.push(line.variantId);
      }

      if (r.manufacturingOrderId) {
        await tx.manufacturingOrder.update({
          where: { id: r.manufacturingOrderId },
          data: { estado: "hecha", finalizadoAt: new Date() },
        });
      }
      await tx.productionReport.update({ where: { id }, data: { estado: "aplicado", aplicadoAt: new Date() } });
    });

    const canales: string[] = [];
    for (const vid of [...new Set(notificar)]) {
      const res = await this.monitor.afterStockChange(vid);
      if (res.notificado) canales.push(...res.canales);
    }
    return { ok: true, aplicados: notificar.length, canales: [...new Set(canales)] };
  }

  // ------------------------------------------------------------- Cancelar
  async cancelar(id: number) {
    return this.prisma.$transaction(async (tx) => {
      const r = await tx.productionReport.findUnique({ where: { id } });
      if (!r) throw new NotFoundException("Reporte no encontrado");
      if (r.estado !== "pendiente") throw new BadRequestException("Solo se cancela un reporte pendiente");
      return tx.productionReport.update({ where: { id }, data: { estado: "cancelado" } });
    });
  }

// ------------------------------------------------- Lotes para ubicar (§8.3)
  async lotes() {
    const lines = await this.prisma.productionReportLine.findMany({
      where: { tipo: "final", report: { estado: "aplicado" } },
      orderBy: { id: "asc" },
      include: {
        variant: { include: { product: { select: { nombre: true, uom: true } } } },
        report: { select: { numero: true } },
      },
    });
    return lines
      .map((l) => ({
        lineaId: l.id,
        reporte: l.report.numero,
        variantId: l.variantId,
        sku: l.variant.sku,
        nombre: l.variant.nombre,
        producto: l.variant.product.nombre,
        uom: l.variant.product.uom,
        aplicado: dec(l.qtyAplicada),
        ubicado: dec(l.qtyUbicada),
        pendiente: dec(l.qtyAplicada) - dec(l.qtyUbicada),
      }))
      .filter((l) => l.pendiente > 0);
  }

  // --------------------------------------------------------- Ubicar lote
  async ubicar(lineaId: number, dto: { cantidad: number; locationId: number }, userId?: number) {
    const cantidad = dec(dto.cantidad);
    if (!(cantidad > 0)) throw new BadRequestException("Cantidad inválida");
    return this.prisma.$transaction(async (tx) => {
      const line = await tx.productionReportLine.findUnique({
        where: { id: lineaId },
        include: { report: { select: { numero: true, estado: true } } },
      });
      if (!line) throw new NotFoundException("Lote no encontrado");
      if (line.report.estado !== "aplicado") throw new BadRequestException("El lote debe provenir de un reporte aplicado");

      const pendiente = dec(line.qtyAplicada) - dec(line.qtyUbicada);
      if (cantidad > pendiente) throw new BadRequestException(`Solo quedan ${pendiente} de este lote por ubicar`);

      const destino = await tx.location.findUnique({ where: { id: dto.locationId } });
      if (!destino) throw new NotFoundException("Compartimento no encontrado");
      if (destino.tipo !== "almacen") throw new BadRequestException("El destino debe ser un compartimento de almacén");

      const recibo = await tx.location.findFirst({ where: { nombre: "Recibo de Producción" } });
      if (!recibo) throw new BadRequestException("Falta la ubicación 'Recibo de Producción'");

      const levelRecibo = await tx.stockLevel.findUnique({
        where: { variantId_locationId: { variantId: line.variantId, locationId: recibo.id } },
      });
      if (!levelRecibo || dec(levelRecibo.qty) < cantidad) {
        throw new BadRequestException("No hay suficiente stock en el Recibo de Producción para este lote");
      }

      await tx.stockLevel.update({ where: { id: levelRecibo.id }, data: { qty: { decrement: cantidad } } });
      const levelDestino = await tx.stockLevel.findUnique({
        where: { variantId_locationId: { variantId: line.variantId, locationId: destino.id } },
      });
      if (levelDestino) {
        await tx.stockLevel.update({ where: { id: levelDestino.id }, data: { qty: { increment: cantidad } } });
      } else {
        await tx.stockLevel.create({
          data: { variantId: line.variantId, locationId: destino.id, qty: cantidad },
        });
      }
      await tx.stockMove.create({
        data: {
          variantId: line.variantId,
          fromLocationId: recibo.id,
          toLocationId: destino.id,
          qty: cantidad,
          motivo: "ubicacion",
          ref: `${line.report.numero} · lote ${line.id}`,
          userId,
        },
      });
      await tx.productionReportLine.update({
        where: { id: lineaId },
        data: { qtyUbicada: { increment: cantidad } },
      });
    }).then(async () => {
      const res = await this.monitor.afterStockChange((await this.prisma.productionReportLine.findUnique({ where: { id: lineaId } }))!.variantId);
      return { ok: true, notificado: res.notificado };
    });
  }

  // ---------------------------------------------------------------- Stats
  async stats(query: { desde?: string; hasta?: string }) {
    const desde = query.desde ? new Date(`${query.desde}T00:00:00`) : new Date(0);
    const hasta = query.hasta ? new Date(`${query.hasta}T23:59:59`) : new Date();
    const reports = await this.prisma.productionReport.findMany({
      where: { estado: "aplicado", fecha: { gte: desde, lte: hasta } },
      include: {
        lines: {
          include: { variant: { include: { product: { select: { nombre: true } } } } },
        },
      },
    });

    const porSeccion = new Map<string, { unidades: number; metrica: number }>();
    const consumo = new Map<string, { variantId: number; nombre: string; producto: string; unidades: number }>();
    let totalFinal = 0;
    let totalConsumo = 0;

    for (const r of reports) {
      const horas = dec(r.horasTrabajadas) > 0 ? dec(r.horasTrabajadas) : HORAS_TURNO[r.turno as Turno] ?? 8;
      const base = Math.max(1, r.personas) * horas;
      for (const l of r.lines) {
        const ok = dec(l.ok);
        if (l.tipo === "final") {
          totalFinal += ok;
          const act = porSeccion.get(l.seccion) ?? { unidades: 0, metrica: 0 };
          act.unidades += ok;
          act.metrica += ok / base;
          porSeccion.set(l.seccion, act);
        } else {
          totalConsumo += ok;
          const clave = `${l.variantId}`;
          const act = consumo.get(clave) ?? { variantId: l.variantId, nombre: l.variant.nombre, producto: l.variant.product.nombre, unidades: 0 };
          act.unidades += ok;
          consumo.set(clave, act);
        }
      }
    }

    return {
      desde: query.desde ?? "inicio",
      hasta: query.hasta ?? "hoy",
      reportesAplicados: reports.length,
      totalFinal,
      totalConsumo,
      porSeccion: [...porSeccion.entries()].map(([seccion, v]) => ({
        seccion,
        unidades: Math.round(v.unidades * 1000) / 1000,
        unidadesPorPersonaHora: Math.round(v.metrica * 1000) / 1000,
      })),
      consumo: [...consumo.values()].map((c) => ({
        ...c,
        unidades: Math.round(c.unidades * 1000) / 1000,
      })),
    };
  }

  // -------------------------------------------------------------- Exportar
  async exportar(query: { desde?: string; hasta?: string }): Promise<string> {
    const desde = query.desde ? new Date(`${query.desde}T00:00:00`) : new Date(0);
    const hasta = query.hasta ? new Date(`${query.hasta}T23:59:59`) : new Date();
    const reports = await this.prisma.productionReport.findMany({
      where: { fecha: { gte: desde, lte: hasta } },
      orderBy: { fecha: "asc" },
      include: {
        manufacturingOrder: { select: { numero: true } },
        lines: {
          include: { variant: { include: { product: { select: { nombre: true, uom: true } } } } },
        },
      },
    });
    const header = [
      "reporte",
      "fecha",
      "turno",
      "estado",
      "personas",
      "horas",
      "seccion",
      "producto",
      "variante",
      "sku",
      "tipo",
      "cantidad",
      "of",
    ];
    const filas = reports.flatMap((r) =>
      r.lines.map((l) =>
        [
          r.numero,
          new Date(r.fecha).toISOString().slice(0, 10),
          r.turno,
          r.estado,
          r.personas,
          dec(r.horasTrabajadas),
          l.seccion,
          l.variant.product.nombre,
          l.variant.nombre,
          l.variant.sku,
          l.tipo,
          dec(l.ok),
          r.manufacturingOrder?.numero ?? "",
        ].join(";"),
      ),
    );
    return [header.join(";"), ...filas].join("\r\n");
  }

  // --------------------------------------------------------------- Helpers
  private validar(input: CrearReporteInput) {
    if (!TURNOS.includes(input.turno as Turno)) throw new BadRequestException("Turno inválido");
    if (!input.lines || input.lines.length === 0) throw new BadRequestException("Agrega al menos una línea con conteo");
    for (const l of input.lines) {
      if (!SECCIONES.includes(l.seccion as Seccion)) throw new BadRequestException(`Sección inválida: ${l.seccion}`);
      if (l.tipo !== "final" && l.tipo !== "consumo") throw new BadRequestException(`Tipo de línea inválido: ${l.tipo}`);
      if (!(dec(l.ok) > 0)) throw new BadRequestException("Las cantidades deben ser mayores a 0");
      if (!(l.variantId > 0)) throw new BadRequestException("Se requiere una variante real");
    }
  }
}
