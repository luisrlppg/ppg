import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { MonitorModule } from "../monitor/monitor.module";
import { PrismaModule } from "../prisma/prisma.module";
import { ReportesController } from "./reportes.controller";
import { ReportesService } from "./reportes.service";

@Module({
  imports: [AuthModule, PrismaModule, MonitorModule],
  controllers: [ReportesController],
  providers: [ReportesService],
})
export class ReportesModule {}