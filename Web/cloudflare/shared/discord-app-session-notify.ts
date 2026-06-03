type D1PreparedStatement = {
  bind: (...args: unknown[]) => D1PreparedStatement;
  first: <T>() => Promise<T | null>;
  all: <T>() => Promise<{ results?: T[] }>;
  run: () => Promise<unknown>;
};
type D1Database = { prepare: (sql: string) => D1PreparedStatement };
type ExecutionContext = { waitUntil: (promise: Promise<unknown>) => void };

const MAX_APP_ID_LEN = 96;
const MAX_GUEST_ID_LEN = 128;

/** Human labels for Discord session-start posts (unique per app). */
export const APP_SESSION_LABELS: Record<string, string> = {
  root_farms: "Root Units Idle Farmer",
  rootrecord_weather_manager_android: "Weather Manager (Android)",
  rootrecord_weather_manager_web: "Weather Manager (Web)",
  rootrecord_business_manager_android: "Business Manager (Android)",
  rootrecord_business_manager_web: "Business Manager (Web)",
  rootrecord_token_manager_android: "Token Manager (Android)",
  rootrecord_token_manager_web: "Token Manager (Web)",
  rootrecord_account_hub_android: "Account Hub (Android)",
  rootrecord_account_hub_web: "Account Hub (Web)",
  rootrecord_kilauea_alerts_android: "Kīlauea Alerts (Android)",
  rootrecord_kilauea_alerts_web: "Kīlauea Alerts (Web)",
  rootrecord_portal: "RootRecord portal",
  root_farms_android: "Root Units Idle Farmer (Android)",
};

const APP_SESSION_LINKS: Record<string, string> = {
  rootrecord_kilauea_alerts_android: "https://play.google.com/store/apps/details?id=com.rootrecord.kilauea",
};

function appLabel(appId: string): string {
  const id = appId.trim();
  return APP_SESSION_LABELS[id] || id.replace(/_/g, " ");
}

function validAppId(s: string): boolean {
  return s.length >= 2 && s.length <= MAX_APP_ID_LEN && /^[a-z][a-z0-9_.-]*$/i.test(s);
}

function isDiscordWebhookUrl(url: string): boolean {
  return /(?:discord\.com|discordapp\.com)\/api\/webhooks\//i.test(url.trim());
}

async function postDiscordWebhook(webhookUrl: string, markdownBody: string): Promise<void> {
  const url = webhookUrl.trim();
  if (!url || !isDiscordWebhookUrl(url)) return;
  const max = 1900;
  let s = markdownBody.replace(/\r\n/g, "\n");
  const chunks: string[] = [];
  while (s.length > 0) {
    if (s.length <= max) {
      chunks.push(s);
      break;
    }
    let cut = s.lastIndexOf("\n", max);
    if (cut < 200) cut = max;
    chunks.push(s.slice(0, cut).trimEnd());
    s = s.slice(cut).trimStart();
  }
  for (const chunk of chunks) {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: chunk }),
    });
    if (!r.ok) break;
  }
}

export function parseAppIdFromAuthRequest(
  request: Request,
  body?: Record<string, unknown> | null,
): string {
  const fromBody = String(body?.app_id || body?.appId || "").trim().slice(0, MAX_APP_ID_LEN);
  if (validAppId(fromBody)) return fromBody;
  const fromHeader = String(
    request.headers.get("X-RR-App-Id") || request.headers.get("x-rr-app-id") || "",
  )
    .trim()
    .slice(0, MAX_APP_ID_LEN);
  if (validAppId(fromHeader)) return fromHeader;
  return "rootrecord_portal";
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

async function resolveIdentityForAccount(
  db: D1Database,
  accountId: string,
  email: string,
  guestId: string,
  betaTester: boolean,
): Promise<string[]> {
  const lines: string[] = [];
  const emailLower = email.trim().toLowerCase();
  if (emailLower) lines.push(`**RootRecord account:** \`${emailLower}\``);

  const discord = await db
    .prepare(
      "SELECT discord_user_id, discord_username, discord_global_name FROM discord_account_links WHERE account_id = ?",
    )
    .bind(accountId)
    .first<{
      discord_user_id: string;
      discord_username: string | null;
      discord_global_name: string | null;
    }>();
  if (discord?.discord_user_id) {
    lines.push(`**Discord (linked):** ${discordTagFromRow(discord)}`);
  } else {
    lines.push("**Discord:** not linked");
  }

  const lw = await db
    .prepare("SELECT pubkey, verified_at FROM solana_linked_wallets WHERE account_id = ?")
    .bind(accountId)
    .first<{ pubkey: string; verified_at: string | null }>();
  if (lw?.pubkey) {
    const v = lw.verified_at ? "verified" : "unverified";
    lines.push(`**Linked Solana wallet (${v}):** \`${lw.pubkey}\``);
  }

  const cw = await db
    .prepare("SELECT pubkey AS cpk FROM internal_solana_wallets WHERE account_id = ?")
    .bind(accountId)
    .first<{ cpk: string }>();
  if (cw?.cpk) lines.push(`**RootRecord Wallet (custodial):** \`${cw.cpk}\``);

  if (betaTester) {
    lines.push(`**Mode:** Beta Tester (no rootrecord.info sign-in — progress not saved to your account)`);
    if (guestId) {
      lines.push(`**Session device id:** \`${guestId.slice(0, 36)}\`${guestId.length > 36 ? "…" : ""}`);
    }
  } else if (guestId) {
    lines.push(`**Device id:** \`${guestId.slice(0, 36)}\`${guestId.length > 36 ? "…" : ""}`);
  }
  return lines;
}

function sessionMarkdown(params: { appId: string; mode: string; identityLines: string[] }): string {
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
    (APP_SESSION_LINKS[params.appId] ? `**App link:** ${APP_SESSION_LINKS[params.appId]}\n` : "") +
    params.identityLines.join("\n")
  );
}

