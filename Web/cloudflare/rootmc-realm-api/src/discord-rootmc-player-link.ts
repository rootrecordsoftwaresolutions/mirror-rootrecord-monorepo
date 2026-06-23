import type { D1Database } from "@cloudflare/workers-types";

import { json } from "./cors";
import {
  addGuildMemberRole,
  ensureGuildMember,
  findGuildRoleIdByName,
  patchGuildMemberNickname,
} from "./discord-rootmc-api";
import {
  consumeLinkCode,
  loadLinkCode,
  upsertGlobalMinecraftLink,
  validateLinkCodeRow,
} from "./rootmc-minecraft-link";
import { provisionMinecraftPlayerAccount } from "./rootmc-provision-account";
import type { AuthEnv } from "./primary-auth";

const OAUTH_STATE_TTL_MS = 15 * 60 * 1000;
const OAUTH_SCOPES = ["identify", "guilds.join"];

const DEFAULT_OAUTH_REDIRECT_URI = "https://api.rootmc.net/v1/discord/rootmc/oauth/callback";

export interface RootMcDiscordLinkEnv extends AuthEnv {
  DB: D1Database;
  SITE_URL?: string;
  DISCORD_ROOTMC_OAUTH_REDIRECT_URI?: string;
  DISCORD_ROOTMC_CLIENT_ID?: string;
  DISCORD_ROOTMC_CLIENT_SECRET?: string;
  DISCORD_ROOTMC_BOT_TOKEN?: string;
  DISCORD_ROOTMC_GUILD_ID?: string;
  DISCORD_ROOTMC_LINKED_ROLE_ID?: string;
  DISCORD_ROOTMC_MINECRAFT_SYNC_ROLE_ID?: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

function str(v: unknown): string {
  return v == null ? "" : String(v).trim();
}

function randState(): string {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function cleanBotToken(env: RootMcDiscordLinkEnv): string {
  return String(env.DISCORD_ROOTMC_BOT_TOKEN || "").replace(/^bot\s+/i, "").trim();
}

function verifyReturnUrl(site: string, query?: string): string {
  const root = String(site || "https://rootmc.net").trim().replace(/\/+$/, "");
  const base = `${root}/verify`;
  return query ? `${base}?${query}` : base;
}

function oauthCallbackUrl(env: RootMcDiscordLinkEnv): string {
  const explicit = str(env.DISCORD_ROOTMC_OAUTH_REDIRECT_URI);
  if (explicit) return explicit;
  return DEFAULT_OAUTH_REDIRECT_URI;
}

async function discordFormPost(url: string, body: URLSearchParams): Promise<Record<string, unknown> | null> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const j = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) return null;
  return j;
}

async function discordGetMe(accessToken: string): Promise<Record<string, unknown> | null> {
  const res = await fetch("https://discord.com/api/v10/users/@me", {
    headers: { Authorization: `Bearer ${accessToken.trim()}` },
  });
  const j = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) return null;
  return j;
}

async function saveDiscordLink(
  db: D1Database,
  acct: { id: string; email: string },
  discord: {
    discord_user_id: string;
    discord_username: string | null;
    discord_global_name: string | null;
    discord_email: string | null;
  },
): Promise<void> {
  const now = nowIso();
  await db
    .prepare(
      `INSERT INTO discord_account_links (
         account_id, email, discord_user_id, discord_username, discord_global_name, discord_email, linked_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(account_id) DO UPDATE SET
         email = excluded.email,
         discord_user_id = excluded.discord_user_id,
         discord_username = excluded.discord_username,
         discord_global_name = excluded.discord_global_name,
         discord_email = excluded.discord_email,
         updated_at = excluded.updated_at`,
    )
    .bind(
      acct.id,
      acct.email.trim().toLowerCase(),
      discord.discord_user_id,
      discord.discord_username,
      discord.discord_global_name,
      discord.discord_email,
      now,
      now,
    )
    .run();
}

