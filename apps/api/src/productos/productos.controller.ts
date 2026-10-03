import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { Type } from "class-transformer";
import { IsArray, IsBoolean, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, ValidateNested } from "class-validator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { ProductosService } from "./productos.service";

class CreateProductoDto {
  @IsString() @IsNotEmpty() nombre!: string;
  @IsString() @IsNotEmpty() skuBase!: string;
  @IsOptional() @IsNumber() categoryId?: number;
  @IsOptional() @IsString() uom?: string;
  @IsOptional() @IsNumber() basePrice?: number;
  @IsOptional() @IsBoolean() hasVariants?: boolean;
  @IsOptional() @IsString() imagen?: string;
}

class UpdateProductoDto {
  @IsOptional() @IsString() nombre?: string;
  @IsOptional() @IsNumber() categoryId?: number;
  @IsOptional() @IsString() uom?: string;
  @IsOptional() @IsNumber() basePrice?: number;
  @IsOptional() @IsBoolean() hasVariants?: boolean;
  @IsOptional() @IsString() imagen?: string;
  @IsOptional() @IsBoolean() activo?: boolean;
}

class EjeDto {
  @IsNumber() attributeId!: number;
  @IsOptional() @IsNumber() sortOrder?: number;
}

class ValoresPermitidosDto {
  @IsArray() @IsInt({ each: true }) valueIds!: number[];
}

class ComponenteDto {
  @IsNumber() componentId!: number;
  @IsNumber() cantidad!: number;
  @IsString() tipo!: string;
}

class VarianteDto {
  @IsString() @IsNotEmpty() nombre!: string;
  @IsString() @IsNotEmpty() sku!: string;
  @IsOptional() @IsNumber() price?: number | null;
}

class UpdateVarianteDto {
  @IsOptional() @IsString() nombre?: string;
  @IsOptional() @IsNumber() stockMin?: number;
  @IsOptional() @IsNumber() stockMax?: number;
  @IsOptional() @IsBoolean() longLead?: boolean;
  @IsOptional() @IsBoolean() published?: boolean;
  @IsOptional() @IsBoolean() activo?: boolean;
  @IsOptional() @IsString() imagen?: string;
  @IsOptional() @IsString() notas?: string | null;
}

class PackagingItem {
  @IsNumber() packagingId!: number;
  @IsNumber() cantidad!: number;
}

class VariantePackagingDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => PackagingItem) packagings!: PackagingItem[];
}

class MaterializarDto {
  @IsArray() @IsInt({ each: true }) valueIds!: number[];
}

class PrecioDto {
  @IsOptional() @IsNumber() price?: number | null;
}

class SetVarianteAtributoDto {
  @IsNumber() valueId!: number;
}

