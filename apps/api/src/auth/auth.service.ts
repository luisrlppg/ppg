import { Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import bcrypt from "bcryptjs";
import type { PublicUser, Role } from "@ppg/shared";
import { PrismaService } from "../prisma/prisma.service";

export interface JwtPayload {
  sub: number;
  username: string;
  role: string;
}

export interface AuthUser {
  id: number;
  username: string;
  nombre: string;
  active: boolean;
  role: Role;
}

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
  ) {}

  async validate(username: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { username },
      include: { role: true },
    });
    if (!user || !user.active) return null;
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return null;
    return user;
  }

  async findById(id: number): Promise<AuthUser | null> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { role: true },
    });
    if (!user) return null;
    return {
      id: user.id,
      username: user.username,
      nombre: user.nombre,
      active: user.active,
      role: user.role.name as Role,
    };
  }

  sign(user: { id: number; username: string; role: string }): string {
    const payload: JwtPayload = {
      sub: user.id,
      username: user.username,
      role: user.role,
    };
    return this.jwt.sign(payload);
  }

  async verify(token: string): Promise<JwtPayload | null> {
    try {
      return await this.jwt.verifyAsync<JwtPayload>(token);
    } catch {
      return null;
    }
  }

  toPublic(user: AuthUser): PublicUser {
    return {
      id: user.id,
      username: user.username,
      nombre: user.nombre,
      role: user.role,
    };
  }
}