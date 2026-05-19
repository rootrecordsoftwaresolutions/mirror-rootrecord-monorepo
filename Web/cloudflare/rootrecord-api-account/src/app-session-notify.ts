import type { D1Database } from "@cloudflare/workers-types";
import { json } from "./cors";
import { extractAuthToken, sessionFromRequest, type AuthEnv } from "./primary-auth";
import { isDiscordWebhookUrl, notifySolanaToolsDiscord } from "./discord-solana-notify";

const MAX_APP_ID_LEN = 96;
const MAX_GUEST_ID_LEN = 128;

/** Human labels for Discord session-start posts (unique per app). */
export const APP_SESSION_LABELS: Record<string, string> = {
  root_farms: "Root Units Idle Farmer",
  rootrecord_weather_manager_android: "Weather Manager",
  rootrecord_business_manager_android: "Business Manager",
  rootrecord_token_manager_android: "Token Manager",
  rootrecord_account_hub_android: "Account Hub",
  rootrecord_kilauea_alerts_android: "Kīlauea Alerts",
};

function appLabel(appId: string): string {
  const id = appId.trim();
  return APP_SESSION_LABELS[id] || id.replace(/_/g, " ");
}

function validAppId(s: string): boolean {
  return s.length >= 2 && s.length <= MAX_APP_ID_LEN && /^[a-z][a-z0-9_.-]*$/i.test(s);
}

function guestIdFromRequest(request: Request): string {
  const h = String(request.headers.get("X-Guest-Id") || request.headers.get("x-guest-id") || "").trim();
  if (!h || h.length > MAX_GUEST_ID_LEN) return "";
  return h;
}

function discordTagFromRow(row: {
  discord_user_id: string;
  discord_username: string | null;
  discord_global_name: string | null;
}): string {
  const name = (row.discord_global_name || row.discord_username || "").trim();
  if (name) return `${name} (\`${row.discord_user_id}\`)`;
  return `\`${row.discord_user_id}\``;
}

async function resolveIdentity(
  env: { DB: D1Database },
  sess: { accountId: string; email: string } | null,
  guestId: string,
  betaTester: boolean,
): Promise<{ lines: string[] }> {
  const lines: string[] = [];
  if (sess) {
    lines.push(`**RootRecord account:** \`${sess.email}\``);
    const discord = await env.DB.prepare(
      "SELECT discord_user_id, discord_username, discord_global_name FROM discord_account_links WHERE account_id = ?",
    )
      .bind(sess.accountId)
      .first<{
        discord_user_id: string;
        discord_username: string | null;
        discord_global_name: string | null;
      }>();
    if (discord?.discord_user_id) {
      lines.push(`**Discord (linked):** ${discordTagFromRow(discord)}`);
    }
    const lw = await env.DB.prepare(
      "SELECT pubkey, verified_at FROM solana_linked_wallets WHERE account_id = ?",
    )
      .bind(sess.accountId)
      .first<{ pubkey: string; verified_at: string | null }>();
    if (lw?.pubkey) {
      const v = lw.verified_at ? "verified" : "unverified";
      lines.push(`**Linked Solana wallet (${v}):** \`${lw.pubkey}\``);
    }
    const cw = await env.DB.prepare(
      "SELECT pubkey AS cpk FROM custodial_sol_wallets WHERE account_id = ?",
    )
      .bind(sess.accountId)
      .first<{ cpk: string }>();
    if (cw?.cpk) {
      lines.push(`**RootRecord Wallet (custodial):** \`${cw.cpk}\``);
    }
    return { lines };
  }
  if (betaTester) {
    lines.push(`**Mode:** Beta Tester (no rootrecord.info sign-in — progress not saved to your account)`);
    if (guestId) lines.push(`**Session device id:** \`${guestId.slice(0, 36)}\`${guestId.length > 36 ? "…" : ""}`);
  } else if (guestId) {
    lines.push(`**Guest device id:** \`${guestId.slice(0, 36)}\`${guestId.length > 36 ? "…" : ""}`);
  }
  return { lines };
}

function sessionMarkdown(params: {
  appId: string;
  mode: string;
  identityLines: string[];
}): string {
  const label = appLabel(params.appId);
  const modeLabel =
    params.mode === "beta_tester"
      ? "Beta Tester session started"
      : params.mode === "signed_in"
        ? "Signed-in session started"
        : "Session started";
  return (
    `**${label}** — ${modeLabel}\n` +
    `**App id:** \`${params.appId}\`\n` +
    params.identityLines.join("\n")
  );
}

export type AppSessionNotifyEnv = AuthEnv & {
  DB: D1Database;
  /** Incoming webhook for app session starts (`wrangler secret put DISCORD_APP_SESSION_WEBHOOK_URL`). */
  DISCORD_APP_SESSION_WEBHOOK_URL?: string;
};

/**
 * POST /api/app-session/start — notify Discord when a client begins a play session.
 * Body: `{ app_id, mode?: "beta_tester" | "signed_in" }`. Optional Bearer; optional `X-Guest-Id`.
 */
export async function handleAppSessionStartRoute(
  request: Request,
  env: AppSessionNotifyEnv,
  sub: string,
  method: string,
): Promise<Response | null> {
  if (sub !== "/app-session/start" || method !== "POST") return null;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return json({ detail: "Invalid JSON." }, 400);
  }
  const b = raw as Record<string, unknown>;
  const appId = String(b.app_id || b.appId || "").trim().slice(0, MAX_APP_ID_LEN);
  if (!validAppId(appId)) {
    return json({ detail: "Invalid app_id." }, 400);
  }
  const modeRaw = String(b.mode || "").trim().toLowerCase();
  const guestId = guestIdFromRequest(request);
  const sess = await sessionFromRequest(env, request);
  const betaTester = modeRaw === "beta_tester" || (!sess && modeRaw !== "signed_in");
  const mode = sess ? "signed_in" : betaTester ? "beta_tester" : "anonymous";

  const webhook = String(env.DISCORD_APP_SESSION_WEBHOOK_URL || "").trim();
  if (!webhook || !isDiscordWebhookUrl(webhook)) {
    return json({ ok: true, notified: false }, 200);
  }

  const { lines } = await resolveIdentity(env, sess, guestId, betaTester);
  const md = sessionMarkdown({ appId, mode, identityLines: lines });
  await notifySolanaToolsDiscord(webhook, md);

  return json({ ok: true, notified: true }, 201);
}