@Controller("productos")
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProductosController {
  constructor(private readonly productos: ProductosService) {}

  @Roles("admin", "supervisor", "operador")
  @Get()
  list(@Query("search") search?: string, @Query("categoria") categoria?: string) {
    return this.productos.list({
      search,
      categoria: categoria ? Number(categoria) : undefined,
    });
  }

  @Roles("admin", "supervisor", "operador")
  @Get("variantes")
  variantes(@Query("search") search?: string) {
    return this.productos.buscarVariantes({ search });
  }

  @Roles("admin", "supervisor", "operador")
  @Get(":id")
  get(@Param("id", ParseIntPipe) id: number) {
    return this.productos.get(id);
  }

  @Roles("admin", "supervisor")
  @Post()
  create(@Body() dto: CreateProductoDto) {
    return this.productos.create(dto);
  }

  @Roles("admin", "supervisor")
  @Patch(":id")
  update(@Param("id", ParseIntPipe) id: number, @Body() dto: UpdateProductoDto, @Req() req: { user: { id: number } }) {
    return this.productos.update(id, dto, req.user.id);
  }

  @Roles("admin")
  @HttpCode(204)
  @Delete(":id")
  deactivate(@Param("id", ParseIntPipe) id: number) {
    return this.productos.deactivate(id);
  }

  @Roles("admin")
  @Delete(":id/definitivo")
  eliminarProducto(@Param("id", ParseIntPipe) id: number) {
    return this.productos.eliminarProducto(id);
  }

  // ------------------------------------------------ Ejes del grid y BOM
  @Roles("admin", "supervisor")
  @Put(":id/ejes")
  ejes(@Param("id", ParseIntPipe) id: number, @Body() dto: { ejes: EjeDto[] }) {
    return this.productos.setEjes(id, dto.ejes);
  }

  @Roles("admin", "supervisor")
  @Put(":id/ejes/:attributeId/valores")
  valoresPermitidos(
    @Param("id", ParseIntPipe) id: number,
    @Param("attributeId", ParseIntPipe) attributeId: number,
    @Body() dto: ValoresPermitidosDto,
  ) {
    return this.productos.setValoresPermitidos(id, attributeId, dto.valueIds.map(Number));
  }

  @Roles("admin", "supervisor")
  @Put(":id/componentes")
  componentes(@Param("id", ParseIntPipe) id: number, @Body() dto: { componentes: ComponenteDto[] }) {
    return this.productos.setComponentes(id, dto.componentes);
  }

  // -------------------------------------------------- Grid / combos
  @Roles("admin", "supervisor", "operador")
  @Get(":id/grid")
  grid(@Param("id", ParseIntPipe) id: number) {
    return this.productos.grid(id);
  }

  @Roles("admin", "supervisor", "operador")
  @Get(":id/variantes")
  variantesDeProducto(@Param("id", ParseIntPipe) id: number) {
    return this.productos.variantesDeProducto(id);
  }

  @Roles("admin", "supervisor")
  @Post(":id/variantes")
  crearVariante(@Param("id", ParseIntPipe) id: number, @Body() dto: VarianteDto) {
    return this.productos.createVariant(id, dto);
  }

  @Roles("admin", "supervisor")
  @Post(":id/materializar")
  materializar(@Param("id", ParseIntPipe) id: number, @Body() dto: MaterializarDto) {
    return this.productos.materializar(id, dto.valueIds.map(Number));
  }

  // ------------------------------------------------------- Variante
  @Roles("admin", "supervisor")
  @Patch("variantes/:vid/precio")
  precio(@Param("vid", ParseIntPipe) vid: number, @Body() dto: PrecioDto, @Req() req: { user: { id: number } }) {
    return this.productos.setVariantPrice(vid, dto.price === null ? null : Number(dto.price), req.user.id);
  }

  @Roles("admin", "supervisor")
  @Patch("variantes/:vid")
  updateVariante(@Param("vid", ParseIntPipe) vid: number, @Body() dto: UpdateVarianteDto) {
    return this.productos.updateVariant(vid, dto);
  }

  @Roles("admin", "supervisor")
  @Delete("variantes/:vid")
  eliminarVariante(@Param("vid", ParseIntPipe) vid: number) {
    return this.productos.eliminarVariante(vid);
  }

  @Roles("admin", "supervisor")
  @Put("variantes/:vid/packagings")
  packagings(@Param("vid", ParseIntPipe) vid: number, @Body() dto: VariantePackagingDto) {
    return this.productos.setPackagings(vid, dto.packagings);
  }

  @Roles("admin", "supervisor")
  @Put("variantes/:vid/atributos/:attributeId")
  setAtributo(
    @Param("vid", ParseIntPipe) vid: number,
    @Param("attributeId", ParseIntPipe) attributeId: number,
    @Body() dto: SetVarianteAtributoDto,
  ) {
    return this.productos.setVariantAttribute(vid, attributeId, dto.valueId);
  }

  @Roles("admin", "supervisor")
  @HttpCode(204)
  @Delete("variantes/:vid/atributos/:attributeId")
  removeAtributo(@Param("vid", ParseIntPipe) vid: number, @Param("attributeId", ParseIntPipe) attributeId: number) {
    return this.productos.removeVariantAttribute(vid, attributeId);
  }
}