import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AuthService } from "../auth.service";

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private auth: AuthService,
    private config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
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