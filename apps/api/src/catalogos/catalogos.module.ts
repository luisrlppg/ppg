import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { CatalogosController } from "./catalogos.controller";

@Module({
  imports: [AuthModule],
  controllers: [CatalogosController],
})
export class CatalogosModule {}