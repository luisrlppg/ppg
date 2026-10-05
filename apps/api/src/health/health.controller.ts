import { Controller, Get } from "@nestjs/common";
import { Public } from "../auth/decorators/public.decorator";

@Public()
@Controller("health")
export class HealthController {
  @Get()
  health() {
    return { status: "ok", service: "ppg-api", time: new Date().toISOString() };
  }
}