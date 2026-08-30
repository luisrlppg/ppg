import { Body, Controller, Get, HttpCode, Post, UseGuards } from "@nestjs/common";
import { IsBoolean, IsOptional } from "class-validator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { PrismaService } from "../prisma/prisma.service";
import { MonitorService } from "./monitor.service";

class CheckDto {
  @IsOptional()
  @IsBoolean()
  force?: boolean;
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("monitor")
export class MonitorController {
  constructor(
    private readonly monitor: MonitorService,
    private readonly prisma: PrismaService,
  ) {}

  @Roles("admin", "supervisor")
  @Get("stock-bajo")
  stockBajo() {
    return this.monitor.listarBajo();
  }

  @Roles("admin", "supervisor")
  @Post("check")
  check(@Body() dto: CheckDto) {
    return this.monitor.checkAll(Boolean(dto.force));
  }

  @Roles("admin", "supervisor")
  @Post("notify")
  notify() {
    return this.monitor.checkAll(true);
  }

  @Roles("admin", "supervisor")
  @Get("estado")
  async estado() {
    const canales = this.monitor.canalesConfigurados();
    const stateRow = await this.prisma.monitorState.findUnique({ where: { id: 1 } });
    const state = (stateRow?.state as { lastCheck?: string }) ?? {};
    return {
      canales,
      configurados: {
        email: canales.includes("email"),
        telegram: canales.includes("telegram"),
        callmebot: canales.includes("callmebot"),
      },
      ultimaVerificacion: state.lastCheck ?? null,
      enAlerta: (await this.monitor.listarBajo()).length,
    };
  }

  @Roles("admin")
  @HttpCode(200)
  @Post("notificar-prueba")
  prueba() {
    return this.monitor.enviarPrueba();
  }

  @Roles("admin", "supervisor")
  @Get("eventos")
  eventos() {
    return this.prisma.notificationEvent.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
    });
  }
}