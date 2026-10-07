import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { InventarioHistoricoController } from "./inventario-historico.controller";
import { InventarioHistoricoService } from "./inventario-historico.service";

@Module({
  imports: [AuthModule],
  controllers: [InventarioHistoricoController],
  providers: [InventarioHistoricoService],
  exports: [InventarioHistoricoService],
})
export class InventarioHistoricoModule {}
