import { Logger } from "@nestjs/common";

export interface NotificadorConfig {
  email: { host?: string; port: number; user?: string; pass?: string; from?: string; to?: string };
  telegram: { token?: string; chatId?: string };
  callmebot: { apikey?: string; phone?: string };
}

export class Notificadores {
  private readonly logger: Logger;

  constructor(
    private readonly config: NotificadorConfig,
    logger: Logger,
  ) {
    this.logger = logger;
  }

  async sendTelegram(text: string): Promise<boolean> {
    const c = this.config.telegram;
    try {
      const res = await fetch(`https://api.telegram.org/bot${c.token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: c.chatId, text, disable_notification: false }),
      });
      const json = (await res.json()) as { ok: boolean };
      return json.ok;
    } catch (e) {
      this.logger.error("Telegram falló", e as Error);
      return false;
    }
  }

  async sendCallMeBot(text: string): Promise<boolean> {
    const c = this.config.callmebot;
    try {
      const res = await fetch("https://api.callmebot.com/whatsapp.php", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ phone: c.phone!, apikey: c.apikey!, text }),
      });
      const bodyText = await res.text();
      return bodyText.trim().toLowerCase().includes("message queued") || res.status === 200;
    } catch (e) {
      this.logger.error("CallMeBot falló", e as Error);
      return false;
    }
  }

  async sendEmail(subject: string, body: string): Promise<boolean> {
    const c = this.config.email;
    if (!c.host || !c.user) return false;
    try {
      // nodemailer se carga dinámicamente; si no está instalado se omite email.
      const nodemailer = await import("nodemailer");
      const transporter = nodemailer.createTransport({
        host: c.host,
        port: c.port,
        secure: c.port === 465,
        auth: { user: c.user, pass: c.pass },
        tls: { rejectUnauthorized: false },
      });
      await transporter.sendMail({
        from: c.from || c.user,
        to: c.to,
        subject,
        text: body,
      });
      return true;
    } catch (e) {
      this.logger.error("Email falló", e as Error);
      return false;
    }
  }
}
