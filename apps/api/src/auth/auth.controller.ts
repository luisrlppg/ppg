import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { IsNotEmpty, IsString } from "class-validator";
import type { Request, Response } from "express";
import { type PublicUser } from "@ppg/shared";
import { AuthService } from "./auth.service";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";

class LoginDto {
  @IsString()
  @IsNotEmpty()
  username!: string;

  @IsString()
  @IsNotEmpty()
  password!: string;
}

function parseDuration(value: string): number {
  const m = /^(\d+)([smhd])$/.exec(value);
  if (!m) return 12 * 3600 * 1000;
  const n = Number(m[1]);
  const mult: Record<string, number> = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  return n * mult[m[2]];
}

@Controller("auth")
export class AuthController {
  constructor(
    private auth: AuthService,
    private config: ConfigService,
  ) {}

  private cookieName(): string {
    return this.config.get<string>("COOKIE_NAME", "ppg_session");
  }

  @Post("login")
  @HttpCode(200)
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const user = await this.auth.validate(dto.username, dto.password);
    if (!user) throw new UnauthorizedException("Usuario o contraseña incorrectos");

    const authUser = {
      id: user.id,
      username: user.username,
      nombre: user.nombre,
      active: user.active,
      role: user.role.name as "admin" | "supervisor" | "operador",
    };
    const token = this.auth.sign({
      id: authUser.id,
      username: authUser.username,
      role: authUser.role,
    });
    const maxAge = parseDuration(this.config.get<string>("JWT_EXPIRES_IN", "12h"));

    res.cookie(this.cookieName(), token, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge,
    });

    return { user: this.auth.toPublic(authUser) as PublicUser };
  }

  @Post("logout")
  @HttpCode(200)
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie(this.cookieName(), { path: "/" });
    return { ok: true };
  }

  @Get("me")
  @UseGuards(JwtAuthGuard)
  me(@Req() req: Request) {
    return { user: this.auth.toPublic((req as any).user) };
  }
}