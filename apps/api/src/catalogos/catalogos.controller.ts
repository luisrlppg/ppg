import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { IsArray, IsBoolean, IsNotEmpty, IsNumber, IsOptional, IsString } from "class-validator";
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

  @IsOptional()
  @IsArray()
  valores?: string[];
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

  // --- Atributos globales ---
  @Get("atributos")
  async atributos(@Query("search") search?: string) {
    const where = search
      ? { nombre: { contains: search, mode: "insensitive" as const } }
      : {};
    const rows = await this.prisma.attribute.findMany({
      where,
      orderBy: { nombre: "asc" },
      include: {
        values: { orderBy: { id: "asc" } },
        productLines: { select: { productId: true } },
      },
    });
    return rows.map((a) => ({
      id: a.id,
      nombre: a.nombre,
      valores: a.values,
      productIds: a.productLines.map((p) => p.productId),
    }));
  }

  @Post("atributos")
  async crearAtributo(@Body() dto: AtributoDto) {
    const nombre = dto.nombre.trim();

    const existing = await this.prisma.attribute.findUnique({ where: { nombre } });
    if (existing) {
      throw new BadRequestException(`Ya existe un atributo llamado "${nombre}"`);
    }

    const valores = (dto.valores || []).map((v) => v.trim()).filter(Boolean);

    return this.prisma.attribute.create({
      data: {
        nombre,
        values: {
          create: valores.map((valor) => ({ valor })),
        },
      },
      include: { values: true },
    });
  }

  @Patch("atributos/:id")
  async editarAtributo(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: { nombre?: string },
  ) {
    const attr = await this.prisma.attribute.findUnique({ where: { id } });
    if (!attr) throw new NotFoundException("Atributo no encontrado");

    if (dto.nombre) {
      const nombre = dto.nombre.trim();
      const conflict = await this.prisma.attribute.findFirst({
        where: { nombre, NOT: { id } },
      });
      if (conflict) {
        throw new BadRequestException(`Ya existe un atributo llamado "${nombre}"`);
      }
      return this.prisma.attribute.update({ where: { id }, data: { nombre } });
    }
    return attr;
  }

  @Delete("atributos/:id")
  @HttpCode(204)
  async eliminarAtributo(@Param("id", ParseIntPipe) id: number) {
    const inUse = await this.prisma.variantAttribute.count({
      where: { attributeId: id },
    });
    if (inUse > 0) {
      throw new BadRequestException(
        `No se puede eliminar. Este atributo está usado en ${inUse} variante(s) materializada(s).`,
      );
    }
    await this.prisma.attributeValue.deleteMany({ where: { attributeId: id } });
    await this.prisma.productAttributeLine.deleteMany({ where: { attributeId: id } });
    await this.prisma.attribute.delete({ where: { id } });
  }

  @Post("atributos/:id/valores")
  async agregarValor(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: ValorDto,
  ) {
    const attr = await this.prisma.attribute.findUnique({ where: { id } });
    if (!attr) throw new NotFoundException("Atributo no encontrado");

    const valor = dto.valor.trim();
    return this.prisma.attributeValue.upsert({
      where: { attributeId_valor: { attributeId: id, valor } },
      update: {},
      create: { attributeId: id, valor },
    });
  }

  @Delete("atributos/:id/valores/:valorId")
  @HttpCode(204)
  async eliminarValor(
    @Param("id", ParseIntPipe) id: number,
    @Param("valorId", ParseIntPipe) valorId: number,
  ) {
    const inUse = await this.prisma.variantAttribute.count({
      where: { valueId: valorId },
    });
    if (inUse > 0) {
      throw new BadRequestException(
        `No se puede eliminar. Este valor está usado en ${inUse} variante(s) materializada(s).`,
      );
    }
    await this.prisma.attributeValue.delete({ where: { id: valorId } });
  }

  // --- Atributos por producto (propios + heredados) ---
  @Get("atributos/producto/:productId")
  async atributosPorProducto(@Param("productId", ParseIntPipe) productId: number) {
    const prisma = this.prisma;

    // Propios: ProductAttributeLine directos al producto
    const propiosLines = await prisma.productAttributeLine.findMany({
      where: { productId },
      include: { attribute: { include: { values: { orderBy: { id: "asc" } } } } },
    });

    // Recolectar componentes del BOM recursivamente
    const componentAttributeIds = new Set<number>();

    async function collectComponentAttributes(pid: number, visited: Set<number> = new Set()) {
      if (visited.has(pid)) return;
      visited.add(pid);

      const components = await prisma.productComponent.findMany({
        where: { productId: pid },
        include: { component: { include: { attributeLines: true } } },
      });

      for (const c of components) {
        for (const line of c.component.attributeLines) {
          componentAttributeIds.add(line.attributeId);
        }
        await collectComponentAttributes(c.componentId, visited);
      }
    }

    await collectComponentAttributes(productId);

    // Heredados: atributos de componentes (que no sean propios ya)
    const propiosIds = new Set(propiosLines.map((l) => l.attributeId));
    const heredadoIds = [...componentAttributeIds].filter((id) => !propiosIds.has(id));

    const heredados = await prisma.attribute.findMany({
      where: { id: { in: heredadoIds } },
      include: { values: { orderBy: { id: "asc" } } },
    });

    return {
      propios: propiosLines.map((l) => ({
        id: l.attribute.id,
        nombre: l.attribute.nombre,
        valores: l.attribute.values,
      })),
      heredados: heredados.map((a) => ({
        id: a.id,
        nombre: a.nombre,
        valores: a.values,
      })),
    };
  }

  // --- Asignar/desasignar atributo a producto ---
  @Post("atributos/:id/asignar/:productoId")
  async asignarAtributo(
    @Param("id", ParseIntPipe) attributeId: number,
    @Param("productoId", ParseIntPipe) productoId: number,
  ) {
    const attr = await this.prisma.attribute.findUnique({ where: { id: attributeId } });
    if (!attr) throw new NotFoundException("Atributo no encontrado");

    const product = await this.prisma.product.findUnique({ where: { id: productoId } });
    if (!product) throw new NotFoundException("Producto no encontrado");

    const existing = await this.prisma.productAttributeLine.findUnique({
      where: { productId_attributeId: { productId: productoId, attributeId } },
    });
    if (existing) {
      throw new BadRequestException("Este atributo ya está asignado a este producto");
    }

    return this.prisma.productAttributeLine.create({
      data: { productId: productoId, attributeId },
    });
  }

  @Delete("atributos/:id/desasignar/:productoId")
  @HttpCode(204)
  async desasignarAtributo(
    @Param("id", ParseIntPipe) attributeId: number,
    @Param("productoId", ParseIntPipe) productoId: number,
  ) {
    await this.prisma.productAttributeLine.delete({
      where: { productId_attributeId: { productId: productoId, attributeId } },
    });
  }
}
