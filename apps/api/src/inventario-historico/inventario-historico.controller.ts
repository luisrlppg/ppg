import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
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
import { InventarioHistoricoService } from "./inventario-historico.service";

class AtributoDto {
  @IsString() @IsNotEmpty() nombre!: string;
  @IsString() @IsNotEmpty() valor!: string;
}

class ItemDto {
  @IsString() @IsNotEmpty() nombre!: string;
  @IsOptional() @IsString() sku?: string;
  @IsOptional() @IsString() tipo?: string;
  @IsOptional() @IsNumber() @Min(0) cantidad?: number;
  @IsString() @IsNotEmpty() ubicacion!: string;
  @IsOptional() @IsString() notas?: string;
  @IsOptional() @IsInt() familiaProductoId?: number | null;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => AtributoDto) atributos?: AtributoDto[];
}

class UpdateItemDto {
  @IsOptional() @IsString() @IsNotEmpty() nombre?: string;
  @IsOptional() @IsString() sku?: string | null;
  @IsOptional() @IsString() tipo?: string;
  @IsOptional() @IsNumber() @Min(0) cantidad?: number;
  @IsOptional() @IsString() @IsNotEmpty() ubicacion?: string;
  @IsOptional() @IsString() notas?: string | null;
  @IsOptional() @IsInt() familiaProductoId?: number | null;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => AtributoDto) atributos?: AtributoDto[];
}

class ImportCsvDto {
  @IsString() @IsNotEmpty() csv!: string;
}

@Controller("inventario-historico")
@UseGuards(JwtAuthGuard, RolesGuard)
export class InventarioHistoricoController {
  constructor(private readonly service: InventarioHistoricoService) {}

  @Get()
  list(
    @Query("q") q?: string,
    @Query("tipo") tipo?: string,
    @Query("atributoNombre") atributoNombre?: string,
    @Query("atributoValor") atributoValor?: string,
  ) {
    return this.service.list({ q, tipo, atributoNombre, atributoValor });
  }

  @Get(":id")
  get(@Param("id", ParseIntPipe) id: number) {
    return this.service.get(id);
  }

  @Roles("admin")
  @Post()
  create(@Body() dto: ItemDto) {
    return this.service.create(dto);
  }

  @Roles("admin")
  @Patch(":id")
  update(@Param("id", ParseIntPipe) id: number, @Body() dto: UpdateItemDto) {
    return this.service.update(id, dto);
  }

  @Roles("admin")
  @Delete(":id")
  remove(@Param("id", ParseIntPipe) id: number) {
    return this.service.remove(id);
  }

  @Roles("admin")
  @Post("importar")
  importar(@Body() dto: ImportCsvDto) {
    return this.service.importar(dto.csv);
  }
}
