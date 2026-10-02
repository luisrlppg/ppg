import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { MonitorModule } from "../monitor/monitor.module";
import { InventarioController } from "./inventario.controller";
import { InventarioService } from "./inventario.service";

@Module({
  imports: [AuthModule, MonitorModule],
  controllers: [InventarioController],
  providers: [InventarioService],
})
export class InventarioModule {}