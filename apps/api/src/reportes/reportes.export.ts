import { dec } from "../common/util";
import { PrismaService } from "../prisma/prisma.service";

export async function exportarReportes(
  prisma: PrismaService,
  query: { desde?: string; hasta?: string },
): Promise<string> {
  const desde = query.desde ? new Date(`${query.desde}T00:00:00`) : new Date(0);
  const hasta = query.hasta ? new Date(`${query.hasta}T23:59:59`) : new Date();
  const reports = await prisma.productionReport.findMany({
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
