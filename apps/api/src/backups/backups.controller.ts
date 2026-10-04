import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { IsOptional, IsString } from "class-validator";
import type { Response } from "express";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { BackupsService } from "./backups.service";

class CrearBackupDto {
  @IsOptional()
  @IsString()
  nombre?: string;
}

interface UploadedBackup {
  originalname: string;
  buffer: Buffer;
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("admin")
@Controller("backups")
export class BackupsController {
  constructor(private readonly backups: BackupsService) {}

  @Get()
  listar() {
    return this.backups.listar();
  }

  @Post()
  crear(@Body() dto: CrearBackupDto) {
    return this.backups.crear(dto.nombre);
  }

  @Post(":nombre/restaurar")
  restaurar(@Param("nombre") nombre: string) {
    return this.backups.restaurar(nombre);
  }

  @Post("subir")
  @UseInterceptors(FileInterceptor("archivo"))
  async subir(@UploadedFile() archivo: UploadedBackup | undefined) {
    if (!archivo) throw new BadRequestException("Falta el archivo (campo 'archivo')");
    return this.backups.guardarSubido(archivo.originalname, archivo.buffer);
  }

  @Get(":nombre/descargar")
  descargar(@Param("nombre") nombre: string, @Res() res: Response) {
    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("Content-Disposition", `attachment; filename="${nombre}"`);
    this.backups.stream(nombre).pipe(res);
  }

  @Delete(":nombre")
  eliminar(@Param("nombre") nombre: string) {
    return this.backups.eliminar(nombre);
  }
}
