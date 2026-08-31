import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Prisma } from "@ppg/db";
import { PrismaService } from "../prisma/prisma.service";
import { Notificadores } from "./monitor.notificadores";



export interface LowVariant {
  variantId: number;
  sku: string;
  nombre: string;
  producto: string;
  uom: string;
  stockMin: number;
  stockMax: number;
  stockActual: number;
  longLead: boolean;
  deficit: number;
}

@Injectable()
export class MonitorService {
  private readonly logger = new Logger(MonitorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    this.notificadores = new Notificadores(this.configs, this.logger);
  }

  private readonly notificadores: Notificadores;

  private get configs() {
    return {
      email: {
        host: this.config.get("MONITOR_EMAIL_HOST"),
        port: Number(this.config.get("MONITOR_EMAIL_PORT") || 587),
        user: this.config.get("MONITOR_EMAIL_USER"),
        pass: this.config.get("MONITOR_EMAIL_PASS"),
        from: this.config.get("MONITOR_EMAIL_FROM"),
        to: this.config.get("MONITOR_EMAIL_TO"),
      },
      telegram: {
        token: this.config.get("MONITOR_TELEGRAM_TOKEN"),
        chatId: this.config.get("MONITOR_TELEGRAM_CHAT_ID"),
      },
      callmebot: {
        apikey: this.config.get("MONITOR_CALLMEBOT_APIKEY"),
        phone: this.config.get("MONITOR_CALLMEBOT_PHONE"),
      },
    };
  }

  canalesConfigurados(): string[] {
    const c = this.configs;
    const activos: string[] = [];
    if (c.email.host && c.email.to) activos.push("email");
    if (c.telegram.token && c.telegram.chatId) activos.push("telegram");
    if (c.callmebot.apikey && c.callmebot.phone) activos.push("callmebot");
    return activos;
  }

  // ------------------------------------------------------ Lectura (stock bajo)
  async listarBajo(): Promise<LowVariant[]> {
    const variants = await this.prisma.productVariant.findMany({
      where: { activo: true },
      include: {
        product: { select: { id: true, nombre: true, uom: true, activo: true } },
        stockLevels: true,
      },
    });
    const result: LowVariant[] = [];
    for (const v of variants) {
      if (!v.product.activo) continue;
      const stockMin = Number(v.stockMin);
      if (stockMin <= 0) continue;
      const stockActual = v.stockLevels.reduce((a, l) => a + Number(l.qty), 0);
      if (stockActual <= stockMin) {
        result.push({
          variantId: v.id,
          sku: v.sku,
          nombre: v.nombre,
          producto: v.product.nombre,
          uom: v.product.uom,
          stockMin,
          stockMax: Number(v.stockMax),
          stockActual,
          longLead: v.longLead,
          deficit: stockMin - stockActual,
        });
      }
    }
    result.sort((a, b) => b.deficit - a.deficit);
    return result;
  }

  // ---------------------------------------------------- Disparadores (sin timer)
  /**
   * Se llama inmediatamente después de cada movimiento de stock.
   * Si la variante quedó <= stock_min y es NUEVA en ese estado, notifica.
   */
  async afterStockChange(variantId: number): Promise<{ bajo: boolean; notificado: boolean; canales: string[] }> {
    const v = await this.prisma.productVariant.findUnique({
      where: { id: variantId },
      include: { product: true, stockLevels: true },
    });
    if (!v || !v.activo || !v.product.activo) return { bajo: false, notificado: false, canales: [] };
    const stockMin = Number(v.stockMin);
    if (stockMin <= 0) return { bajo: false, notificado: false, canales: [] };

    const stockActual = v.stockLevels.reduce((a, l) => a + Number(l.qty), 0);
    const defaultState = { lastLowStockIds: [] as number[], lastCheck: null as string | null };
    const stateRow = await this.prisma.monitorState.upsert({
      where: { id: 1 },
      update: {},
      create: { id: 1, state: defaultState },
    });
    const state = {
      ...defaultState,
      ...(stateRow.state as Prisma.JsonObject),
    } as { lastLowStockIds: number[]; lastCheck: string | null };

    const low = stockActual <= stockMin;
    const wasLow = state.lastLowStockIds.includes(variantId);
    let canales: string[] = [];

    if (low) {
      const nuevo = !wasLow;
      if (nuevo) {
        const lowData: LowVariant = {
          variantId: v.id,
          sku: v.sku,
          nombre: v.nombre,
          producto: v.product.nombre,
          uom: v.product.uom,
          stockMin,
          stockMax: Number(v.stockMax),
          stockActual,
          longLead: v.longLead,
          deficit: stockMin - stockActual,
        };
        canales = await this.enviarAlerta(lowData);
        state.lastLowStockIds = [...new Set([...state.lastLowStockIds, variantId])];
      }
    } else if (wasLow) {
      // Subió de nuevo: sale de la lista, volverá a avisar si vuelve a caer.
      state.lastLowStockIds = state.lastLowStockIds.filter((id) => id !== variantId);
    }

    state.lastCheck = new Date().toISOString();
    await this.prisma.monitorState.upsert({
      where: { id: 1 },
      update: { state },
      create: { id: 1, state },
    });
    return { bajo: low, notificado: low && !wasLow, canales };
  }

