import type { D1Database } from "@cloudflare/workers-types";

import { json } from "./cors";
import { requireSignedInAccount, str, record } from "./realm-lib";
import type { RootStatEnv } from "./rootstat-minecraft";
import { mcmmoStatsForPlayer, playtimeStatsForPlayer, validateServerAuth } from "./rootstat-minecraft";

/** RootRecord dedicated SMP — Block Notes default world + placeholders. */
export const FEATURED_SERVER_ADDRESS = "15.204.13.9:25565";

export const REALM_PLUGIN_BASE = "https://rootrecord.info/realm/plugins";

/** Published plugin jars (remote server pulls via BlockNotes heartbeat — no SSH). */
export const PLUGIN_RELEASES = {
  blocknotes: {
    version: "1.1.0-SNAPSHOT",
    filename: "blocknotes-1.1.0-SNAPSHOT.jar",
    url: `${REALM_PLUGIN_BASE}/blocknotes-1.1.0-SNAPSHOT.jar`,
  },
} as const;

export const BLOCKNOTES_CONFIG_DEFAULTS = {
  "cloud.stats-url-base": "https://rootrecord.info/realm/player",
  "cloud.sync-interval-minutes": 5,
} as const;

export const FEATURED_SERVER_DEFAULTS = {
  server_id: "rootrecord-smp",
  server_name: "RootRecord SMP",
  server_address: FEATURED_SERVER_ADDRESS,
  default_world_name: "RootRecord SMP",
  game_version: "26.1",
  map_url: null as string | null,
  verify_url: "https://rootrecord.info/realm/verify",
  realm_url: "https://rootrecord.info/realm/",
};

function nowIso(): string {
  return new Date().toISOString();
}

function pluginActive(lastSeen: string | null | undefined): boolean {
  if (!lastSeen) return false;
  const ms = Date.parse(lastSeen);
  if (Number.isNaN(ms)) return false;
  return Date.now() - ms < 15 * 60 * 1000;
}

function rootstatActive(lastSeen: string | null | undefined): boolean {
  if (!lastSeen) return false;
  const ms = Date.parse(lastSeen);
  if (Number.isNaN(ms)) return false;
  return Date.now() - ms < 24 * 60 * 60 * 1000;
}

type ServerRow = {
  server_id: string;
  server_name: string;
  server_address: string;
  default_world_name: string;
  game_version: string;
  map_url: string | null;
  blocknotes_plugin_version: string | null;
  blocknotes_last_seen_at: string | null;
  rootstat_last_seen_at: string | null;
  featured: number;
};

function parseServerRow(raw: Record<string, unknown>): ServerRow {
  return {
    server_id: str(raw.server_id) || FEATURED_SERVER_DEFAULTS.server_id,
    server_name: str(raw.server_name) || FEATURED_SERVER_DEFAULTS.server_name,
    server_address: str(raw.server_address) || FEATURED_SERVER_DEFAULTS.server_address,
    default_world_name: str(raw.default_world_name) || FEATURED_SERVER_DEFAULTS.default_world_name,
    game_version: str(raw.game_version) || FEATURED_SERVER_DEFAULTS.game_version,
    map_url: str(raw.map_url) || null,
    blocknotes_plugin_version: str(raw.blocknotes_plugin_version) || null,
    blocknotes_last_seen_at: str(raw.blocknotes_last_seen_at) || null,
    rootstat_last_seen_at: str(raw.rootstat_last_seen_at) || null,
    featured: Number(raw.featured) || 0,
  };
}

function serverIsConnected(row: ServerRow): boolean {
  if (row.featured !== 0) return true;
  if (pluginActive(row.blocknotes_last_seen_at)) return true;
  if (rootstatActive(row.rootstat_last_seen_at)) return true;
  return false;
}

