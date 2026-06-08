import type { D1Database } from "@cloudflare/workers-types";

import { json } from "./cors";
import {
  profileByAccountId,
  publicStatsPageUrl,
  requireSignedInAccount,
  rootstatLinkByMinecraftUuid,
  sharedWorldsForAccount,
  str,
  record,
} from "./realm-lib";
import type { AuthEnv } from "./primary-auth";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LEN = 6;
const CODE_TTL_MS = 15 * 60 * 1000;
const VERIFY_BASE = "https://rootrecord.info/realm/verify";

export interface RootStatEnv extends AuthEnv {
  DB: D1Database;
  SITE_URL?: string;
  ROOTSTAT_DEV_SERVER_ID?: string;
  ROOTSTAT_DEV_SERVER_SECRET?: string;
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, "0")).join("");
}

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeMinecraftUuid(raw: string): string | null {
  const uuid = str(raw).toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(uuid)) {
    return null;
  }
  return uuid;
}

const MCMMO_SKILL_KEYS = [
  "mining",
  "woodcutting",
  "repair",
  "unarmed",
  "herbalism",
  "excavation",
  "archery",
  "swords",
  "axes",
  "acrobatics",
  "taming",
  "fishing",
  "alchemy",
  "crossbows",
  "tridents",
  "maces",
  "spears",
] as const;

export function parseMcmmoRow(row: Record<string, unknown>): Record<string, unknown> {
  let skills: Record<string, number> = {};
  try {
    const parsed = JSON.parse(str(row.skills_json) || "{}");
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      skills = parsed as Record<string, number>;
    }
  } catch {
    skills = {};
  }

  return {
    server_id: str(row.server_id) || null,
    power_level: Number(row.power_level) || 0,
    skills,
    synced_at: row.synced_at || null,
    updated_at: row.updated_at || null,
    minecraft_username: row.minecraft_username || null,
  };
}

export async function playtimeStatsForPlayer(
  db: D1Database,
  serverId: string,
  uuid: string,
): Promise<Record<string, unknown> | null> {
  const row = await db
    .prepare(
      `SELECT server_id, minecraft_uuid, minecraft_username, total_playtime_seconds,
              first_join_at, last_login_at, synced_at, updated_at
       FROM rootstat_player_playtime
       WHERE server_id = ? AND minecraft_uuid = ?
       LIMIT 1`,
    )
    .bind(serverId, uuid)
    .first<Record<string, unknown>>();

  if (!row) return null;

  return {
    server_id: str(row.server_id) || null,
    total_playtime_seconds: Number(row.total_playtime_seconds) || 0,
    first_join_at: row.first_join_at || null,
    last_login_at: row.last_login_at || null,
    synced_at: row.synced_at || null,
    updated_at: row.updated_at || null,
    minecraft_username: row.minecraft_username || null,
  };
}

export async function mcmmoStatsForPlayer(
  db: D1Database,
  serverId: string,
  uuid: string,
): Promise<Record<string, unknown> | null> {
  const row = await db
    .prepare(
      `SELECT server_id, minecraft_uuid, minecraft_username, power_level, skills_json, synced_at, updated_at
       FROM rootstat_mcmmo_stats
       WHERE server_id = ? AND minecraft_uuid = ?
       LIMIT 1`,
    )
    .bind(serverId, uuid)
    .first<Record<string, unknown>>();

  if (!row) return null;
  return parseMcmmoRow(row);
}

export async function mcmmoStatsAllServersForUuid(
  db: D1Database,
  uuid: string,
): Promise<Record<string, unknown>[]> {
  const { results } = await db
    .prepare(
      `SELECT server_id, minecraft_uuid, minecraft_username, power_level, skills_json, synced_at, updated_at
       FROM rootstat_mcmmo_stats
       WHERE minecraft_uuid = ?
       ORDER BY updated_at DESC`,
    )
    .bind(uuid)
    .all<Record<string, unknown>>();

  return (results || []).map(parseMcmmoRow);
}