export async function applyRootMcLinkedDiscordMember(
  env: RootMcDiscordLinkEnv,
  discordUserId: string,
  minecraftUsername: string,
  userOAuthAccessToken?: string,
): Promise<{ joined: boolean; nick: boolean; role: boolean; syncRole: boolean }> {
  const bot = cleanBotToken(env);
  const guildId = str(env.DISCORD_ROOTMC_GUILD_ID);
  const roleId = str(env.DISCORD_ROOTMC_LINKED_ROLE_ID);
  const syncRoleId =
    str(env.DISCORD_ROOTMC_MINECRAFT_SYNC_ROLE_ID) ||
    (bot && guildId ? await findGuildRoleIdByName(bot, guildId, "Minecraft Sync") : "") ||
    "";
  const userId = str(discordUserId);
  if (!bot || !guildId || !userId) {
    return { joined: false, nick: false, role: false, syncRole: false };
  }

  let joined = true;
  if (userOAuthAccessToken) {
    joined = await ensureGuildMember(bot, guildId, userId, userOAuthAccessToken);
  }

  const nick = await patchGuildMemberNickname(bot, guildId, userId, minecraftUsername);
  const role = roleId ? await addGuildMemberRole(bot, guildId, userId, roleId) : false;
  const syncRole = syncRoleId ? await addGuildMemberRole(bot, guildId, userId, syncRoleId) : false;
  return { joined, nick, role, syncRole };
}

export async function startRootMcDiscordLink(
  request: Request,
  env: RootMcDiscordLinkEnv,
  linkCode: string,
): Promise<Response> {
  const code = linkCode.toUpperCase();
  if (!code || code.length !== 6) {
    return json({ detail: "Valid 6-character link code required." }, 400);
  }

  const row = validateLinkCodeRow(await loadLinkCode(env.DB, code));
  if (row instanceof Response) return row;

  const clientId = str(env.DISCORD_ROOTMC_CLIENT_ID);
  const clientSecret = str(env.DISCORD_ROOTMC_CLIENT_SECRET);
  if (!clientId || !clientSecret) {
    return json({ detail: "Discord linking is not configured on the server." }, 503);
  }

  const state = randState();
  const now = Date.now();
  const createdAt = new Date(now).toISOString();
  const expiresAt = new Date(now + OAUTH_STATE_TTL_MS).toISOString();

  await env.DB.prepare(
    "INSERT INTO rootmc_discord_oauth_states (state, link_code, created_at, expires_at) VALUES (?, ?, ?, ?)",
  )
    .bind(state, code, createdAt, expiresAt)
    .run();

  const redirectUri = oauthCallbackUrl(env);
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    scope: OAUTH_SCOPES.join(" "),
    state,
    redirect_uri: redirectUri,
  });

  return json({
    authorize_url: `https://discord.com/api/oauth2/authorize?${params.toString()}`,
    expires_at: expiresAt,
    minecraft_username: row.minecraft_username,
  });
}

