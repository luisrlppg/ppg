import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { FabricacionController } from "./fabricacion.controller";
import { FabricacionService } from "./fabricacion.service";

@Module({
  imports: [AuthModule],
  controllers: [FabricacionController],
  providers: [FabricacionService],
})
export class FabricacionModule {}