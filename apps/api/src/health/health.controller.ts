import { Controller, Get } from "@nestjs/common";
import { Public } from "../auth/decorators/public.decorator";
import { PrismaService } from "../prisma/prisma.service";

@Public()
@Controller("health")
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async health() {
    let migracion: string | null = null;
    try {
      const rows = await this.prisma.$queryRaw<{ migration_name: string }[]>`
        SELECT migration_name FROM "_prisma_migrations"
        WHERE finished_at IS NOT NULL
        ORDER BY finished_at DESC
        LIMIT 1
      `;
      migracion = rows[0]?.migration_name ?? null;
    } catch {
      migracion = null;
    }
    return {
      status: "ok",
      service: "ppg-api",
      time: new Date().toISOString(),
      commit: process.env.GIT_SHA || null,
      buildTime: process.env.BUILD_TIME || null,
      migracion,
    };
  }
}
