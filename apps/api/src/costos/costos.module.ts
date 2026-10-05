import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { CostosController } from "./costos.controller";
import { CostosService } from "./costos.service";

@Module({
  imports: [AuthModule],
  controllers: [CostosController],
  providers: [CostosService],
})
export class CostosModule {}
