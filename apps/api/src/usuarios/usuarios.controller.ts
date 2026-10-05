import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { IsBoolean, IsNotEmpty, IsOptional, IsString, MinLength } from "class-validator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { UsuariosService } from "./usuarios.service";

class CrearUsuarioDto {
  @IsString() @IsNotEmpty() username!: string;
  @IsString() @IsNotEmpty() nombre!: string;
  @IsString() @MinLength(4) password!: string;
  @IsString() @IsNotEmpty() role!: string;
}

class EditarUsuarioDto {
  @IsOptional() @IsString() nombre?: string;
  @IsOptional() @IsString() role?: string;
  @IsOptional() @IsBoolean() active?: boolean;
}

class PasswordDto {
  @IsString() @MinLength(4) password!: string;
}

@Controller("usuarios")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("admin")
export class UsuariosController {
  constructor(private readonly usuarios: UsuariosService) {}

  @Get()
  list() {
    return this.usuarios.list();
  }

  @Post()
  create(@Body() dto: CrearUsuarioDto) {
    return this.usuarios.create(dto);
  }

  @Patch(":id")
  update(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: EditarUsuarioDto,
    @Req() req: { user: { id: number } },
  ) {
    return this.usuarios.update(id, dto, req.user.id);
  }

  @Patch(":id/password")
  setPassword(@Param("id", ParseIntPipe) id: number, @Body() dto: PasswordDto) {
    return this.usuarios.setPassword(id, dto.password);
  }
}
