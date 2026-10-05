import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { MonitorModule } from "../monitor/monitor.module";
import { ProductosModule } from "../productos/productos.module";
import { FabricacionController } from "./fabricacion.controller";
import { FabricacionService } from "./fabricacion.service";
import { PlanificacionService } from "./planificacion.service";

@Module({
  imports: [AuthModule, ProductosModule, MonitorModule],
  controllers: [FabricacionController],
  providers: [FabricacionService, PlanificacionService],
  exports: [PlanificacionService],
})
export class FabricacionModule {}