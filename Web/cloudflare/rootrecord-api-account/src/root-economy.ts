import type { D1Database } from "@cloudflare/workers-types";
import { json } from "./cors";

export interface RootEconomyEnv {
  DB: D1Database;
}

export function shortenSolanaPubkey(pubkey: string): string {
  const s = String(pubkey || "").trim();
  if (!s) return "—";
  if (s.length <= 12) return s;
  return `${s.slice(0, 4)}…${s.slice(-4)}`;
}

function sanitizePublicDisplayName(raw: unknown): string | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  if (s.length > 32) return null;
  if (!/^[a-zA-Z0-9 _.-]+$/.test(s)) return null;
  return s;
}

export async function readPublicDisplayName(db: D1Database, accountId: string): Promise<string | null> {
  try {
    const row = await db
      .prepare("SELECT public_display_name FROM license_accounts WHERE id = ?")
      .bind(accountId)
      .first<{ public_display_name: string | null }>();
    const n = row?.public_display_name?.trim();
    return n || null;
  } catch {
    return null;
  }
}

/** PATCH `/v1/me/profile` — optional public display name for Root Economy. */
export async function handleMeProfilePatch(request: Request, env: RootEconomyEnv & { JWT_SECRET: string }): Promise<Response> {
  const { sessionFromRequest } = await import("./primary-auth");
  const sess = await sessionFromRequest(env, request);
  if (!sess) return json({ detail: "Unauthorized" }, 401);

  let body: { public_display_name?: unknown } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ detail: "Invalid JSON" }, 400);
  }

  if (!("public_display_name" in body)) {
    return json({ detail: "public_display_name is required (use empty string to clear)." }, 400);
  }

  const name = sanitizePublicDisplayName(body.public_display_name);
  if (body.public_display_name != null && String(body.public_display_name).trim() && !name) {
    return json(
      { detail: "Display name must be 1–32 characters: letters, numbers, spaces, underscore, hyphen, or period." },
      400,
    );
  }

  const now = new Date().toISOString();
  await env.DB.prepare("UPDATE license_accounts SET public_display_name = ?, updated_at = ? WHERE id = ?")
    .bind(name, now, sess.accountId)
    .run();

  return json({ ok: true, public_display_name: name });
}

type LeaderRow = {
  balance: number;
  wallet_pubkey: string;
  public_display_name: string | null;
  discord_username: string | null;
  discord_global_name: string | null;
};

export type EconomyLeaderEntry = {
  rank: number;
  balance: number;
  wallet_short: string;
  public_display_name: string | null;
  discord_username: string | null;
  discord_global_name: string | null;
};

export type EconomyLeaderboardData = {
  updated_at: string;
  total_circulation: number;
  entries: EconomyLeaderEntry[];
};

const LEADERBOARD_SQL = `SELECT b.balance AS balance,
              iw.pubkey AS wallet_pubkey,
              la.public_display_name AS public_display_name,
              dal.discord_username AS discord_username,
              dal.discord_global_name AS discord_global_name
       FROM rr_earn_balance b
       INNER JOIN license_accounts la ON b.user_id = ('user:' || lower(la.email))
       INNER JOIN internal_solana_wallets iw ON iw.account_id = la.id
       LEFT JOIN discord_account_links dal ON dal.account_id = la.id
       WHERE b.balance > 0
       ORDER BY b.balance DESC, iw.pubkey ASC
       LIMIT 100`;

const CIRCULATION_SQL = `SELECT COALESCE(SUM(b.balance), 0) AS total_circulation
       FROM rr_earn_balance b
       INNER JOIN license_accounts la ON b.user_id = ('user:' || lower(la.email))
       WHERE b.balance > 0`;

export function formatEconomyUnits(n: number): string {
  const v = Math.max(0, Math.floor(n));
  if (v >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(2)}B`;
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 10_000) return `${(v / 1_000).toFixed(1)}K`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(2)}K`;
  return v.toLocaleString();
}

export function leaderboardEntryLabel(e: EconomyLeaderEntry): string {
  if (e.public_display_name) return e.public_display_name;
  if (e.discord_global_name) return e.discord_global_name;
  if (e.discord_username) {
    const u = e.discord_username.replace(/^@/, "");
    return `@${u}`;
  }
  return e.wallet_short;
}

export async function loadEconomyLeaderboardData(db: D1Database): Promise<EconomyLeaderboardData> {
  const [rows, totalRow] = await Promise.all([
    db.prepare(LEADERBOARD_SQL).all<LeaderRow>(),
    db.prepare(CIRCULATION_SQL).first<{ total_circulation: number }>(),
  ]);

  const entries = (rows.results || []).map((r, i) => {
    const balance = Math.max(0, Math.floor(Number(r.balance) || 0));
    const wallet_pubkey = String(r.wallet_pubkey || "").trim();
    const public_display_name = r.public_display_name?.trim() || null;
    const discord_username = r.discord_username?.trim() || null;
    const discord_global_name = r.discord_global_name?.trim() || null;
    return {
      rank: i + 1,
      balance,
      wallet_short: shortenSolanaPubkey(wallet_pubkey),
      public_display_name,
      discord_username,
      discord_global_name,
    };
  });

  return {
    updated_at: new Date().toISOString(),
    total_circulation: Math.max(0, Math.floor(Number(totalRow?.total_circulation) || 0)),
    entries,
  };
}

export function buildEconomyDiscordMessage(data: EconomyLeaderboardData): string {
  const total = data.total_circulation;
  const lines: string[] = [
    "**Root Economy** — top Root Units balances",
    `**Internal circulation:** **${total.toLocaleString()}** RU (${formatEconomyUnits(total)} total in linked accounts)`,
    "",
  ];
  if (data.entries.length === 0) {
    lines.push("No balances yet.");
  } else {
    for (const e of data.entries.slice(0, 15)) {
      lines.push(`**${e.rank}.** ${leaderboardEntryLabel(e)} — **${formatEconomyUnits(e.balance)}**`);
    }
    if (data.entries.length > 15) {
      lines.push(`_Showing 15 of ${data.entries.length} on the board._`);
    }
  }
  lines.push("", "Full leaderboard: **https://farms.rootrecord.info/**");
  let content = lines.join("\n");
  if (content.length > 1950) content = `${content.slice(0, 1940)}…`;
  return content;
}

/** GET `/v1/economy/leaderboard` — public top-100 Root Units balances. */
export async function handleEconomyLeaderboard(env: RootEconomyEnv): Promise<Response> {
  const data = await loadEconomyLeaderboardData(env.DB);

  return json(
    {
      ok: true,
      updated_at: data.updated_at,
      total_circulation: data.total_circulation,
      count: data.entries.length,
      entries: data.entries,
    },
    200,
    { "Cache-Control": "public, max-age=15" },
  );
}

export async function handleRootEconomyRoutes(
  request: Request,
  env: RootEconomyEnv,
  sub: string,
  method: string,
): Promise<Response | null> {
  if (sub === "/v1/economy/leaderboard" && method === "GET") {
    return handleEconomyLeaderboard(env);
  }
  return null;
}
