import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { PrismaModule } from "./prisma/prisma.module";
import { AuthModule } from "./auth/auth.module";
import { HealthModule } from "./health/health.module";
import { CatalogosModule } from "./catalogos/catalogos.module";
import { ProductosModule } from "./productos/productos.module";
import { InventarioModule } from "./inventario/inventario.module";
import { MonitorModule } from "./monitor/monitor.module";
import { ClientesModule } from "./clientes/clientes.module";
import { VentasModule } from "./ventas/ventas.module";
import { FabricacionModule } from "./fabricacion/fabricacion.module";
import { PublicModule } from "./public/public.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: [".env", "../../.env"] }),
    PrismaModule,
    AuthModule,
    HealthModule,
    CatalogosModule,
    ProductosModule,
    InventarioModule,
    MonitorModule,
    ClientesModule,
    VentasModule,
    FabricacionModule,
    PublicModule,
  ],
})
export class AppModule {}