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
  Res,
  UseGuards,
} from "@nestjs/common";
import { IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from "class-validator";
import { Response } from "express";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { InventarioService } from "./inventario.service";

class MovimientoDto {
  @IsInt() variantId!: number;
  @IsInt() locationId!: number;
  @IsString() @IsNotEmpty() motivo!: string;
  @IsNumber() cantidad!: number;
  @IsOptional() @IsString() ref?: string;
}

class AjusteDto {
  @IsInt() variantId!: number;
  @IsInt() locationId!: number;
  @IsNumber() @Min(0) nuevaCantidad!: number;
  @IsOptional() @IsString() ref?: string;
}

class MoverDto {
  @IsInt() variantId!: number;
  @IsInt() fromLocationId!: number;
  @IsInt() toLocationId!: number;
  @IsNumber() @Min(0.0001) cantidad!: number;
  @IsOptional() @IsString() ref?: string;
}

class UbicacionDto {
  @IsString() @IsNotEmpty() nombre!: string;
  @IsOptional() @IsString() tipo?: string;
}

class MinMaxDto {
  @IsOptional() @IsNumber() @Min(0) stockMin?: number;
  @IsOptional() @IsNumber() @Min(0) stockMax?: number;
}

@Controller("inventario")
@UseGuards(JwtAuthGuard, RolesGuard)
export class InventarioController {
  constructor(private readonly inventario: InventarioService) {}

  @Roles("admin", "operador")
  @Get("existencia")
  existencia() {
    return this.inventario.existencia();
  }

  @Roles("admin", "operador")
  @Get("existencia/:variantId")
  existenciaDe(@Param("variantId", ParseIntPipe) variantId: number) {
    return this.inventario.existenciaDe(variantId);
  }

  @Roles("admin", "operador")
  @Get("ubicaciones")
  ubicaciones() {
    return this.inventario.ubicaciones();
  }

  @Roles("admin")
  @Post("ubicaciones")
  crearUbicacion(@Body() dto: UbicacionDto) {
    return this.inventario.crearUbicacion(dto.nombre, dto.tipo ?? "almacen");
  }

  @Roles("admin")
  @Patch("ubicaciones/:id")
  editarUbicacion(@Param("id", ParseIntPipe) id: number, @Body() dto: Partial<UbicacionDto>) {
    return this.inventario.editarUbicacion(id, dto);
  }

  @Roles("admin", "operador")
  @Get("movimientos")
  movimientos(
    @Query("variantId") variantId?: string,
    @Query("limit") limit?: string,
  ) {
    return this.inventario.movimientos({
      variantId: variantId ? Number(variantId) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Roles("admin", "operador")
  @Post("movimiento")
  movimiento(@Body() dto: MovimientoDto, @Req() req: { user: { id: number } }) {
    return this.inventario.movimiento({
      variantId: dto.variantId,
      locationId: dto.locationId,
      motivo: dto.motivo as never,
      cantidad: Number(dto.cantidad),
      ref: dto.ref,
      userId: req.user.id,
    });
  }

  @Roles("admin", "operador")
  @Post("ajuste")
  ajuste(@Body() dto: AjusteDto, @Req() req: { user: { id: number } }) {
    return this.inventario.ajuste({
      variantId: dto.variantId,
      locationId: dto.locationId,
      nuevaCantidad: Number(dto.nuevaCantidad),
      ref: dto.ref,
      userId: req.user.id,
    });
  }

  @Roles("admin", "operador")
  @Post("mover")
  mover(@Body() dto: MoverDto, @Req() req: { user: { id: number } }) {
    return this.inventario.mover({
      variantId: dto.variantId,
      fromLocationId: dto.fromLocationId,
      toLocationId: dto.toLocationId,
      cantidad: dto.cantidad,
      ref: dto.ref,
      userId: req.user.id,
    });
  }

  @Roles("admin", "operador")
  @Patch("variantes/:variantId/minmax")
  setMinMax(@Param("variantId", ParseIntPipe) variantId: number, @Body() dto: MinMaxDto) {
    return this.inventario.setMinMax(variantId, dto);
  }

  @Roles("admin", "operador")
  @Get("exportar.csv")
  @Header("Content-Type", "text/csv; charset=utf-8")
  @Header("Content-Disposition", 'attachment; filename="stock.csv"')
  async exportar(@Res() res: Response) {
    res.send(await this.inventario.exportarCSV());
  }
}