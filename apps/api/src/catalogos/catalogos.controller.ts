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
} from "@nestjs/common";
import { IsBoolean, IsNotEmpty, IsOptional, IsString } from "class-validator";
import { PrismaService } from "../prisma/prisma.service";

class CategoriaDto {
  @IsString()
  @IsNotEmpty()
  nombre!: string;
}

class EmpaqueDto {
  @IsString()
  @IsNotEmpty()
  nombre!: string;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}

class AtributoDto {
  @IsString()
  @IsNotEmpty()
  nombre!: string;
}

class ValorDto {
  @IsString()
  @IsNotEmpty()
  valor!: string;
}

@Controller("catalogos")
export class CatalogosController {
  constructor(private prisma: PrismaService) {}

  // --- Categorías ---
  @Get("categorias")
  async categorias() {
    const rows = await this.prisma.category.findMany({
      orderBy: { nombre: "asc" },
      include: { _count: { select: { products: true } } },
    });
    return rows.map((r) => ({ ...r, productos: r._count.products, _count: undefined }));
  }

  @Post("categorias")
  async crearCategoria(@Body() dto: CategoriaDto) {
    const clean = dto.nombre.trim();
    return this.prisma.category.upsert({
      where: { nombre: clean },
      update: {},
      create: { nombre: clean },
    });
  }

  @Patch("categorias/:id")
  async editarCategoria(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: CategoriaDto,
  ) {
    return this.prisma.category.update({ where: { id }, data: { nombre: dto.nombre.trim() } });
  }

  @Delete("categorias/:id")
  @HttpCode(204)
  async borrarCategoria(@Param("id", ParseIntPipe) id: number) {
    await this.prisma.category.delete({ where: { id } });
  }

  // --- Empaques ---
  @Get("empaques")
  async empaques() {
    return this.prisma.packaging.findMany({ orderBy: { nombre: "asc" } });
  }

  @Post("empaques")
  async crearEmpaque(@Body() dto: EmpaqueDto) {
    return this.prisma.packaging.create({ data: { nombre: dto.nombre.trim() } });
  }

  @Patch("empaques/:id")
  async editarEmpaque(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: EmpaqueDto,
  ) {
    return this.prisma.packaging.update({
      where: { id },
      data: { nombre: dto.nombre?.trim(), activo: dto.activo ?? undefined },
    });
  }

  // --- Atributos (ejes del grid) ---
  @Get("atributos")
  async atributos() {
    const rows = await this.prisma.attribute.findMany({
      orderBy: { nombre: "asc" },
      include: { values: { orderBy: { id: "asc" } } },
    });
    return rows.map((a) => ({ id: a.id, nombre: a.nombre, valores: a.values }));
  }

  @Post("atributos")
  async crearAtributo(@Body() dto: AtributoDto) {
    return this.prisma.attribute.create({ data: { nombre: dto.nombre.trim() } });
  }

  @Post("atributos/:id/valores")
  async agregarValor(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: ValorDto,
  ) {
    return this.prisma.attributeValue.upsert({
      where: { attributeId_valor: { attributeId: id, valor: dto.valor.trim() } },
      update: {},
      create: { attributeId: id, valor: dto.valor.trim() },
    });
  }
}