  /**
   * Verificación manual / forzada sobre todas las variantes.
   * force=true notifica todo lo bajo aunque ya esté en la lista.
   */
  async checkAll(force = false): Promise<{ totalBajo: number; notificados: number; canales: string[]; verificado: string }> {
    const bajo = await this.listarBajo();
    const stateRow = await this.prisma.monitorState.upsert({
      where: { id: 1 },
      update: {},
      create: { id: 1, state: { lastLowStockIds: [], lastCheck: null } },
    });
    const state = (stateRow.state as Prisma.JsonObject) as { lastLowStockIds: number[]; lastCheck: string | null };

    let notificados = 0;
    let canales: string[] = [];
    const msmIds = bajo.map((b) => b.variantId);
    for (const b of bajo) {
      if (force || !(state.lastLowStockIds ?? []).includes(b.variantId)) {
        canales = await this.enviarAlerta(b);
        notificados++;
      }
    }
    await this.prisma.monitorState.upsert({
      where: { id: 1 },
      update: { state: { lastLowStockIds: msmIds, lastCheck: new Date().toISOString() } },
      create: { id: 1, state: { lastLowStockIds: msmIds, lastCheck: new Date().toISOString() } },
    });
    return { totalBajo: bajo.length, notificados, canales, verificado: new Date().toISOString() };
  }

  // -------------------------------------------------------------- Notificaciones
  async enviarAlerta(v: LowVariant): Promise<string[]> {
    const crtitico = v.longLead ? " CRÍTICO" : "";
    const canal = v.longLead ? "🚨" : "⚠️";
    const lines = [
      `${canal} STOCK BAJO${crtitico} — PPG`,
      `Producto: ${v.producto}`,
      `Variante: ${v.nombre} (${v.sku})`,
      `Existencia: ${v.stockActual} ${v.uom}`,
      `Mínimo: ${v.stockMin} ${v.uom}`,
      v.longLead ? "Tipo de entrega largo: reponer YA" : "Requiere reponer",
    ];
    const subject = lines[0];
    const body = lines.join("\r\n");
    return this.enviar(subject, body);
  }

  async enviarPrueba(): Promise<string[]> {
    return this.enviar(
      "🔔 PRUEBA — PPG notificaciones",
      "Esto es una prueba de las notificaciones de PPG ERP.\r\nConfiguración correcta ✔",
    );
  }

  private async enviar(subject: string, body: string): Promise<string[]> {
    const canalesConfigurados = this.canalesConfigurados();
    const exitosos: string[] = [];
    if (canalesConfigurados.includes("telegram")) {
      if (await this.notificadores.sendTelegram(body)) exitosos.push("telegram");
    }
    if (canalesConfigurados.includes("callmebot")) {
      if (await this.notificadores.sendCallMeBot(body)) exitosos.push("callmebot");
    }
    if (canalesConfigurados.includes("email")) {
      if (await this.notificadores.sendEmail(subject, body)) exitosos.push("email");
    }
    await this.prisma.notificationEvent.create({
      data: {
        type: "stock",
        channels: exitosos,
        subject,
        ok: exitosos.length > 0,
      },
    });
    if (exitosos.length === 0) {
      this.logger.warn(`Notificación sin canal configurado: ${subject}`);
    }
    return exitosos;
  }
}
