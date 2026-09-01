import { Body, Controller, Get, Param, ParseIntPipe, Post } from "@nestjs/common";
import { Type } from "class-transformer";
import { IsArray, IsNotEmpty, IsNumber, IsOptional, IsString, ValidateNested } from "class-validator";
import { PublicService } from "./public.service";

class LineaPublicDto {
  @IsNumber() variantId!: number;
  @IsNumber() cantidad!: number;
  @IsOptional() @IsString() configuracion?: string;
}

class CrearPedidoDto {
  @IsOptional() @IsString() nombre?: string;
  @IsOptional() @IsString() telefono?: string;
  @IsOptional() @IsString() email?: string;
  @IsArray() @IsNotEmpty() @ValidateNested({ each: true }) @Type(() => LineaPublicDto) lines!: LineaPublicDto[];
}

@Controller("public")
export class PublicController {
  constructor(private readonly publicService: PublicService) {}

  @Get("productos")
  productosPublicos() {
    return this.publicService.productosPublicos();
  }

  @Get("productos/:id/pasos")
  getPasos(@Param("id", ParseIntPipe) id: number) {
    return this.publicService.getPasos(id);
  }

  @Post("orders")
  crearPedido(@Body() dto: CrearPedidoDto) {
    return this.publicService.crearPedido({
      ...dto,
      lines: dto.lines.map((l) => ({
        variantId: l.variantId,
        cantidad: Number(l.cantidad),
        configuracion: l.configuracion,
      })),
    });
  }

  @Get("orders/:numero")
  consultarPedido(@Param("numero") numero: string) {
    return this.publicService.consultarPedido(numero);
  }

  @Get("catalog")
  catalogo() {
    return this.publicService.catalogo();
  }
}