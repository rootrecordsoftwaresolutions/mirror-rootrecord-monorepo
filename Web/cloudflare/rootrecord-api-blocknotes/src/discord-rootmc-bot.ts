import type { D1Database, ExecutionContext } from "@cloudflare/workers-types";
import nacl from "tweetnacl";

import { featuredServerForMobileConfig, FEATURED_SERVER_DEFAULTS } from "./blocknotes-server";

export type RootMcDiscordEnv = {
  DB: D1Database;
  DISCORD_ROOTMC_PUBLIC_KEY?: string;
  DISCORD_ROOTMC_CLIENT_ID?: string;
};

function hexToUint8(hex: string): Uint8Array | null {
  const h = hex.replace(/\s/g, "").toLowerCase();
  if (!/^[0-9a-f]+$/.test(h) || h.length % 2 !== 0) return null;
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function verifyDiscordRequest(rawBody: string, headers: Headers, publicKeyHex: string): boolean {
  const sig = headers.get("x-signature-ed25519") || headers.get("X-Signature-Ed25519");
  const ts = headers.get("x-signature-timestamp") || headers.get("X-Signature-Timestamp");
  if (!sig || !ts) return false;
  const pk = hexToUint8(publicKeyHex);
  const sigBytes = hexToUint8(sig);
  if (!pk || pk.length !== 32 || !sigBytes || sigBytes.length !== 64) return false;
  const msg = new TextEncoder().encode(ts + rawBody);
  return nacl.sign.detached.verify(msg, sigBytes, pk);
}

function interactionJson(type: number, data?: { content?: string; flags?: number; embeds?: unknown[] }): Response {
  const payload = data ? { type, data } : { type };
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function helpText(): string {
  return (
    "**RootMC** — Root Record Minecraft / Block Notes / Realm\n\n" +
    "• **`/server`** — RootRecord SMP address, plugin heartbeat, realm links\n" +
    "• **`/help`** — this message\n\n" +
    "Realm: https://rootrecord.info/realm/\n" +
    "Verify: https://rootrecord.info/realm/verify\n" +
    "Block Notes app: https://rootrecord.info/products"
  );
}

async function serverStatusContent(db: D1Database): Promise<string> {
  const row = await featuredServerForMobileConfig(db).catch(() => ({}));
  const name = String(row.name || FEATURED_SERVER_DEFAULTS.server_name);
  const address = String(row.address || FEATURED_SERVER_DEFAULTS.server_address);
  const version = String(row.game_version || FEATURED_SERVER_DEFAULTS.game_version);
  const pluginOn = Boolean(row.blocknotes_plugin_installed);
  const pluginVer = String(row.blocknotes_plugin_version || "—");
  const lastSeen = String(row.blocknotes_last_seen_at || "never");
  const mapUrl = String(row.map_url || "").trim();
  const lines = [
    `**${name}**`,
    `**Address:** \`${address}\``,
    `**Version:** ${version}`,
    `**Block Notes plugin:** ${pluginOn ? "online" : "offline"} (${pluginVer})`,
    `_Last heartbeat: ${lastSeen.replace("T", " ").replace(/\.\d{3}Z$/, " UTC")}_`,
    `**Realm:** ${FEATURED_SERVER_DEFAULTS.realm_url}`,
    `**Verify MC account:** ${FEATURED_SERVER_DEFAULTS.verify_url}`,
  ];
  if (mapUrl) lines.splice(4, 0, `**Map:** ${mapUrl}`);
  return lines.join("\n");
}

export async function handleRootMcDiscordInteractions(
  request: Request,
  env: RootMcDiscordEnv,
  _ctx?: ExecutionContext,
): Promise<Response> {
  const pk = String(env.DISCORD_ROOTMC_PUBLIC_KEY || "").trim();
  if (!pk) {
    return new Response(JSON.stringify({ detail: "DISCORD_ROOTMC_PUBLIC_KEY not set" }), { status: 503 });
  }

  const rawBody = await request.text();
  if (!verifyDiscordRequest(rawBody, request.headers, pk)) {
    return new Response("invalid request signature", { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return new Response("invalid json", { status: 400 });
  }

  const t = Number(body.type);
  if (t === 1) return interactionJson(1);

  if (t === 2) {
    const cmd = String((body.data as Record<string, unknown> | undefined)?.name || "").toLowerCase();
    if (cmd === "help") {
      return interactionJson(4, { content: helpText(), flags: 64 });
    }
    if (cmd === "server") {
      const content = await serverStatusContent(env.DB);
      return interactionJson(4, { content, flags: 64 });
    }
    return interactionJson(4, { content: "Unknown command. Try **`/help`** or **`/server`**.", flags: 64 });
  }

  return interactionJson(4, { content: "Unsupported interaction.", flags: 64 });
}