async function buildPublicStats(
  db: D1Database,
  uuid: string,
  serverId?: string | null,
): Promise<Record<string, unknown>> {
  const statsUrl = publicStatsPageUrl(uuid);
  const mcmmoServers = await mcmmoStatsAllServersForUuid(db, uuid);
  const mcmmo = serverId ? await mcmmoStatsForPlayer(db, serverId, uuid) : null;
  const link = await rootstatLinkByMinecraftUuid(db, uuid);
  if (!link) {
    return {
      minecraft_uuid: uuid,
      verified: false,
      stats_url: statsUrl,
      minecraft_username: mcmmo?.minecraft_username || mcmmoServers[0]?.minecraft_username || null,
      avatar_url: `https://crafatar.com/avatars/${uuid.replace(/-/g, "")}?overlay&size=128`,
      mcmmo,
      mcmmo_servers: mcmmoServers,
    };
  }

  const username = str(link.minecraft_username);
  const accountId = str(link.account_id);
  const profile = accountId ? await profileByAccountId(db, accountId) : null;
  const publicProfile = profile ? Number(profile.public_profile) !== 0 : true;
  const worlds =
    profile && publicProfile && accountId ? await sharedWorldsForAccount(db, accountId) : [];

  return {
    minecraft_uuid: str(link.minecraft_uuid) || uuid,
    minecraft_username: username || null,
    verified: true,
    verified_at: link.verified_at || null,
    updated_at: link.updated_at || null,
    stats_url: statsUrl,
    avatar_url: `https://crafatar.com/avatars/${uuid.replace(/-/g, "")}?overlay&size=128`,
    realm_username: profile?.realm_username || null,
    bio: publicProfile ? profile?.bio || null : null,
    shared_worlds: publicProfile ? worlds : [],
    profile_public: publicProfile,
    mcmmo,
    mcmmo_servers: mcmmoServers,
  };
}

function randomCode(): string {
  const bytes = new Uint8Array(CODE_LEN);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < CODE_LEN; i++) {
    out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return out;
}

