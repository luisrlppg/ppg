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
  Query,
  UseGuards,
} from "@nestjs/common";
import { IsBoolean, IsNotEmpty, IsOptional, IsString } from "class-validator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { ClientesService } from "./clientes.service";

class ClienteDto {
  @IsString() @IsNotEmpty() nombre!: string;
  @IsOptional() @IsString() telefono?: string;
  @IsOptional() @IsString() direccion?: string;
  @IsOptional() @IsString() email?: string;
}

class UpdateClienteDto {
  @IsOptional() @IsString() nombre?: string;
  @IsOptional() @IsString() telefono?: string;
  @IsOptional() @IsString() direccion?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsBoolean() activo?: boolean;
}

class ImportCsvDto {
  @IsString() @IsNotEmpty() csv!: string;
}

@Controller("clientes")
@UseGuards(JwtAuthGuard, RolesGuard)
export class ClientesController {
  constructor(private readonly clientes: ClientesService) {}

  @Roles("admin", "supervisor", "operador")
  @Get()
  list(@Query("search") search?: string, @Query("todos") todos?: string) {
    return this.clientes.list({ search, incluirInactivos: todos === "1" });
  }

  @Roles("admin", "supervisor", "operador")
  @Get(":id")
  get(@Param("id", ParseIntPipe) id: number) {
    return this.clientes.get(id);
  }

  @Roles("admin", "supervisor")
  @Post()
  create(@Body() dto: ClienteDto) {
    return this.clientes.create(dto);
  }

  @Roles("admin", "supervisor")
  @Patch(":id")
  update(@Param("id", ParseIntPipe) id: number, @Body() dto: UpdateClienteDto) {
    return this.clientes.update(id, dto);
  }

  @Roles("admin")
  @HttpCode(204)
  @Delete(":id")
  deactivate(@Param("id", ParseIntPipe) id: number) {
    return this.clientes.deactivate(id);
  }

  @Roles("admin", "supervisor")
  @Post("importar")
  importar(@Body() dto: ImportCsvDto) {
    return this.clientes.importar(dto.csv);
  }
}