function publicServerPayload(row: ServerRow) {
  const blocknotesOnline = pluginActive(row.blocknotes_last_seen_at);
  const rootstatOnline = rootstatActive(row.rootstat_last_seen_at);
  return {
    server_id: row.server_id,
    name: row.server_name,
    address: row.server_address,
    default_world_name: row.default_world_name,
    game_version: row.game_version,
    map_url: row.map_url,
    verify_url: FEATURED_SERVER_DEFAULTS.verify_url,
    realm_url: FEATURED_SERVER_DEFAULTS.realm_url,
    featured: row.featured !== 0,
    connected: serverIsConnected(row),
    blocknotes_plugin_installed: blocknotesOnline,
    blocknotes_plugin_version: row.blocknotes_plugin_version,
    blocknotes_last_seen_at: row.blocknotes_last_seen_at,
    rootstat_active: rootstatOnline,
    rootstat_last_seen_at: row.rootstat_last_seen_at,
  };
}

async function connectedServerRows(db: D1Database): Promise<ServerRow[]> {
  const { results } = await db
    .prepare(
      `SELECT server_id, server_name, server_address, default_world_name, map_url, game_version,
              blocknotes_plugin_version, blocknotes_last_seen_at, rootstat_last_seen_at, featured
       FROM rootstat_servers
       ORDER BY featured DESC, updated_at DESC`,
    )
    .all<Record<string, unknown>>();

  const rows = (results || []).map(parseServerRow).filter(serverIsConnected);
  if (rows.length > 0) return rows;

  return [parseServerRow({ ...FEATURED_SERVER_DEFAULTS, featured: 1 })];
}

async function featuredServerRow(db: D1Database) {
  const rows = await connectedServerRows(db);
  const featured = rows.find((r) => r.featured !== 0);
  return featured ?? rows[0];
}

