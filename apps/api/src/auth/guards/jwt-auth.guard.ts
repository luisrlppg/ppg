import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Reflector } from "@nestjs/core";
import { AuthService } from "../auth.service";
import { IS_PUBLIC_KEY } from "../decorators/public.decorator";

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private auth: AuthService,
    private config: ConfigService,
    private reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest();
    const cookieName = this.config.get<string>("COOKIE_NAME", "ppg_session");
    const token = req.cookies?.[cookieName];
    if (!token) throw new UnauthorizedException();

    const payload = await this.auth.verify(token);
    if (!payload) throw new UnauthorizedException();

    const user = await this.auth.findById(payload.sub);
    if (!user || !user.active) throw new UnauthorizedException();

    req.user = user;
    return true;
  }
}
