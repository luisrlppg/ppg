import { Body, Controller, Get, Param, ParseIntPipe, Post, Query, Req, UseGuards } from "@nestjs/common";
import { IsIn, IsInt, IsNumber, IsOptional, IsString, Min } from "class-validator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { FabricacionService } from "./fabricacion.service";

class CrearOFDto {
  @IsInt() variantId!: number;
  @IsNumber() @Min(0.0001) cantidad!: number;
  @IsOptional() @IsString() notas?: string;
}

class ReponerDto {
  @IsIn(["minimo", "maximo"]) objetivo!: "minimo" | "maximo";
}

@Controller("fabricacion")
@UseGuards(JwtAuthGuard, RolesGuard)
export class FabricacionController {
  constructor(private readonly fabricacion: FabricacionService) {}

  @Roles("admin", "supervisor", "operador")
  @Get()
  list(
    @Query("estado") estado?: string,
    @Query("tipo") tipo?: string,
    @Query("origen") origen?: string,
    @Query("search") search?: string,
  ) {
    return this.fabricacion.list({ estado, tipo, origen, search });
  }

  @Roles("admin", "supervisor", "operador")
  @Get("reponer/preview")
  previewReponer(@Query("objetivo") objetivo?: string) {
    return this.fabricacion.previewReponer(objetivo === "maximo" ? "maximo" : "minimo");
  }

  @Roles("admin", "supervisor")
  @Post("reponer")
  reponer(@Body() dto: ReponerDto, @Req() req: { user: { id: number } }) {
    return this.fabricacion.reponer(dto.objetivo, req.user.id);
  }

  @Roles("admin", "supervisor")
  @Post()
  crearManual(@Body() dto: CrearOFDto, @Req() req: { user: { id: number } }) {
    return this.fabricacion.crearManual({ variantId: dto.variantId, cantidad: dto.cantidad, notas: dto.notas }, req.user.id);
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
  @Post(":id/concluir")
  concluir(@Param("id", ParseIntPipe) id: number, @Req() req: { user: { id: number } }) {
    return this.fabricacion.concluir(id, req.user.id);
  }

  @Roles("admin", "supervisor")
  @Post(":id/cancelar")
  cancelar(@Param("id", ParseIntPipe) id: number) {
    return this.fabricacion.cancelar(id);
  }
}