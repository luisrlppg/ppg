import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Put,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { Type } from "class-transformer";
import {
  IsArray,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from "class-validator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { CostosService } from "./costos.service";

class MaterialDto {
  @IsString() @IsNotEmpty() nombre!: string;
  @IsNumber() @Min(0) cantidad!: number;
  @IsNumber() @Min(0) costoUnitario!: number;
  @IsOptional() @IsInt() orden?: number;
}

class UpsertCostoDto {
  @IsOptional() @IsNumber() costoCompra?: number | null;
  @IsOptional() @IsNumber() @Min(0) horasManoObra?: number;
  @IsOptional() @IsNumber() @Min(0) tarifaManoObra?: number;
  @IsOptional() @IsNumber() @Min(0) horasMaquina?: number;
  @IsOptional() @IsNumber() @Min(0) tarifaMaquina?: number;
  @IsOptional() @IsNumber() @Min(0) costoMolde?: number;
  @IsOptional() @IsNumber() @Min(0) piezasMolde?: number;
  @IsOptional() @IsNumber() @Min(0) costoEnsamble?: number;
  @IsOptional() @IsNumber() @Min(0) costoEmpaque?: number;
  @IsOptional() @IsString() notas?: string | null;
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MaterialDto)
  materiales?: MaterialDto[];
}

@Controller("costos")
@UseGuards(JwtAuthGuard, RolesGuard)
export class CostosController {
  constructor(private readonly costos: CostosService) {}

  @Roles("admin", "supervisor")
  @Get()
  list(@Query("search") search?: string) {
    return this.costos.list({ search });
  }

  @Roles("admin", "supervisor")
  @Get(":productId")
  get(@Param("productId", ParseIntPipe) productId: number) {
    return this.costos.get(productId);
  }

  @Roles("admin", "supervisor")
  @Put(":productId")
  upsert(
    @Param("productId", ParseIntPipe) productId: number,
    @Body() dto: UpsertCostoDto,
    @Req() req: { user: { id: number } },
  ) {
    return this.costos.upsert(productId, dto, req.user.id);
  }

  @Roles("admin", "supervisor")
  @Delete(":productId")
  remove(@Param("productId", ParseIntPipe) productId: number) {
    return this.costos.remove(productId);
  }
}
