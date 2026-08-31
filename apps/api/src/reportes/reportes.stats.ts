import { PrismaService } from "../prisma/prisma.service";
import { dec } from "../common/util";
import { HORAS_TURNO, Turno } from "./reportes.constants";

export interface StatsResult {
  desde: string;
  hasta: string;
  reportesAplicados: number;
  totalFinal: number;
  totalConsumo: number;
  porSeccion: { seccion: string; unidades: number; unidadesPorPersonaHora: number }[];
  consumo: { variantId: number; nombre: string; producto: string; unidades: number }[];
}

export async function estadisticas(
  prisma: PrismaService,
  query: { desde?: string; hasta?: string },
): Promise<StatsResult> {
  const desde = query.desde ? new Date(`${query.desde}T00:00:00`) : new Date(0);
  const hasta = query.hasta ? new Date(`${query.hasta}T23:59:59`) : new Date();
  const reports = await prisma.productionReport.findMany({
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