export type AppSessionDiscordEnv = {
  DB: D1Database;
  DISCORD_APP_SESSION_WEBHOOK_URL?: string;
};

export async function notifyDiscordAppSessionForAccount(
  env: AppSessionDiscordEnv,
  params: {
    accountId: string;
    email: string;
    appId: string;
    mode: "signed_in" | "beta_tester" | "anonymous";
    guestId?: string;
  },
): Promise<boolean> {
  const webhook = String(env.DISCORD_APP_SESSION_WEBHOOK_URL || "").trim();
  if (!webhook || !isDiscordWebhookUrl(webhook)) return false;

  const appId = validAppId(params.appId) ? params.appId : "rootrecord_portal";
  const betaTester = params.mode === "beta_tester";
  const identityLines = await resolveIdentityForAccount(
    env.DB,
    params.accountId.trim(),
    params.email,
    String(params.guestId || "").trim(),
    betaTester,
  );
  await postDiscordWebhook(webhook, sessionMarkdown({ appId, mode: params.mode, identityLines }));
  return true;
}

export function scheduleDiscordAppSessionForAccount(
  ctx: ExecutionContext | undefined,
  env: AppSessionDiscordEnv,
  params: {
    accountId: string;
    email: string;
    appId: string;
    mode: "signed_in" | "beta_tester" | "anonymous";
    guestId?: string;
  },
): void {
  const p = notifyDiscordAppSessionForAccount(env, params).catch((e) => {
    const msg = String(e && typeof e === "object" && "message" in e ? (e as Error).message : e);
    console.error(JSON.stringify({ msg: "app_session_discord_notify_failed", error: msg.slice(0, 300) }));
  });
  if (ctx) ctx.waitUntil(p);
}

export async function notifyDiscordGuestAppSession(
  env: AppSessionDiscordEnv,
  params: {
    appId: string;
    mode: "beta_tester" | "anonymous";
    guestId?: string;
  },
): Promise<boolean> {
  const webhook = String(env.DISCORD_APP_SESSION_WEBHOOK_URL || "").trim();
  if (!webhook || !isDiscordWebhookUrl(webhook)) return false;
  const appId = validAppId(params.appId) ? params.appId : "rootrecord_portal";
  const guestId = String(params.guestId || "").trim();
  const lines: string[] = [];
  if (params.mode === "beta_tester") {
    lines.push(`**Mode:** Beta Tester (no rootrecord.info sign-in — progress not saved to your account)`);
  }
  if (guestId) lines.push(`**Guest device id:** \`${guestId.slice(0, 36)}\`${guestId.length > 36 ? "…" : ""}`);
  await postDiscordWebhook(webhook, sessionMarkdown({ appId, mode: params.mode, identityLines: lines }));
  return true;
}

/** Call after successful auth login/signup on any API Worker shard. */
export function scheduleAuthLoginDiscordSessionNotify(
  ctx: ExecutionContext | undefined,
  env: AppSessionDiscordEnv,
  request: Request,
  creds: Record<string, unknown>,
  authPayload: Record<string, unknown>,
  deviceId: string | null,
): void {
  const accountId = String(authPayload.account_id || "").trim();
  const email = String(authPayload.email || creds.email || "")
    .trim()
    .toLowerCase();
  if (!accountId || !email) return;
  scheduleDiscordAppSessionForAccount(ctx, env, {
    accountId,
    email,
    appId: parseAppIdFromAuthRequest(request, creds),
    mode: "signed_in",
    guestId: deviceId || undefined,
  });
}
