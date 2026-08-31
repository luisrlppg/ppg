import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { Type } from "class-transformer";
import { IsArray, IsNotEmpty, IsNumber, IsOptional, IsString, ValidateNested } from "class-validator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { VentasService } from "./ventas.service";

class LineaVentaDto {
  @IsNumber() variantId!: number;
  @IsNumber() cantidad!: number;
  @IsOptional() @IsNumber() precioUnitario?: number;
  @IsOptional() configuracion?: Record<string, unknown>;
}

class CrearVentaDto {
  @IsOptional() @IsNumber() partnerId?: number;
  @IsOptional() @IsString() fecha?: string;
  @IsOptional() @IsString() fechaEntregaDeseada?: string;
  @IsOptional() @IsString() notas?: string;
  @IsOptional() @IsString() origen?: string;
  @IsOptional() @IsString() nombreEnvio?: string;
  @IsOptional() @IsString() telefonoEnvio?: string;
  @IsOptional() @IsString() emailEnvio?: string;
  @IsArray() @IsNotEmpty() @ValidateNested({ each: true }) @Type(() => LineaVentaDto) lines!: LineaVentaDto[];
}

class EditarVentaDto {
  @IsOptional() @IsNumber() partnerId?: number;
  @IsOptional() @IsString() fecha?: string;
  @IsOptional() @IsString() fechaEntregaDeseada?: string | null;
  @IsOptional() @IsString() notas?: string;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => LineaVentaDto) lines?: LineaVentaDto[];
}

class DespacharDto {
  @IsNumber() cantidad!: number;
  @IsOptional() @IsNumber() locationId?: number;
}

@Controller("ventas")
@UseGuards(JwtAuthGuard, RolesGuard)
export class VentasController {
  constructor(private readonly ventas: VentasService) {}

  @Roles("admin", "supervisor", "operador")
  @Get()
  list(@Query("search") search?: string, @Query("estado") estado?: string, @Query("origen") origen?: string) {
    return this.ventas.list({ search, estado, origen });
  }

  @Roles("admin", "supervisor", "operador")
  @Get(":id")
  get(@Param("id", ParseIntPipe) id: number) {
    return this.ventas.get(id);
  }

  @Roles("admin", "supervisor")
  @Post()
  create(@Body() dto: CrearVentaDto, @Req() req: { user: { id: number } }) {
    return this.ventas.create({ ...dto, lines: dto.lines.map((l) => ({ ...l, cantidad: Number(l.cantidad) })) }, req.user.id);
  }

  @Roles("admin", "supervisor")
  @Patch(":id")
  update(@Param("id", ParseIntPipe) id: number, @Body() dto: EditarVentaDto) {
    return this.ventas.update(id, {
      ...dto,
      lines: dto.lines
        ? dto.lines.map((l) => ({ variantId: l.variantId, cantidad: Number(l.cantidad), precioUnitario: l.precioUnitario }))
        : undefined,
    });
  }

  @Roles("admin", "supervisor")
  @Post(":id/confirmar")
  confirmar(@Param("id", ParseIntPipe) id: number, @Req() req: { user: { id: number } }) {
    return this.ventas.confirmar(id, req.user.id);
  }

  @Roles("admin", "supervisor")
  @Post(":id/lineas/:lineaId/despachar")
  despachar(
    @Param("id", ParseIntPipe) id: number,
    @Param("lineaId", ParseIntPipe) lineaId: number,
    @Body() dto: DespacharDto,
    @Req() req: { user: { id: number } },
  ) {
    return this.ventas.despacharLinea(id, lineaId, { cantidad: Number(dto.cantidad), locationId: dto.locationId, userId: req.user.id });
  }

  @Roles("admin", "supervisor")
  @Post(":id/cancelar")
  cancelar(@Param("id", ParseIntPipe) id: number, @Req() req: { user: { id: number } }) {
    return this.ventas.cancelar(id, req.user.id);
  }
}