import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { Type } from "class-transformer";
import {
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from "class-validator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { CostosService } from "./costos.service";

const FUENTES = ["manual", "bom", "variante", "formula"];

class ValorCostoDto {
  @IsString() @IsNotEmpty() clave!: string;
  @IsOptional() @IsString() etiqueta?: string;
  @IsIn(FUENTES) fuente!: "manual" | "bom" | "variante" | "formula";
  @IsOptional() @IsNumber() valor?: number | null;
  @IsOptional() @IsObject() opciones?: Record<string, unknown>;
  @IsOptional() @IsInt() orden?: number;
}

class CostoDto {
  @IsOptional() @IsNumber() @Min(0) precioBase?: number;
  @IsOptional() @IsString() formula?: string | null;
  @IsOptional() @IsString() notas?: string | null;
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ValorCostoDto)
  valores?: ValorCostoDto[];
}

@Controller("costos")
@UseGuards(JwtAuthGuard, RolesGuard)
export class CostosController {
  constructor(private readonly costos: CostosService) {}

  @Roles("admin")
  @Get()
  list(@Query("search") search?: string) {
    return this.costos.list({ search });
  }

  @Roles("admin")
  @Get(":productId")
  get(@Param("productId", ParseIntPipe) productId: number) {
    return this.costos.get(productId);
  }

  @Roles("admin")
  @Post(":productId/preview")
  preview(@Param("productId", ParseIntPipe) productId: number, @Body() dto: CostoDto) {
    return this.costos.preview(productId, dto);
  }

  @Roles("admin")
  @Put(":productId")
  upsert(
    @Param("productId", ParseIntPipe) productId: number,
    @Body() dto: CostoDto,
    @Req() req: { user: { id: number } },
  ) {
    return this.costos.upsert(productId, dto, req.user.id);
  }

  @Roles("admin")
  @Delete(":productId")
  remove(@Param("productId", ParseIntPipe) productId: number) {
    return this.costos.remove(productId);
  }
}
