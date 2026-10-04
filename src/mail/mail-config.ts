import { createTransport, type Transporter } from "nodemailer";
import { ImapFlow } from "imapflow";

export type MailConnectionSettings = {
  provider: "qq" | "custom";
  address: string;
  authCode: string;
  enabled: boolean;
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
};

export function readMailConnectionSettings(): MailConnectionSettings {
  const provider = process.env.MAIL_PROVIDER === "custom" ? "custom" : "qq";
  const legacyQq = process.env.QQ_MAIL_ADDRESS ?? "";
  return {
    provider,
    address: process.env.MAIL_ADDRESS ?? legacyQq,
    authCode: process.env.MAIL_AUTH_CODE ?? process.env.QQ_MAIL_AUTH_CODE ?? "",
    enabled: (process.env.MAIL_ENABLED ?? process.env.QQ_MAIL_ENABLED)?.toLowerCase() === "true",
    imapHost: process.env.MAIL_IMAP_HOST ?? (provider === "qq" ? "imap.qq.com" : ""),
    imapPort: readPort(process.env.MAIL_IMAP_PORT, 993),
    imapSecure: readBoolean(process.env.MAIL_IMAP_SECURE, true),
    smtpHost: process.env.MAIL_SMTP_HOST ?? (provider === "qq" ? "smtp.qq.com" : ""),
    smtpPort: readPort(process.env.MAIL_SMTP_PORT, 465),
    smtpSecure: readBoolean(process.env.MAIL_SMTP_SECURE, true),
  };
}

export function createImapClient(settings: MailConnectionSettings) {
  return new ImapFlow({
    host: settings.imapHost,
    port: settings.imapPort,
    secure: settings.imapSecure,
    auth: { user: settings.address.trim(), pass: settings.authCode.trim() },
    logger: false,
  });
}

export function createSmtpTransport(settings: MailConnectionSettings): Transporter {
  return createTransport({
    host: settings.smtpHost,
    port: settings.smtpPort,
    secure: settings.smtpSecure,
    auth: { user: settings.address.trim(), pass: settings.authCode.trim() },
  });
}

function readPort(value: string | undefined, fallback: number): number {
  const port = Number(value);
  return Number.isInteger(port) && port >= 1 && port <= 65535 ? port : fallback;
}

function readBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return value.toLowerCase() === "true";
}
