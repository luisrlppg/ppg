import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { IsIn, IsInt, IsNumber, Min } from "class-validator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { FabricacionService } from "./fabricacion.service";

class ProduccionDto {
  @IsInt() variantId!: number;
  @IsNumber() @Min(0.0001) cantidad!: number;
}

class PrioridadDto {
  @IsIn(["alta", "media", "baja"]) prioridad!: "alta" | "media" | "baja";
}

@Controller("fabricacion")
@UseGuards(JwtAuthGuard, RolesGuard)
export class FabricacionController {
  constructor(private readonly fabricacion: FabricacionService) {}

  @Roles("admin", "operador")
  @Get("necesidades")
  necesidades() {
    return this.fabricacion.necesidades();
  }

  @Roles("admin", "operador")
  @Get("faltantes")
  faltantes() {
    return this.fabricacion.faltantes();
  }

  @Roles("admin", "operador")
  @Post("produccion")
  registrarProduccion(@Body() dto: ProduccionDto, @Req() req: { user: { id: number } }) {
    return this.fabricacion.registrarProduccion(
      { variantId: dto.variantId, cantidad: dto.cantidad },
      req.user.id,
    );
  }

  @Roles("admin")
  @Patch("variantes/:variantId/prioridad")
  setPrioridad(@Param("variantId", ParseIntPipe) variantId: number, @Body() dto: PrioridadDto) {
    return this.fabricacion.setPrioridad(variantId, dto.prioridad);
  }
}