function randomServerId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function randomServerSecret(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function serverHeaders(request: Request): { serverId: string; serverSecret: string } {
  return {
    serverId: str(request.headers.get("X-RootStat-Server-Id")),
    serverSecret: str(request.headers.get("X-RootStat-Server-Secret")),
  };
}

export async function validateServerAuth(
  env: RootStatEnv,
  request: Request,
): Promise<{ serverId: string } | Response> {
  const { serverId, serverSecret } = serverHeaders(request);
  if (!serverId || !serverSecret) {
    return json({ detail: "Missing X-RootStat-Server-Id or X-RootStat-Server-Secret." }, 401);
  }

  const devId = str(env.ROOTSTAT_DEV_SERVER_ID);
  const devSecret = str(env.ROOTSTAT_DEV_SERVER_SECRET);
  if (devId && devSecret && serverId === devId && serverSecret === devSecret) {
    return { serverId };
  }

  const row = await env.DB.prepare(
    "SELECT server_secret_hash FROM rootstat_servers WHERE server_id = ? LIMIT 1",
  )
    .bind(serverId)
    .first<{ server_secret_hash: string }>();

  if (!row?.server_secret_hash) {
    return json({ detail: "Unknown server. Register at rootrecord.info/realm/servers." }, 403);
  }

  const hash = await sha256Hex(serverSecret);
  if (hash !== row.server_secret_hash) {
    return json({ detail: "Invalid server secret." }, 403);
  }

  return { serverId };
}

async function upsertGlobalLink(
  db: D1Database,
  uuid: string,
  username: string,
  accountId: string,
  email: string,
): Promise<void> {
  const now = nowIso();
  await db
    .prepare(
      `INSERT INTO rootstat_minecraft_links
         (minecraft_uuid, minecraft_username, account_id, email, verified_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(minecraft_uuid) DO UPDATE SET
         minecraft_username = excluded.minecraft_username,
         account_id = excluded.account_id,
         email = excluded.email,
         verified_at = excluded.verified_at,
         updated_at = excluded.updated_at`,
    )
    .bind(uuid, username, accountId, email, now, now)
    .run();

  const profile = await db
    .prepare("SELECT account_id FROM blocknotes_player_profiles WHERE account_id = ? LIMIT 1")
    .bind(accountId)
    .first<{ account_id: string }>();

  if (profile) {
    await db
      .prepare(
        `UPDATE blocknotes_player_profiles
         SET minecraft_uuid = ?, minecraft_username = ?, updated_at = ?
         WHERE account_id = ?`,
      )
      .bind(uuid, username, now, accountId)
      .run();
  } else {
    await db
      .prepare(
        `INSERT INTO blocknotes_player_profiles
           (account_id, realm_username, minecraft_username, minecraft_uuid, skin_url, bio, public_profile, created_at, updated_at)
         VALUES (?, NULL, ?, ?, NULL, NULL, 1, ?, ?)`,
      )
      .bind(accountId, username, uuid, now, now)
      .run();
  }
}

export async function handleRootStatMinecraft(
  request: Request,
  env: RootStatEnv,
  subpath: string,
  method: string,
): Promise<Response | null> {
  if (!subpath.startsWith("/realm/minecraft")) return null;
  const rest = subpath.slice("/realm/minecraft".length) || "/";

  if (method === "GET" && rest.startsWith("/stats/")) {
    const pathPart = rest.slice("/stats/".length);
    const qIdx = pathPart.indexOf("?");
    const uuidRaw = qIdx >= 0 ? pathPart.slice(0, qIdx) : pathPart.split("/")[0];
    const uuid = normalizeMinecraftUuid(uuidRaw);
    if (!uuid) return json({ detail: "Valid minecraft uuid required." }, 400);
    const url = new URL(request.url);
    const serverId = str(url.searchParams.get("server_id")) || null;
    return json({ stats: await buildPublicStats(env.DB, uuid, serverId) });
  }

  if (method === "POST" && rest === "/server/register") {
    const auth = await requireSignedInAccount(request, env);
    if (auth instanceof Response) return auth;

    let body: { server_name?: string } = {};
    try {
      body = record(JSON.parse(await request.text()));
    } catch {
      return json({ detail: "Invalid JSON body." }, 400);
    }

    const serverId = randomServerId();
    const serverSecret = randomServerSecret();
    const serverName = str(body.server_name) || "Minecraft server";
    const now = nowIso();
    const hash = await sha256Hex(serverSecret);

    await env.DB.prepare(
      `INSERT INTO rootstat_servers
         (server_id, server_name, server_secret_hash, owner_account_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
      .bind(serverId, serverName, hash, auth.accountId, now, now)
      .run();

    return json({
      server_id: serverId,
      server_secret: serverSecret,
      server_name: serverName,
      note: "Copy server_id and server_secret into RootStat config.yml — the secret is shown only once.",
    });
  }

  if (method === "GET" && rest === "/server/mine") {
    const auth = await requireSignedInAccount(request, env);
    if (auth instanceof Response) return auth;

    const { results } = await env.DB.prepare(
      `SELECT server_id, server_name, created_at, updated_at
       FROM rootstat_servers
       WHERE owner_account_id = ?
       ORDER BY created_at DESC`,
    )
      .bind(auth.accountId)
      .all<Record<string, unknown>>();

    return json({ servers: results || [] });
  }

  if (method === "POST" && rest === "/link/start") {
    const server = await validateServerAuth(env, request);
    if (server instanceof Response) return server;

    let body: { uuid?: string; username?: string } = {};
    try {
      body = record(JSON.parse(await request.text()));
    } catch {
      return json({ detail: "Invalid JSON body." }, 400);
    }

    const uuid = str(body.uuid).toLowerCase();
    const username = str(body.username);
    if (!uuid || !/^[0-9a-f-]{36}$/.test(uuid)) {
      return json({ detail: "Valid minecraft uuid required." }, 400);
    }
    if (!username || username.length > 16) {
      return json({ detail: "Valid minecraft username required." }, 400);
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + CODE_TTL_MS).toISOString();
    const createdAt = now.toISOString();

    let code = randomCode();
    for (let attempt = 0; attempt < 5; attempt++) {
      const existing = await env.DB.prepare(
        "SELECT code FROM rootstat_link_codes WHERE code = ? LIMIT 1",
      )
        .bind(code)
        .first();
      if (!existing) break;
      code = randomCode();
    }

    await env.DB.prepare(
      "DELETE FROM rootstat_link_codes WHERE minecraft_uuid = ? AND consumed_at IS NULL",
    )
      .bind(uuid)
      .run();

    await env.DB.prepare(
      `INSERT INTO rootstat_link_codes
         (code, minecraft_uuid, minecraft_username, server_id, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
      .bind(code, uuid, username, server.serverId, createdAt, expiresAt)
      .run();

    const verifyUrl = `${VERIFY_BASE}?code=${encodeURIComponent(code)}`;
    return json({
      code,
      verify_url: verifyUrl,
      expires_at: expiresAt,
      minecraft_username: username,
    });
  }

  if (method === "GET" && rest === "/link/preview") {
    const url = new URL(request.url);
    const code = str(url.searchParams.get("code")).toUpperCase();
    if (!code) return json({ detail: "code query param required." }, 400);

    const row = await env.DB.prepare(
      `SELECT code, minecraft_username, expires_at, consumed_at
       FROM rootstat_link_codes WHERE code = ? LIMIT 1`,
    )
      .bind(code)
      .first<Record<string, unknown>>();

    if (!row) return json({ valid: false, reason: "not_found" });
    if (row.consumed_at) return json({ valid: false, reason: "consumed" });
    if (String(row.expires_at) < nowIso()) return json({ valid: false, reason: "expired" });

    return json({
      valid: true,
      code: row.code,
      minecraft_username: row.minecraft_username,
      expires_at: row.expires_at,
    });
  }

  if (method === "POST" && rest === "/link/complete") {
    const auth = await requireSignedInAccount(request, env);
    if (auth instanceof Response) return auth;

    let body: { code?: string } = {};
    try {
      body = record(JSON.parse(await request.text()));
    } catch {
      return json({ detail: "Invalid JSON body." }, 400);
    }

    const code = str(body.code).toUpperCase();
    if (!code) return json({ detail: "Verification code required." }, 400);

    const row = await env.DB.prepare(
      `SELECT code, minecraft_uuid, minecraft_username, expires_at, consumed_at
       FROM rootstat_link_codes WHERE code = ? LIMIT 1`,
    )
      .bind(code)
      .first<Record<string, unknown>>();

    if (!row) return json({ detail: "Invalid code." }, 404);
    if (row.consumed_at) return json({ detail: "Code already used." }, 409);
    if (String(row.expires_at) < nowIso()) return json({ detail: "Code expired. Run /rootstat link in-game." }, 410);

    const uuid = str(row.minecraft_uuid);
    const username = str(row.minecraft_username);
    const consumedAt = nowIso();

    await upsertGlobalLink(env.DB, uuid, username, auth.accountId, auth.email);

    await env.DB.prepare(
      "UPDATE rootstat_link_codes SET consumed_at = ?, account_id = ? WHERE code = ?",
    )
      .bind(consumedAt, auth.accountId, code)
      .run();

    return json({
      ok: true,
      minecraft_uuid: uuid,
      minecraft_username: username,
      account_id: auth.accountId,
    });
  }

  if (method === "GET" && rest === "/link/status") {
    const server = await validateServerAuth(env, request);
    if (server instanceof Response) return server;

    const url = new URL(request.url);
    const uuid = str(url.searchParams.get("uuid")).toLowerCase();
    if (!uuid) return json({ detail: "uuid query param required." }, 400);

    const row = await env.DB.prepare(
      `SELECT minecraft_uuid, minecraft_username, account_id, email, verified_at, updated_at
       FROM rootstat_minecraft_links WHERE minecraft_uuid = ? LIMIT 1`,
    )
      .bind(uuid)
      .first<Record<string, unknown>>();

    if (!row) {
      return json({
        linked: false,
        minecraft_uuid: uuid,
        stats_url: publicStatsPageUrl(uuid),
      });
    }

    return json({
      linked: true,
      minecraft_uuid: row.minecraft_uuid,
      minecraft_username: row.minecraft_username,
      account_id: row.account_id,
      email: row.email,
      verified_at: row.verified_at,
      updated_at: row.updated_at,
      stats_url: publicStatsPageUrl(str(row.minecraft_uuid) || uuid),
    });
  }

  if (method === "GET" && rest === "/sync") {
    const server = await validateServerAuth(env, request);
    if (server instanceof Response) return server;

    const url = new URL(request.url);
    const since = str(url.searchParams.get("since"));

    let stmt;
    if (since) {
      stmt = env.DB.prepare(
        `SELECT minecraft_uuid, minecraft_username, account_id, email, verified_at, updated_at
         FROM rootstat_minecraft_links
         WHERE updated_at >= ?
         ORDER BY updated_at ASC`,
      ).bind(since);
    } else {
      stmt = env.DB.prepare(
        `SELECT minecraft_uuid, minecraft_username, account_id, email, verified_at, updated_at
         FROM rootstat_minecraft_links
         ORDER BY updated_at ASC`,
      );
    }

    const { results } = await stmt.all<Record<string, unknown>>();
    return json({
      players: results || [],
      synced_at: nowIso(),
      server_id: server.serverId,
    });
  }

  if (method === "POST" && rest === "/mcmmo/sync") {
    const server = await validateServerAuth(env, request);
    if (server instanceof Response) return server;

    let body: { players?: unknown[] } = {};
    try {
      body = record(JSON.parse(await request.text()));
    } catch {
      return json({ detail: "Invalid JSON body." }, 400);
    }

    const players = Array.isArray(body.players) ? body.players : [];
    const now = nowIso();
    let upserted = 0;

    for (const raw of players) {
      const row = record(raw);
      const uuid = normalizeMinecraftUuid(str(row.minecraft_uuid));
      if (!uuid) continue;

      const skillsIn = record(row.skills);
      const skills: Record<string, number> = {};
      for (const key of MCMMO_SKILL_KEYS) {
        const val = skillsIn[key];
        if (typeof val === "number" && Number.isFinite(val)) {
          skills[key] = Math.max(0, Math.floor(val));
        }
      }

      let powerLevel = Number(row.power_level);
      const hasMcmmo = Object.keys(skills).length > 0 || (Number.isFinite(powerLevel) && powerLevel > 0);
      if (hasMcmmo) {
        if (!Number.isFinite(powerLevel) || powerLevel <= 0) {
          powerLevel = Object.values(skills).reduce((sum, n) => sum + n, 0);
        }

        await env.DB.prepare(
          `INSERT INTO rootstat_mcmmo_stats
             (server_id, minecraft_uuid, minecraft_username, power_level, skills_json, synced_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(server_id, minecraft_uuid) DO UPDATE SET
             minecraft_username = excluded.minecraft_username,
             power_level = excluded.power_level,
             skills_json = excluded.skills_json,
             synced_at = excluded.synced_at,
             updated_at = excluded.updated_at`,
        )
          .bind(
            server.serverId,
            uuid,
            str(row.minecraft_username) || null,
            Math.floor(powerLevel),
            JSON.stringify(skills),
            str(row.synced_at) || now,
            now,
          )
          .run();
      }

      const playtimeSeconds = Number(row.playtime_seconds);
      const hasPlaytime =
        Number.isFinite(playtimeSeconds) ||
        str(row.first_join_at) ||
        str(row.last_login_at);
      if (hasPlaytime) {
        await env.DB.prepare(
          `INSERT INTO rootstat_player_playtime
             (server_id, minecraft_uuid, minecraft_username, total_playtime_seconds,
              first_join_at, last_login_at, synced_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(server_id, minecraft_uuid) DO UPDATE SET
             minecraft_username = excluded.minecraft_username,
             total_playtime_seconds = excluded.total_playtime_seconds,
             first_join_at = COALESCE(excluded.first_join_at, first_join_at),
             last_login_at = COALESCE(excluded.last_login_at, last_login_at),
             synced_at = excluded.synced_at,
             updated_at = excluded.updated_at`,
        )
          .bind(
            server.serverId,
            uuid,
            str(row.minecraft_username) || null,
            Number.isFinite(playtimeSeconds) ? Math.max(0, Math.floor(playtimeSeconds)) : 0,
            str(row.first_join_at) || null,
            str(row.last_login_at) || null,
            str(row.synced_at) || now,
            now,
          )
          .run();
      }

      if (hasMcmmo || hasPlaytime) {
        upserted++;
      }
    }

    await env.DB.prepare(
      `UPDATE rootstat_servers SET rootstat_last_seen_at = ?, updated_at = ? WHERE server_id = ?`,
    )
      .bind(now, now, server.serverId)
      .run();

    return json({ ok: true, upserted, synced_at: now, server_id: server.serverId });
  }

  if (method === "GET" && rest === "/me") {
    const auth = await requireSignedInAccount(request, env);
    if (auth instanceof Response) return auth;

    const { results } = await env.DB.prepare(
      `SELECT minecraft_uuid, minecraft_username, account_id, email, verified_at, updated_at
       FROM rootstat_minecraft_links
       WHERE account_id = ?
       ORDER BY verified_at DESC`,
    )
      .bind(auth.accountId)
      .all<Record<string, unknown>>();

    return json({ links: results || [] });
  }

  return json({ detail: "Not Found" }, 404);
}