export async function handleBlockNotesServer(
  request: Request,
  env: RootStatEnv,
  subpath: string,
  method: string,
): Promise<Response | null> {
  if (!subpath.startsWith("/blocknotes/server")) return null;
  const rest = subpath.slice("/blocknotes/server".length) || "/";

  if (method === "GET" && rest === "/config") {
    const row = await featuredServerRow(env.DB);
    const payload = publicServerPayload(row);
    return json({
      featured_server: {
        server_id: payload.server_id,
        name: payload.name,
        address: payload.address,
        default_world_name: payload.default_world_name,
        game_version: payload.game_version,
        map_url: payload.map_url,
        verify_url: payload.verify_url,
        realm_url: payload.realm_url,
        blocknotes_plugin_installed: payload.blocknotes_plugin_installed,
        blocknotes_plugin_version: payload.blocknotes_plugin_version,
        blocknotes_last_seen_at: payload.blocknotes_last_seen_at,
      },
    });
  }

  if (method === "GET" && rest === "/featured") {
    const rows = await connectedServerRows(env.DB);
    return json({
      servers: rows.map(publicServerPayload),
    });
  }

  if (method === "GET" && rest.startsWith("/") && rest.endsWith("/mcmmo/me")) {
    const auth = await requireSignedInAccount(request, env);
    if (auth instanceof Response) return auth;

    const serverId = decodeURIComponent(rest.slice(1, -"/mcmmo/me".length));
    if (!serverId) return json({ detail: "server_id required." }, 400);

    const link = await env.DB.prepare(
      `SELECT minecraft_uuid, minecraft_username FROM rootstat_minecraft_links WHERE account_id = ? LIMIT 1`,
    )
      .bind(auth.accountId)
      .first<Record<string, unknown>>();

    const uuid = str(link?.minecraft_uuid);
    if (!uuid) {
      return json({
        server_id: serverId,
        rootstat_linked: false,
        mcmmo: null,
      });
    }

    const mcmmo = await mcmmoStatsForPlayer(env.DB, serverId, uuid);
    const playtime = await playtimeStatsForPlayer(env.DB, serverId, uuid);
    return json({
      server_id: serverId,
      rootstat_linked: true,
      minecraft_uuid: uuid,
      minecraft_username: link?.minecraft_username || null,
      mcmmo,
      playtime,
    });
  }

  if (method === "GET" && rest === "/membership") {
    const auth = await requireSignedInAccount(request, env);
    if (auth instanceof Response) return auth;

    const rows = await connectedServerRows(env.DB);

    const link = await env.DB.prepare(
      `SELECT minecraft_uuid, minecraft_username, verified_at
       FROM rootstat_minecraft_links
       WHERE account_id = ?
       LIMIT 1`,
    )
      .bind(auth.accountId)
      .first<Record<string, unknown>>();

    const linked = Boolean(link?.minecraft_uuid);
    const uuid = str(link?.minecraft_uuid);

    const servers = await Promise.all(
      rows.map(async (row) => {
        const payload = publicServerPayload(row);
        const mcmmo =
          linked && uuid ? await mcmmoStatsForPlayer(env.DB, row.server_id, uuid) : null;
        const playtime =
          linked && uuid ? await playtimeStatsForPlayer(env.DB, row.server_id, uuid) : null;
        const belongsToServer = linked && payload.blocknotes_plugin_installed;
        return {
          ...payload,
          mcmmo,
          playtime,
          belongs_to_server: belongsToServer,
          auto_add_world: belongsToServer && row.featured !== 0,
        };
      }),
    );

    const primary = rows.find((r) => r.featured !== 0) ?? rows[0];

    return json({
      account_id: auth.accountId,
      rootstat_linked: linked,
      minecraft_username: link?.minecraft_username || null,
      minecraft_uuid: uuid || null,
      verified_at: link?.verified_at || null,
      servers,
      featured_server: primary
        ? {
            server_id: primary.server_id,
            name: primary.server_name,
            address: primary.server_address,
            default_world_name: primary.default_world_name,
            game_version: primary.game_version,
            map_url: primary.map_url,
          }
        : null,
    });
  }

  if (method === "POST" && rest === "/heartbeat") {
    const server = await validateServerAuth(env, request);
    if (server instanceof Response) return server;

    let body: {
      plugin_version?: string;
      server_address?: string;
      default_world_name?: string;
      map_url?: string;
      game_version?: string;
    } = {};
    try {
      body = record(JSON.parse(await request.text()));
    } catch {
      return json({ detail: "Invalid JSON body." }, 400);
    }

    const now = nowIso();
    const pluginVersion = str(body.plugin_version) || "unknown";
    const address = str(body.server_address) || FEATURED_SERVER_ADDRESS;
    const worldName = str(body.default_world_name) || FEATURED_SERVER_DEFAULTS.default_world_name;
    const mapUrl = str(body.map_url) || null;
    const gameVersion = str(body.game_version) || FEATURED_SERVER_DEFAULTS.game_version;

    await env.DB.prepare(
      `UPDATE rootstat_servers
       SET server_address = COALESCE(server_address, ?),
           default_world_name = COALESCE(?, default_world_name),
           map_url = COALESCE(?, map_url),
           game_version = COALESCE(?, game_version),
           blocknotes_plugin_version = ?,
           blocknotes_last_seen_at = ?,
           updated_at = ?
       WHERE server_id = ?`,
    )
      .bind(address, worldName, mapUrl, gameVersion, pluginVersion, now, now, server.serverId)
      .run();

    return json({
      ok: true,
      server_id: server.serverId,
      blocknotes_plugin_version: pluginVersion,
      seen_at: now,
      rootstat_config_defaults: BLOCKNOTES_CONFIG_DEFAULTS,
      plugin_updates: [{ plugin: "blocknotes", ...PLUGIN_RELEASES.blocknotes }],
    });
  }

  return json({ detail: "Not Found" }, 404);
}

export async function featuredServerForMobileConfig(db: D1Database): Promise<Record<string, unknown>> {
  const row = await featuredServerRow(db);
  return {
    server_id: row.server_id,
    name: row.server_name,
    address: row.server_address,
    default_world_name: row.default_world_name,
    game_version: row.game_version,
    map_url: row.map_url,
    verify_url: FEATURED_SERVER_DEFAULTS.verify_url,
    realm_url: FEATURED_SERVER_DEFAULTS.realm_url,
    blocknotes_plugin_installed: pluginActive(row.blocknotes_last_seen_at),
  };
}
