import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { CostosController } from "./costos.controller";
import { CostosService } from "./costos.service";
import { CostosCalc } from "./costos.calc";

@Module({
  imports: [AuthModule],
  controllers: [CostosController],
  providers: [CostosService, CostosCalc],
})
export class CostosModule {}
