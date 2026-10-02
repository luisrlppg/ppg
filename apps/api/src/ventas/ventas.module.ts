import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { MonitorModule } from "../monitor/monitor.module";
import { FabricacionModule } from "../fabricacion/fabricacion.module";
import { VentasController } from "./ventas.controller";
import { VentasService } from "./ventas.service";

@Module({
  imports: [AuthModule, FabricacionModule, MonitorModule],
  controllers: [VentasController],
  providers: [VentasService],
  exports: [VentasService],
})
export class VentasModule {}