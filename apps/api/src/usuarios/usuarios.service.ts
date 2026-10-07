import { BadRequestException, ConflictException, Injectable, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import bcrypt from "bcryptjs";
import { timingSafeEqual } from "crypto";
import { ROLES, type Role } from "@ppg/shared";
import { PrismaService } from "../prisma/prisma.service";

const USER_SELECT = {
  id: true,
  username: true,
  nombre: true,
  active: true,
  separadorMiles: true,
  createdAt: true,
  role: { select: { name: true } },
} as const;

function validarRol(role: string): Role {
  if (!(ROLES as readonly string[]).includes(role)) {
    throw new BadRequestException(`Rol inválido: ${role}`);
  }
  return role as Role;
}

@Injectable()
export class UsuariosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async list() {
    const rows = await this.prisma.user.findMany({
      select: USER_SELECT,
      orderBy: [{ active: "desc" }, { nombre: "asc" }],
    });
    return rows.map((u) => ({ ...u, role: u.role.name as Role }));
  }

  async create(data: { username: string; nombre: string; password: string; role: string }) {
    const username = data.username.trim().toLowerCase();
    const nombre = data.nombre.trim();
    if (!username) throw new BadRequestException("El usuario es obligatorio");
    if (!nombre) throw new BadRequestException("El nombre es obligatorio");
    if (!data.password || data.password.length < 4) {
      throw new BadRequestException("La contraseña debe tener al menos 4 caracteres");
    }
    const role = validarRol(data.role);

    const exists = await this.prisma.user.findUnique({ where: { username } });
    if (exists) throw new ConflictException(`Ya existe el usuario "${username}"`);

    const user = await this.prisma.user.create({
      data: {
        username,
        nombre,
        passwordHash: await bcrypt.hash(data.password, 10),
        role: { connect: { name: role } },
      },
      select: USER_SELECT,
    });
    return { ...user, role: user.role.name as Role };
  }

  async update(
    id: number,
    data: { nombre?: string; role?: string; active?: boolean },
    currentUserId: number,
  ) {
    const user = await this.prisma.user.findUnique({ where: { id }, include: { role: true } });
    if (!user) throw new NotFoundException("Usuario no encontrado");

    if (id === currentUserId) {
      if (data.active === false) {
        throw new BadRequestException("No puedes desactivar tu propia cuenta");
      }
      if (data.role !== undefined && data.role !== "admin") {
        throw new BadRequestException("No puedes quitarte a ti mismo el rol admin");
      }
    }

    const role = data.role !== undefined ? validarRol(data.role) : undefined;
    const nombre = data.nombre !== undefined ? data.nombre.trim() : undefined;
    if (nombre !== undefined && !nombre) {
      throw new BadRequestException("El nombre es obligatorio");
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        ...(nombre !== undefined ? { nombre } : {}),
        ...(data.active !== undefined ? { active: data.active } : {}),
        ...(role !== undefined ? { role: { connect: { name: role } } } : {}),
      },
      select: USER_SELECT,
    });
    return { ...updated, role: updated.role.name as Role };
  }

  async setPassword(id: number, password: string) {
    if (!password || password.length < 4) {
      throw new BadRequestException("La contraseña debe tener al menos 4 caracteres");
    }
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException("Usuario no encontrado");

    await this.prisma.user.update({
      where: { id },
      data: { passwordHash: await bcrypt.hash(password, 10) },
    });
    return { ok: true };
  }

  /** Borrado duro, autorizado con el `SUPER_ADMIN_PASSWORD` del entorno. */
  async eliminar(id: number, superPassword: string, currentUserId: number) {
    const esperado = this.config.get<string>("SUPER_ADMIN_PASSWORD");
    if (!esperado) {
      throw new BadRequestException("La eliminación de usuarios no está habilitada (falta SUPER_ADMIN_PASSWORD).");
    }
    if (!this.passwordValida(superPassword, esperado)) {
      throw new UnauthorizedException("Super admin password incorrecto");
    }
    if (id === currentUserId) {
      throw new BadRequestException("No puedes eliminar tu propia cuenta");
    }

    const user = await this.prisma.user.findUnique({ where: { id }, include: { role: true } });
    if (!user) throw new NotFoundException("Usuario no encontrado");

    if (user.role.name === "admin") {
      const admins = await this.prisma.user.count({ where: { role: { name: "admin" } } });
      if (admins <= 1) throw new BadRequestException("No puedes eliminar el último administrador");
    }

    await this.prisma.user.delete({ where: { id } });
    return { ok: true };
  }

  private passwordValida(ingresado: string, esperado: string): boolean {
    const a = Buffer.from(ingresado ?? "");
    const b = Buffer.from(esperado);
    return a.length === b.length && timingSafeEqual(a, b);
  }
}
