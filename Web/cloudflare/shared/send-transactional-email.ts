import type { SendEmail } from "@cloudflare/workers-types";

/** Worker env for outbound mail: Cloudflare Email Sending binding and/or Resend secrets. */
export type TransactionalEmailEnv = {
  EMAIL?: SendEmail;
  /** Default: `RootRecord <root@rootrecord.info>` (wrangler [vars] EMAIL_FROM). */
  EMAIL_FROM?: string;
  RESEND_API_KEY?: string;
  RESEND_FROM?: string;
};

const DEFAULT_FROM = "RootRecord <root@rootrecord.info>";

function resolveFrom(env: TransactionalEmailEnv): string {
  return (env.EMAIL_FROM || env.RESEND_FROM || "").trim() || DEFAULT_FROM;
}

function htmlToPlain(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Cloudflare Email Sending first; Resend when `RESEND_API_KEY` is set. */
export async function sendTransactionalEmail(
  env: TransactionalEmailEnv,
  to: string,
  subject: string,
  html: string,
  text?: string
): Promise<boolean> {
  const from = resolveFrom(env);
  const plain = (text ?? htmlToPlain(html)).trim() || subject;

  if (env.EMAIL) {
    try {
      await env.EMAIL.send({ from, to, subject, html, text: plain });
      return true;
    } catch (e) {
      const msg = String(e && typeof e === "object" && "message" in e ? (e as Error).message : e);
      console.error("EMAIL.send", msg);
    }
  }

  const key = (env.RESEND_API_KEY || "").trim();
  if (!key.startsWith("re_")) return false;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [to], subject, html }),
  });
  return res.ok;
}
