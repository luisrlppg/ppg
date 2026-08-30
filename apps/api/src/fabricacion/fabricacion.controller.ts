import { Controller, Get, Param, ParseIntPipe, Post, Query, Req, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { FabricacionService } from "./fabricacion.service";

@Controller("fabricacion")
@UseGuards(JwtAuthGuard, RolesGuard)
export class FabricacionController {
  constructor(private readonly fabricacion: FabricacionService) {}

  @Roles("admin", "supervisor", "operador")
  @Get()
  list(@Query("estado") estado?: string, @Query("tipo") tipo?: string, @Query("search") search?: string) {
    return this.fabricacion.list({ estado, tipo, search });
  }

  @Roles("admin", "supervisor", "operador")
  @Get("faltantes")
  faltantes() {
    return this.fabricacion.faltantes();
  }

  @Roles("admin", "supervisor", "operador")
  @Get(":id")
  get(@Param("id", ParseIntPipe) id: number) {
    return this.fabricacion.get(id);
  }

  @Roles("admin", "supervisor")
  @Post(":id/iniciar")
  iniciar(@Param("id", ParseIntPipe) id: number, @Req() req: { user: { id: number } }) {
    return this.fabricacion.iniciar(id, req.user.id);
  }

  @Roles("admin", "supervisor")
  @Post(":id/cancelar")
  cancelar(@Param("id", ParseIntPipe) id: number) {
    return this.fabricacion.cancelar(id);
  }
}