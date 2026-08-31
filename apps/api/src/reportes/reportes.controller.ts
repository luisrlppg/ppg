import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { Type } from "class-transformer";
import { ArrayMinSize, IsArray, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Min, ValidateNested } from "class-validator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { ReportesService } from "./reportes.service";

class LineaReporteDto {
  @IsInt() @Min(1) variantId!: number;
  @IsString() @IsNotEmpty() seccion!: string;
  @IsString() @IsNotEmpty() tipo!: string;
  @IsNumber() @Min(0.001) ok!: number;
}

class ReporteDto {
  @IsString() @IsNotEmpty() turno!: string;
  @IsOptional() @IsString() fecha?: string;
  @IsOptional() @IsInt() @Min(1) personas?: number;
  @IsOptional() @IsNumber() @Min(0.1) horasTrabajadas?: number;
  @IsOptional() @IsString() notas?: string;
  @IsOptional() @IsInt() @Min(1) manufacturingOrderId?: number;
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => LineaReporteDto) lines!: LineaReporteDto[];
}

class UbicarDto {
  @IsNumber() @Min(0.001) cantidad!: number;
  @IsInt() @Min(1) locationId!: number;
}

@Controller("reportes")
@UseGuards(JwtAuthGuard, RolesGuard)
export class ReportesController {
  constructor(private readonly reportes: ReportesService) {}

  @Roles("admin", "supervisor", "operador")
  @Get()
  list(
    @Query("search") search?: string,
    @Query("estado") estado?: string,
    @Query("turno") turno?: string,
    @Query("fecha") fecha?: string,
    @Query("of") of?: string,
  ) {
    return this.reportes.list({ search, estado, turno, fecha, of });
  }

  @Roles("admin", "supervisor")
  @Get("stats")
  stats(@Query("desde") desde?: string, @Query("hasta") hasta?: string) {
    return this.reportes.stats({ desde, hasta });
  }

  @Roles("admin", "supervisor")
  @Get("exportar")
  @Header("Content-Type", "text/csv; charset=utf-8")
  @Header("Content-Disposition", 'attachment; filename="reportes.csv"')
  async exportar(@Query("desde") desde?: string, @Query("hasta") hasta?: string) {
    return this.reportes.exportar({ desde, hasta });
  }

  @Roles("admin", "supervisor", "operador")
  @Get("ultimo")
  ultimo(@Query("turno") turno?: string) {
    return this.reportes.ultimo(turno);
  }

  @Roles("admin", "supervisor")
  @Get("lotes")
  lotes() {
    return this.reportes.lotes();
  }

  @Roles("admin", "supervisor", "operador")
  @Get(":id")
  get(@Param("id", ParseIntPipe) id: number) {
    return this.reportes.get(id);
  }

  @Roles("admin", "supervisor", "operador")
  @Post()
  crear(@Body() dto: ReporteDto, @Req() req: { user: { id: number } }) {
    return this.reportes.crear(
      { ...dto, lines: dto.lines.map((l) => ({ ...l, ok: Number(l.ok) })) },
      req.user.id,
    );
  }

  @Roles("admin", "supervisor")
  @Patch(":id")
  editar(@Param("id", ParseIntPipe) id: number, @Body() dto: ReporteDto, @Req() req: { user: { id: number } }) {
    return this.reportes.editar(
      id,
      { ...dto, lines: dto.lines.map((l) => ({ ...l, ok: Number(l.ok) })) },
      req.user.id,
    );
  }

  @Roles("admin", "supervisor")
  @Post(":id/aplicar")
  aplicar(@Param("id", ParseIntPipe) id: number, @Req() req: { user: { id: number } }) {
    return this.reportes.aplicar(id, req.user.id);
  }

  @Roles("admin", "supervisor")
  @Post(":id/cancelar")
  cancelar(@Param("id", ParseIntPipe) id: number) {
    return this.reportes.cancelar(id);
  }

  @Roles("admin", "supervisor")
  @Post("lotes/:lineaId/ubicar")
  ubicar(@Param("lineaId", ParseIntPipe) lineaId: number, @Body() dto: UbicarDto, @Req() req: { user: { id: number } }) {
    return this.reportes.ubicar(lineaId, { cantidad: Number(dto.cantidad), locationId: dto.locationId }, req.user.id);
  }
}