export async function handleRootMcDiscordOAuthCallback(
  request: Request,
  env: RootMcDiscordLinkEnv,
): Promise<Response> {
  const url = new URL(request.url);
  const oauthCode = str(url.searchParams.get("code"));
  const state = str(url.searchParams.get("state"));
  const err = str(url.searchParams.get("error"));
  const site = str(env.SITE_URL) || "https://rootmc.net";

  if (err) return Response.redirect(verifyReturnUrl(site, "discord=error"), 302);
  if (!oauthCode || !state) return Response.redirect(verifyReturnUrl(site, "discord=error"), 302);

  const stateRow = await env.DB.prepare(
    "SELECT link_code, expires_at FROM rootmc_discord_oauth_states WHERE state = ? LIMIT 1",
  )
    .bind(state)
    .first<{ link_code: string; expires_at: string }>();

  await env.DB.prepare("DELETE FROM rootmc_discord_oauth_states WHERE state = ?").bind(state).run();

  if (!stateRow?.link_code) {
    return Response.redirect(verifyReturnUrl(site, "discord=expired"), 302);
  }
  const expMs = Date.parse(stateRow.expires_at || "");
  if (!Number.isFinite(expMs) || expMs < Date.now()) {
    return Response.redirect(verifyReturnUrl(site, "discord=expired"), 302);
  }

  const clientId = str(env.DISCORD_ROOTMC_CLIENT_ID);
  const clientSecret = str(env.DISCORD_ROOTMC_CLIENT_SECRET);
  if (!clientId || !clientSecret) {
    return Response.redirect(verifyReturnUrl(site, "discord=error"), 302);
  }

  const redirectUri = oauthCallbackUrl(env);
  const tokenBody = new URLSearchParams();
  tokenBody.set("client_id", clientId);
  tokenBody.set("client_secret", clientSecret);
  tokenBody.set("grant_type", "authorization_code");
  tokenBody.set("code", oauthCode);
  tokenBody.set("redirect_uri", redirectUri);

  const tok = await discordFormPost("https://discord.com/api/oauth2/token", tokenBody);
  const accessToken = typeof tok?.access_token === "string" ? tok.access_token : "";
  if (!accessToken) return Response.redirect(verifyReturnUrl(site, "discord=error"), 302);

  const me = await discordGetMe(accessToken);
  const discordUserId = typeof me?.id === "string" ? me.id : "";
  const discordUsername = typeof me?.username === "string" ? me.username : null;
  const discordGlobalName = typeof me?.global_name === "string" ? me.global_name : null;
  const discordEmail = typeof me?.email === "string" ? me.email : null;
  if (!discordUserId) return Response.redirect(verifyReturnUrl(site, "discord=error"), 302);

  const linkCode = str(stateRow.link_code).toUpperCase();
  const linkRow = validateLinkCodeRow(await loadLinkCode(env.DB, linkCode));
  if (linkRow instanceof Response) {
    return Response.redirect(verifyReturnUrl(site, "discord=code_invalid"), 302);
  }

  const existingDiscord = await env.DB.prepare(
    "SELECT account_id FROM discord_account_links WHERE discord_user_id = ? LIMIT 1",
  )
    .bind(discordUserId)
    .first<{ account_id: string }>();

  const provisioned = await provisionMinecraftPlayerAccount(
    env.DB,
    linkRow.minecraft_uuid,
    linkRow.minecraft_username,
  );

  if (existingDiscord && existingDiscord.account_id !== provisioned.accountId) {
    return Response.redirect(verifyReturnUrl(site, "discord=already_linked"), 302);
  }

  await upsertGlobalMinecraftLink(
    env.DB,
    linkRow.minecraft_uuid,
    linkRow.minecraft_username,
    provisioned.accountId,
    provisioned.email,
  );
  await consumeLinkCode(env.DB, linkCode, provisioned.accountId);

  await saveDiscordLink(env.DB, { id: provisioned.accountId, email: provisioned.email }, {
    discord_user_id: discordUserId,
    discord_username: discordUsername,
    discord_global_name: discordGlobalName,
    discord_email: discordEmail,
  });

  await applyRootMcLinkedDiscordMember(env, discordUserId, linkRow.minecraft_username, accessToken);

  const q = new URLSearchParams({
    discord: "linked",
    player: linkRow.minecraft_username,
  });
  return Response.redirect(verifyReturnUrl(site, q.toString()), 302);
}

export async function handleRootMcDiscordLinkRoutes(
  request: Request,
  env: RootMcDiscordLinkEnv,
  subpath: string,
  method: string,
): Promise<Response | null> {
  if (!subpath.startsWith("/realm/minecraft")) return null;
  const rest = subpath.slice("/realm/minecraft".length) || "/";

  if (method === "POST" && rest === "/link/discord/start") {
    let body: { code?: string } = {};
    try {
      body = JSON.parse(await request.text()) as { code?: string };
    } catch {
      return json({ detail: "Invalid JSON body." }, 400);
    }
    return startRootMcDiscordLink(request, env, str(body.code));
  }

  return null;
}
