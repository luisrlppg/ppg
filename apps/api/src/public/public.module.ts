import { Module } from "@nestjs/common";
import { ProductosModule } from "../productos/productos.module";
import { PublicController } from "./public.controller";
import { PublicService } from "./public.service";

@Module({
  imports: [ProductosModule],
  controllers: [PublicController],
  providers: [PublicService],
})
export class PublicModule {}