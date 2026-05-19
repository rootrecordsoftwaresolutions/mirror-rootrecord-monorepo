import type { D1Database, D1PreparedStatement, ExecutionContext } from "@cloudflare/workers-types";
import nacl from "tweetnacl";

import {
  readCustodialTokenSlots,
  syncCustodialTokenSlotsFromRpc,
  type CustodialTokenSlotRow,
} from "./custodial-wallet-token-slots";
import { transferRrttCustodialPeerViaTreasury } from "./discord-rrtt-peer-send";
import type { InternalWalletEnv } from "./solana-internal-wallet";

export type DiscordRootUnitsEnv = {
  DB: D1Database;
  /** Application “Public Key” from Discord Developer Portal (General Information). Hex string. */
  DISCORD_PUBLIC_KEY?: string;
  /** Application id (snowflake); used to PATCH deferred interaction responses. */
  DISCORD_CLIENT_ID?: string;
  /** Guild id for `/send role` member scan and account link. */
  DISCORD_GUILD_ID?: string;
  /** Max days for `/send active` lookback on `discord_user_activity.last_message_at` (default 14, max 90). */
  DISCORD_ACTIVE_LOOKBACK_DAYS?: string;
  /** Bot token (secret): `/send role` member scan; dice button flow. */
  DISCORD_BOT_TOKEN?: string;
  /** Used by `/bal` to refresh `custodial_wallet_token_slots` from RPC (same as custodial routes). */
  SOLANA_RPC_URL?: string;
  RRTT_MINT_BASE58?: string;
  RRTT_DECIMALS?: string;
  CUSTODIAL_RPC_REFRESH_BUDGET_MS?: string;
  /** Custodial key decrypt (RRTT `/send user`). */
  INTERNAL_WALLET_ENC_KEY_B64?: string;
  /** Treasury pays ATA + tx fees for RRTT peer sends. */
  RRTT_TREASURY_SECRET_KEY_B58?: string;
};

const MAX_SEND = 10_000_000;
const FAUCET_COOLDOWN_MS = 12 * 3600 * 1000;
const DISCORD_VERIFY_URL = "https://rootrecord.info/discord-verify";
const ACCOUNT_URL = "https://rootrecord.info/account";

function sendAssetDisplayName(asset: "RUNIT" | "RRTT"): string {
  return asset === "RRTT" ? "RRTT" : "Root Units";
}

/** Public reply: ping recipient so they see verify link + failed amount (not ephemeral). */
function unlinkedRecipientSendFailedContent(
  toDiscordId: string,
  units: number,
  asset: "RUNIT" | "RRTT",
): string {
  const label = sendAssetDisplayName(asset);
  const amt = units.toLocaleString();
  return (
    `<@${toDiscordId}> — a **${amt} ${label}** transfer could not be delivered because your Discord is not linked to RootRecord.\n\n` +
    `Link at **${DISCORD_VERIFY_URL}**. Once you're verified, incoming sends are **auto-credited** to your account — this **${amt} ${label}** would have been claimed automatically.`
  );
}

function hexToUint8(hex: string): Uint8Array | null {
  const s = hex.replace(/^0x/i, "").trim();
  if (s.length % 2 !== 0) return null;
  const out = new Uint8Array(s.length / 2);
  for (let i = 0; i < out.length; i++) {
    const b = parseInt(s.slice(i * 2, i * 2 + 2), 16);
    if (Number.isNaN(b)) return null;
    out[i] = b;
  }
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

function interactionResponse(
  type: number,
  data?: { content?: string; flags?: number; components?: unknown[]; embeds?: unknown[] },
): Response {
  const payload =
    type === 5
      ? { type: 5 }
      : data
        ? (() => {
            const hasEmbeds = Array.isArray(data.embeds) && data.embeds.length > 0;
            const dataOut: Record<string, unknown> = {};
            if (typeof data.content === "string") dataOut.content = data.content;
            else if (hasEmbeds) dataOut.content = "\u200b";
            if (typeof data.flags === "number" && Number.isFinite(data.flags)) dataOut.flags = data.flags;
            if (Array.isArray(data.components)) dataOut.components = data.components;
            if (hasEmbeds) dataOut.embeds = data.embeds;
            return { type, data: dataOut };
          })()
        : { type };
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function jsonInteractionPayload(payload: Record<string, unknown>): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

/** After `type: 5` defer, replace the “thinking…” placeholder with the final message. */
async function patchDeferredInteractionMessage(
  applicationId: string,
  interactionToken: string,
  data: { content?: string; flags?: number; components?: unknown[]; embeds?: unknown[] },
): Promise<void> {
  const url = `https://discord.com/api/v10/webhooks/${encodeURIComponent(applicationId)}/${encodeURIComponent(
    interactionToken,
  )}/messages/@original`;
  const body: Record<string, unknown> = {};
  const hasEmbeds = Array.isArray(data.embeds) && data.embeds.length > 0;
  if (typeof data.content === "string") body.content = data.content;
  if (typeof data.flags === "number" && Number.isFinite(data.flags)) {
    body.flags = data.flags;
  }
  if (Array.isArray(data.components)) body.components = data.components;
  if (hasEmbeds) body.embeds = data.embeds;
  if (!("content" in body) && !Array.isArray(body.components) && !hasEmbeds) {
    body.content = "Done.";
  }
  if (!("content" in body) && (Array.isArray(body.components) || hasEmbeds)) {
    body.content = "\u200b";
  }
  const res = await fetch(url, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "User-Agent": "RootRecord/discord-root-units",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const rt = await res.text().catch(() => "");
    console.error("discord_interaction_deferred_patch", res.status, rt.slice(0, 500));
  }
}

async function ensureBalanceRow(db: D1Database, userId: string, nowIso: string): Promise<void> {
  await db
    .prepare("INSERT OR IGNORE INTO rr_earn_balance (user_id, balance, updated_at) VALUES (?, 0, ?)")
    .bind(userId, nowIso)
    .run();
}

async function earnUserIdForDiscord(db: D1Database, discordUserId: string): Promise<string | null> {
  const row = await db
    .prepare("SELECT lower(trim(email)) AS e FROM discord_account_links WHERE discord_user_id = ?")
    .bind(discordUserId)
    .first<{ e: string }>();
  const e = row?.e ? String(row.e).trim().toLowerCase() : "";
  if (!e || !e.includes("@")) return null;
  return `user:${e}`;
}

async function getEarnBalance(db: D1Database, userId: string): Promise<number> {
  const row = await db
    .prepare("SELECT balance FROM rr_earn_balance WHERE user_id = ?")
    .bind(userId)
    .first<{ balance: number }>();
  if (!row) return 0;
  return Math.max(0, Math.floor(Number(row.balance) || 0));
}

function optSnowflake(opts: Array<Record<string, unknown>>, name: string): string | null {
  const o = opts.find((x) => String(x.name) === name);
  if (!o || Number(o.type) !== 6) return null;
  const v = String(o.value ?? "").trim();
  return v || null;
}

function optInteger(opts: Array<Record<string, unknown>>, name: string): number | null {
  const o = opts.find((x) => String(x.name) === name);
  if (!o || Number(o.type) !== 4) return null;
  const v = Math.floor(Number(String(o.value ?? "").trim()));
  if (!Number.isFinite(v)) return null;
  return v;
}

/** STRING (type 3), e.g. slash `choices`. */
function optStringChoice(opts: Array<Record<string, unknown>>, name: string): string | null {
  const o = opts.find((x) => String(x.name) === name);
  if (!o || Number(o.type) !== 3) return null;
  const v = String(o.value ?? "").trim();
  return v || null;
}

function parseSendAsset(raw: string | null): "RUNIT" | "RRTT" {
  const u = String(raw || "").trim().toUpperCase();
  return u === "RRTT" ? "RRTT" : "RUNIT";
}

/** Walk SUB_COMMAND / SUB_COMMAND_GROUP trees (Discord only sends the invoked branch; nesting varies). */
function findOptionDeep(
  opts: Array<Record<string, unknown>>,
  name: string,
  wantTypes: number[],
): Record<string, unknown> | null {
  for (const o of opts) {
    if (!o || typeof o !== "object") continue;
    const t = Number(o.type);
    if (String(o.name) === name && wantTypes.includes(t)) return o;
    const inner = (Array.isArray(o.options) ? o.options : []) as Array<Record<string, unknown>>;
    if (inner.length) {
      const hit = findOptionDeep(inner, name, wantTypes);
      if (hit) return hit;
    }
  }
  return null;
}

function optIntegerDeep(opts: Array<Record<string, unknown>>, name: string): number | null {
  const o = findOptionDeep(opts, name, [4, 10]);
  if (!o) return null;
  const v = Math.floor(Number(String(o.value ?? "").trim()));
  if (!Number.isFinite(v)) return null;
  return v;
}

function optSnowflakeDeep(opts: Array<Record<string, unknown>>, name: string): string | null {
  const o = findOptionDeep(opts, name, [3, 6, 7, 9]);
  if (!o) return null;
  const v = String(o.value ?? "").trim();
  return v || null;
}

function optStringDeep(opts: Array<Record<string, unknown>>, name: string): string | null {
  const o = findOptionDeep(opts, name, [3]);
  if (!o) return null;
  const v = String(o.value ?? "").trim();
  return v || null;
}

function optRoleDeep(opts: Array<Record<string, unknown>>, name: string): string | null {
  const o = findOptionDeep(opts, name, [8]);
  if (!o) return null;
  const v = String(o.value ?? "").trim();
  return v || null;
}

function optRole(opts: Array<Record<string, unknown>>, name: string): string | null {
  const o = opts.find((x) => String(x.name) === name);
  if (!o || Number(o.type) !== 8) return null;
  const v = String(o.value ?? "").trim();
  return v || null;
}

/** SUB_COMMAND (type 1): pick the invoked branch — do not `opts.find` alone; some payloads list sibling stubs first. */
function invokedSubcommand(opts: Array<Record<string, unknown>>): { name: string; inner: Array<Record<string, unknown>> } | null {
  const subs = opts.filter((x) => Number(x.type) === 1);
  if (subs.length === 0) return null;
  const nonempty = subs.find((s) => {
    const io = (Array.isArray(s.options) ? s.options : []) as Array<Record<string, unknown>>;
    return io.length > 0;
  });
  const sub = nonempty || subs[subs.length - 1];
  const name = String(sub.name || "").trim().toLowerCase();
  const inner = (Array.isArray(sub.options) ? sub.options : []) as Array<Record<string, unknown>>;
  return { name, inner };
}

async function fetchDiscordUserIdsWithGuildRole(
  guildId: string,
  roleId: string,
  botToken: string,
): Promise<{ ok: true; ids: string[] } | { ok: false; status: number; detail: string }> {
  const ids: string[] = [];
  let after = "";
  for (let page = 0; page < 50; page++) {
    const q = new URLSearchParams({ limit: "1000" });
    if (after) q.set("after", after);
    const url = `https://discord.com/api/v10/guilds/${encodeURIComponent(guildId)}/members?${q.toString()}`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bot ${botToken}`,
        "User-Agent": "RootRecord/discord-root-units (members)",
      },
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      return { ok: false, status: res.status, detail: t.slice(0, 240) };
    }
    const arr = (await res.json()) as Array<{ user?: { id?: string }; roles?: string[] }>;
    if (!Array.isArray(arr) || arr.length === 0) break;
    for (const m of arr) {
      const uid = String(m.user?.id || "").trim();
      const roles = Array.isArray(m.roles) ? m.roles : [];
      if (uid && roles.includes(roleId)) ids.push(uid);
    }
    after = String(arr[arr.length - 1]?.user?.id || "").trim();
    if (!after || arr.length < 1000) break;
  }
  return { ok: true, ids };
}

function custodialSyncBudgetMs(env: DiscordRootUnitsEnv): number {
  const raw = String(env.CUSTODIAL_RPC_REFRESH_BUDGET_MS ?? "").trim();
  const n = parseInt(raw, 10);
  if (Number.isFinite(n) && n >= 2000 && n <= 25_000) return n;
  return 14_000;
}

function shortenMintBase58(mint: string): string {
  const m = String(mint || "").trim();
  if (m.length <= 12) return m;
  return `${m.slice(0, 6)}…${m.slice(-4)}`;
}

function formatSlotUiAmount(rawStr: string, decimals: number): string {
  let r: bigint;
  try {
    r = BigInt(String(rawStr || "0").split(".")[0] || "0");
  } catch {
    return "?";
  }
  const d = Math.min(20, Math.max(0, Math.floor(decimals)));
  if (d === 0) return r.toString();
  const div = 10n ** BigInt(d);
  const whole = r / div;
  const frac = r % div;
  if (frac === 0n) return whole.toString();
  const fr = frac.toString().padStart(d, "0").replace(/0+$/, "");
  if (!fr) return whole.toString();
  return `${whole.toString()}.${fr}`;
}

function sortCustodialSlots(rows: CustodialTokenSlotRow[]): CustodialTokenSlotRow[] {
  return [...rows].sort((a, b) => {
    const an = a.mint_base58 === "native";
    const bn = b.mint_base58 === "native";
    if (an && !bn) return -1;
    if (!an && bn) return 1;
    return a.mint_base58.localeCompare(b.mint_base58);
  });
}

function slotHasPositiveBalance(r: CustodialTokenSlotRow): boolean {
  try {
    return BigInt(String(r.amount_raw || "0")) > 0n;
  } catch {
    return false;
  }
}

function custodialDepositQrImageUrl(pubkey: string): string {
  return `https://quickchart.io/qr?size=280x280&light=f8fafc&dark=0f172a&text=${encodeURIComponent(pubkey)}`;
}

async function handleBal(db: D1Database, fromDiscordId: string, env: DiscordRootUnitsEnv): Promise<Response> {
  const link = await db
    .prepare("SELECT lower(trim(email)) AS e, account_id FROM discord_account_links WHERE discord_user_id = ?")
    .bind(fromDiscordId)
    .first<{ e: string; account_id: string }>();
  const e = link?.e ? String(link.e).trim().toLowerCase() : "";
  const accountId = link?.account_id ? String(link.account_id).trim() : "";
  if (!e || !e.includes("@")) {
    return interactionResponse(4, {
      content:
        `No linked RootRecord account for this Discord user. Open **${DISCORD_VERIFY_URL}** to link Discord, then try \`/bal\` again.`,
    });
  }
  const uid = `user:${e}`;
  const now = new Date().toISOString();
  await ensureBalanceRow(db, uid, now);
  const b = await getEarnBalance(db, uid);
  const lines: string[] = [
    `**Root Units:** ${b.toLocaleString()}`,
    "**Sharing in Discord:** **`/send`** passes Root Units to other linked members — their balance updates here right away.",
    "**Tokens you added:** Anything you've sent to your RootRecord deposit address can show below. When you move those tokens to someone else through RootRecord (outside this `/send` flow), their account balances update there too.",
  ];
  if (!accountId) {
    lines.push(`\n**Deposit-address tokens:** we couldn't load this section. Try **${ACCOUNT_URL}** if it keeps happening.`);
  } else {
    await syncCustodialTokenSlotsFromRpc(env, accountId, custodialSyncBudgetMs(env)).catch(() => {});
    const slotsAll = await readCustodialTokenSlots(db, accountId, 200);
    const slots = sortCustodialSlots(slotsAll).filter(slotHasPositiveBalance);
    if (slots.length === 0) {
      lines.push(
        "\n**From your deposit address:** nothing with a balance yet. Use **`/deposit`** for the address and QR, send tokens, then **`/bal`** again in a minute.",
      );
    } else {
      lines.push("\n**From your deposit address** (what we're seeing now):");
      const cap = 22;
      for (const s of slots.slice(0, cap)) {
        const label = s.mint_base58 === "native" ? "Solana" : shortenMintBase58(s.mint_base58);
        const ui = formatSlotUiAmount(s.amount_raw, s.decimals);
        lines.push(`• **${label}:** ${ui}`);
      }
      if (slots.length > cap) lines.push(`… +${slots.length - cap} more — see **${ACCOUNT_URL}** for the full list.`);
    }
  }
  let content = lines.join("\n");
  if (content.length > 1950) content = `${content.slice(0, 1940)}…`;
  return interactionResponse(4, { content });
}

const MAX_BULK_RECIPIENTS = 400;

type BulkRecipientMode = "all" | "active" | "role";

function activeLookbackDays(env: DiscordRootUnitsEnv): number {
  const raw = String(env.DISCORD_ACTIVE_LOOKBACK_DAYS ?? "").trim();
  const n = parseInt(raw, 10);
  if (Number.isFinite(n) && n >= 1 && n <= 90) return n;
  return 14;
}

async function resolveBulkRecipientDiscordIds(
  db: D1Database,
  fromDiscordId: string,
  mode: BulkRecipientMode,
  env: DiscordRootUnitsEnv,
  roleGuildMemberIds?: string[],
): Promise<{ ok: true; ids: string[] } | { ok: false; response: Response }> {
  if (mode === "role") {
    const roleSet = new Set(
      (roleGuildMemberIds || []).map((x) => String(x).trim()).filter((x) => x.length > 0),
    );
    if (roleSet.size < 1) {
      return {
        ok: false,
        response: interactionResponse(4, {
          content:
            "No members with that role were found (empty role, or the bot needs **Server Members Intent** + permission to **View Server Members**).",
        }),
      };
    }
    const rows = await db
      .prepare(
        "SELECT discord_user_id FROM discord_account_links WHERE discord_user_id != ? ORDER BY discord_user_id ASC",
      )
      .bind(fromDiscordId)
      .all<{ discord_user_id: string }>();
    const ids = (rows.results || [])
      .map((r) => String(r.discord_user_id || "").trim())
      .filter((id) => id.length > 0 && roleSet.has(id));
    return { ok: true, ids };
  }

  if (mode === "all") {
    const rows = await db
      .prepare(
        "SELECT discord_user_id FROM discord_account_links WHERE discord_user_id != ? ORDER BY discord_user_id ASC",
      )
      .bind(fromDiscordId)
      .all<{ discord_user_id: string }>();
    const ids = (rows.results || [])
      .map((r) => String(r.discord_user_id || "").trim())
      .filter((id) => id.length > 0);
    return { ok: true, ids };
  }

  if (mode === "active") {
    const days = activeLookbackDays(env);
    const cutoff = new Date(Date.now() - days * 864e5).toISOString();
    const rows = await db
      .prepare(
        `SELECT l.discord_user_id AS discord_user_id
         FROM discord_account_links l
         INNER JOIN discord_user_activity a ON a.discord_user_id = l.discord_user_id
         WHERE l.discord_user_id != ? AND a.last_message_at >= ?
         ORDER BY l.discord_user_id ASC`,
      )
      .bind(fromDiscordId, cutoff)
      .all<{ discord_user_id: string }>();
    const ids = (rows.results || [])
      .map((r) => String(r.discord_user_id || "").trim())
      .filter((id) => id.length > 0);
    return { ok: true, ids };
  }

  return {
    ok: false,
    response: interactionResponse(4, { content: "Internal: unknown bulk send mode." }),
  };
}

async function handleSendRrttUser(
  env: DiscordRootUnitsEnv,
  fromDiscordId: string,
  toDiscordId: string,
  fromUid: string,
  toUid: string,
  units: number,
  interactionId: string,
): Promise<Response> {
  const dupe = await env.DB
    .prepare(
      "SELECT 1 AS ok FROM rr_earn_discord_peer_transfer WHERE interaction_id = ? AND COALESCE(asset, 'RUNIT') = 'RRTT' LIMIT 1",
    )
    .bind(interactionId)
    .first<{ ok: number }>();
  if (dupe?.ok === 1) {
    return interactionResponse(4, { content: "This interaction was already completed." });
  }

  const fromLink = await env.DB
    .prepare("SELECT account_id FROM discord_account_links WHERE discord_user_id = ?")
    .bind(fromDiscordId)
    .first<{ account_id: string }>();
  const toLink = await env.DB
    .prepare("SELECT account_id FROM discord_account_links WHERE discord_user_id = ?")
    .bind(toDiscordId)
    .first<{ account_id: string }>();
  const fromAid = String(fromLink?.account_id || "").trim();
  const toAid = String(toLink?.account_id || "").trim();
  if (!fromAid) {
    return interactionResponse(4, {
      content: `Your Discord must be linked at **${DISCORD_VERIFY_URL}** before sending **RRTT**.`,
    });
  }
  if (!toAid) {
    return interactionResponse(4, {
      content: unlinkedRecipientSendFailedContent(toDiscordId, units, "RRTT"),
    });
  }

  const res = await transferRrttCustodialPeerViaTreasury(env as unknown as InternalWalletEnv, fromAid, toAid, units);
  if (!res.ok) {
    return interactionResponse(4, { content: res.message });
  }

  const now = new Date().toISOString();
  const rowId = crypto.randomUUID();
  const sigShort = res.signature.length > 24 ? `${res.signature.slice(0, 20)}…` : res.signature;
  await env.DB
    .prepare(
      `INSERT INTO rr_earn_discord_peer_transfer (
         id, interaction_id, from_user_id, to_user_id, units, from_discord_user_id, to_discord_user_id, created_at, asset, tx_signature
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'RRTT', ?)`,
    )
    .bind(rowId, interactionId, fromUid, toUid, units, fromDiscordId, toDiscordId, now, res.signature)
    .run();

  return interactionResponse(4, {
    content: `Sent **${units.toLocaleString()}** **RRTT** to <@${toDiscordId}> (on-chain). Tx: \`${sigShort}\``,
  });
}

async function handleSendExecute(
  db: D1Database,
  fromDiscordId: string,
  toDiscordId: string,
  fromUid: string,
  toUid: string,
  units: number,
  interactionId: string,
): Promise<Response> {
  const dupe = await db
    .prepare(
      "SELECT SUM(units) AS s FROM rr_earn_discord_peer_transfer WHERE interaction_id = ? AND COALESCE(asset, 'RUNIT') = 'RUNIT'",
    )
    .bind(interactionId)
    .first<{ s: number | null }>();
  const dupeSum = dupe?.s != null ? Math.floor(Number(dupe.s) || 0) : 0;
  if (dupeSum > 0) {
    return interactionResponse(4, {
      content: `This interaction was already completed (**${dupeSum.toLocaleString()}** Root Units total).`,
    });
  }

  const now = new Date().toISOString();
  await ensureBalanceRow(db, fromUid, now);
  await ensureBalanceRow(db, toUid, now);

  const debit = await db
    .prepare(
      "UPDATE rr_earn_balance SET balance = balance - ?, updated_at = ? WHERE user_id = ? AND balance >= ?",
    )
    .bind(units, now, fromUid, units)
    .run();
  if ((debit.meta?.changes ?? 0) !== 1) {
    const have = await getEarnBalance(db, fromUid);
    return interactionResponse(4, {
      content: `Insufficient Root Units. You have **${have.toLocaleString()}**; tried to send **${units.toLocaleString()}**.`,
    });
  }

  const rowId = crypto.randomUUID();
  try {
    await db.batch([
      db
        .prepare("UPDATE rr_earn_balance SET balance = balance + ?, updated_at = ? WHERE user_id = ?")
        .bind(units, now, toUid),
      db
        .prepare(
          `INSERT INTO rr_earn_discord_peer_transfer (
             id, interaction_id, from_user_id, to_user_id, units, from_discord_user_id, to_discord_user_id, created_at, asset
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'RUNIT')`,
        )
        .bind(rowId, interactionId, fromUid, toUid, units, fromDiscordId, toDiscordId, now),
    ]);
  } catch (e) {
    await db
      .prepare("UPDATE rr_earn_balance SET balance = balance + ?, updated_at = ? WHERE user_id = ?")
      .bind(units, now, fromUid)
      .run()
      .catch(() => {});
    throw e;
  }

  const newBal = await getEarnBalance(db, fromUid);
  return interactionResponse(4, {
    content: `Sent **${units.toLocaleString()}** Root Units to <@${toDiscordId}>. Your new balance: **${newBal.toLocaleString()}**.`,
  });
}

/** Split `totalUnits` across recipients chosen by `mode` (all linked, recently active ∩ linked, or role ∩ linked). */
async function handleSendBulk(
  db: D1Database,
  fromDiscordId: string,
  fromUid: string,
  totalUnits: number,
  interactionId: string,
  mode: BulkRecipientMode,
  env: DiscordRootUnitsEnv,
  roleGuildMemberIds?: string[],
): Promise<Response> {
  const dupe = await db
    .prepare(
      "SELECT 1 AS ok FROM rr_earn_discord_peer_transfer WHERE interaction_id = ? AND COALESCE(asset, 'RUNIT') = 'RUNIT' LIMIT 1",
    )
    .bind(interactionId)
    .first<{ ok: number }>();
  if (dupe?.ok === 1) {
    return interactionResponse(4, {
      content: "This interaction was already completed.",
    });
  }

  const resolved = await resolveBulkRecipientDiscordIds(db, fromDiscordId, mode, env, roleGuildMemberIds);
  if (!resolved.ok) {
    return resolved.response;
  }
  const discordIds = resolved.ids;
  const n = discordIds.length;
  if (n < 1) {
    const empty =
      mode === "active"
        ? `No **linked** members have Discord message rows in \`discord_user_activity\` within the last **${activeLookbackDays(env)}** days (cron must be ingesting channels).`
        : mode === "role"
          ? `No **linked** members have that role. They must link Discord at **${DISCORD_VERIFY_URL}** and hold the role in this server.`
          : `No other linked RootRecord members. People must link Discord at **${DISCORD_VERIFY_URL}** before they can receive a split.`;
    return interactionResponse(4, { content: empty });
  }
  if (n > MAX_BULK_RECIPIENTS) {
    return interactionResponse(4, {
      content: `Too many recipients (**${n}**). Max **${MAX_BULK_RECIPIENTS.toLocaleString()}** per \`/send everyone\` / \`/send active\` / \`/send role\`.`,
    });
  }
  if (totalUnits < n) {
    return interactionResponse(4, {
      content: `Total must be at least **${n.toLocaleString()}** Root Units (one whole unit per recipient). You matched **${n.toLocaleString()}** recipients.`,
    });
  }
  if (totalUnits > MAX_SEND) {
    return interactionResponse(4, {
      content: `Max **${MAX_SEND.toLocaleString()}** Root Units per command.`,
    });
  }

  const pairs: { discordId: string; uid: string }[] = [];
  for (const did of discordIds) {
    const uid = await earnUserIdForDiscord(db, did);
    if (uid) pairs.push({ discordId: did, uid });
  }
  if (pairs.length < 1) {
    return interactionResponse(4, {
      content: "Could not resolve linked accounts for bulk send.",
    });
  }

  const m = pairs.length;
  const base = Math.floor(totalUnits / m);
  const rem = totalUnits % m;
  if (base < 1) {
    return interactionResponse(4, {
      content: "Split is too small for the number of recipients (internal).",
    });
  }

  const have = await getEarnBalance(db, fromUid);
  if (have < totalUnits) {
    return interactionResponse(4, {
      content: `Insufficient Root Units. You have **${have.toLocaleString()}**; tried to split **${totalUnits.toLocaleString()}** among **${m.toLocaleString()}** members.`,
    });
  }

  const now = new Date().toISOString();
  await ensureBalanceRow(db, fromUid, now);
  for (const p of pairs) {
    await ensureBalanceRow(db, p.uid, now);
  }

  const debit = await db
    .prepare(
      "UPDATE rr_earn_balance SET balance = balance - ?, updated_at = ? WHERE user_id = ? AND balance >= ?",
    )
    .bind(totalUnits, now, fromUid, totalUnits)
    .run();
  if ((debit.meta?.changes ?? 0) !== 1) {
    const have2 = await getEarnBalance(db, fromUid);
    return interactionResponse(4, {
      content: `Insufficient Root Units. You have **${have2.toLocaleString()}**; tried to split **${totalUnits.toLocaleString()}**.`,
    });
  }

  const stmts: D1PreparedStatement[] = [];
  for (let i = 0; i < m; i++) {
    const share = base + (i < rem ? 1 : 0);
    const { discordId, uid } = pairs[i];
    stmts.push(
      db
        .prepare("UPDATE rr_earn_balance SET balance = balance + ?, updated_at = ? WHERE user_id = ?")
        .bind(share, now, uid),
    );
    stmts.push(
      db
        .prepare(
          `INSERT INTO rr_earn_discord_peer_transfer (
             id, interaction_id, from_user_id, to_user_id, units, from_discord_user_id, to_discord_user_id, created_at, asset
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'RUNIT')`,
        )
        .bind(crypto.randomUUID(), interactionId, fromUid, uid, share, fromDiscordId, discordId, now),
    );
  }

  try {
    await db.batch(stmts);
  } catch (e) {
    await db
      .prepare("UPDATE rr_earn_balance SET balance = balance + ?, updated_at = ? WHERE user_id = ?")
      .bind(totalUnits, now, fromUid)
      .run()
      .catch(() => {});
    throw e;
  }

  const newBal = await getEarnBalance(db, fromUid);
  const minShare = base;
  const maxShare = base + (rem > 0 ? 1 : 0);
  const cohort =
    mode === "all"
      ? "all other linked members"
      : mode === "role"
        ? "linked members who have the chosen server role"
        : `linked members with message activity in the last **${activeLookbackDays(env)}** days`;
  return interactionResponse(4, {
    content: `Split **${totalUnits.toLocaleString()}** Root Units among **${m.toLocaleString()}** ${cohort} (${minShare.toLocaleString()}–${maxShare.toLocaleString()} each). Your new balance: **${newBal.toLocaleString()}**.`,
  });
}

function rollD6(): number {
  const u = new Uint32Array(1);
  crypto.getRandomValues(u);
  return 1 + (u[0] % 6);
}

async function handleWalletDeposit(db: D1Database, fromDiscordId: string): Promise<Response> {
  const row = await db
    .prepare(
      `SELECT iw.pubkey AS pubkey FROM discord_account_links l
       INNER JOIN internal_solana_wallets iw ON iw.account_id = l.account_id
       WHERE l.discord_user_id = ?`,
    )
    .bind(fromDiscordId)
    .first<{ pubkey: string }>();
  const pk = row?.pubkey ? String(row.pubkey).trim() : "";
  if (!pk) {
    return interactionResponse(4, {
      content:
        `No deposit address is set up for this account yet. Sign in at **${ACCOUNT_URL}** — your wallet is created with your account.`,
    });
  }
  const qrUrl = custodialDepositQrImageUrl(pk);
  return interactionResponse(4, {
    content: `**Your deposit address (Solana)**\n\`${pk}\`\n\nSend **Solana** or supported tokens from your phone or browser wallet. Amounts show in **\`/bal\`** after a short wait. **Root Units** are separate — in-bot credits you share with **\`/send\`**.`,
    embeds: [
      {
        title: "Scan to deposit",
        color: 0x22c55e,
        image: { url: qrUrl },
        footer: { text: "QR image from quickchart.io" },
      },
    ],
  });
}

function handleSlashMenu(): Response {
  return interactionResponse(4, {
    content: "Pick an action below (only you see this). **Balance** = Root Units + tokens from your deposit address. **Wallet** = address and QR.",
    components: [
      {
        type: 1,
        components: [
          {
            type: 3,
            custom_id: "rootrecord_menu",
            placeholder: "Root Record",
            min_values: 1,
            max_values: 1,
            options: [
              { label: "Balance", value: "bal", description: "Root Units + deposit tokens" },
              { label: "Wallet", value: "wallet", description: "Address + QR" },
              { label: "Faucet claim", value: "f_claim", description: "Random RU (12h)" },
              { label: "Help", value: "help", description: "Command list" },
            ],
          },
        ],
      },
    ],
  });
}

async function handleFaucetClaim(db: D1Database, discordUserId: string, interactionId: string): Promise<Response> {
  const uid = await earnUserIdForDiscord(db, discordUserId);
  if (!uid) {
    return interactionResponse(4, {
      content: `Link Discord on **${DISCORD_VERIFY_URL}** before using the faucet.`,
    });
  }
  const now = new Date().toISOString();
  const prev = await db
    .prepare("SELECT last_claim_at FROM rr_discord_faucet_claim WHERE discord_user_id = ?")
    .bind(discordUserId)
    .first<{ last_claim_at: string }>();
  if (prev?.last_claim_at) {
    const last = Date.parse(String(prev.last_claim_at));
    if (Number.isFinite(last) && Date.now() - last < FAUCET_COOLDOWN_MS) {
      const next = new Date(last + FAUCET_COOLDOWN_MS).toISOString();
      return interactionResponse(4, {
        content: `Faucet cooldown — next claim after **${next}** (UTC).`,
      });
    }
  }
  const poolRow = await db.prepare("SELECT balance FROM rr_discord_faucet_pool WHERE id = 1").first<{ balance: number }>();
  const poolBal = Math.max(0, Math.floor(Number(poolRow?.balance) || 0));
  if (poolBal < 1) {
    return interactionResponse(4, {
      content: "Faucet pool is empty. Add Root Units with **`/faucet deposit`** (linked users).",
    });
  }
  const maxGive = Math.min(50, poolBal, 200);
  const rnd = new Uint32Array(1);
  crypto.getRandomValues(rnd);
  const amount = 1 + (rnd[0] % maxGive);
  await ensureBalanceRow(db, uid, now);
  try {
    await db.batch([
      db
        .prepare("UPDATE rr_discord_faucet_pool SET balance = balance - ? WHERE id = 1 AND balance >= ?")
        .bind(amount, amount),
      db.prepare("UPDATE rr_earn_balance SET balance = balance + ?, updated_at = ? WHERE user_id = ?").bind(amount, now, uid),
      db
        .prepare(
          "INSERT INTO rr_discord_faucet_claim (discord_user_id, last_claim_at, last_amount) VALUES (?, ?, ?) ON CONFLICT(discord_user_id) DO UPDATE SET last_claim_at = excluded.last_claim_at, last_amount = excluded.last_amount",
        )
        .bind(discordUserId, now, amount),
    ]);
  } catch (e) {
    console.error("faucet_claim", e instanceof Error ? e.message : String(e));
    return interactionResponse(4, { content: "Faucet failed (try again later)." });
  }
  const left = await db.prepare("SELECT balance FROM rr_discord_faucet_pool WHERE id = 1").first<{ balance: number }>();
  const lb = Math.max(0, Math.floor(Number(left?.balance) || 0));
  void interactionId;
  return interactionResponse(4, {
    content: `Claimed **${amount.toLocaleString()}** random Root Units from the faucet. Pool remaining: **${lb.toLocaleString()}**.`,
  });
}

async function handleFaucetDeposit(
  db: D1Database,
  fromUid: string,
  amount: number,
): Promise<Response> {
  if (amount < 1 || amount > MAX_SEND) {
    return interactionResponse(4, { content: `Deposit **1**–**${MAX_SEND.toLocaleString()}** Root Units.` });
  }
  const now = new Date().toISOString();
  await ensureBalanceRow(db, fromUid, now);
  const debit = await db
    .prepare(
      "UPDATE rr_earn_balance SET balance = balance - ?, updated_at = ? WHERE user_id = ? AND balance >= ?",
    )
    .bind(amount, now, fromUid, amount)
    .run();
  if ((debit.meta?.changes ?? 0) !== 1) {
    const have = await getEarnBalance(db, fromUid);
    return interactionResponse(4, {
      content: `Insufficient Root Units to deposit. You have **${have.toLocaleString()}**.`,
    });
  }
  try {
    await db.batch([
      db.prepare("INSERT OR IGNORE INTO rr_discord_faucet_pool (id, balance) VALUES (1, 0)"),
      db.prepare("UPDATE rr_discord_faucet_pool SET balance = balance + ? WHERE id = 1").bind(amount),
    ]);
  } catch (e) {
    await db
      .prepare("UPDATE rr_earn_balance SET balance = balance + ?, updated_at = ? WHERE user_id = ?")
      .bind(amount, now, fromUid)
      .run()
      .catch(() => {});
    console.error("faucet_deposit", e instanceof Error ? e.message : String(e));
    return interactionResponse(4, { content: "Deposit failed. Try again." });
  }
  return interactionResponse(4, {
    content: `Deposited **${amount.toLocaleString()}** Root Units into the **faucet pool**. Thank you!`,
  });
}

async function handleDiceCreate(
  db: D1Database,
  challengerId: string,
  opts: Array<Record<string, unknown>>,
): Promise<Response> {
  const opponentId = optSnowflake(opts, "opponent") ?? optSnowflakeDeep(opts, "opponent");
  const units = optInteger(opts, "amount") ?? optIntegerDeep(opts, "amount");
  if (!opponentId || units == null) {
    return interactionResponse(4, {
      content: "Use **`/dice`** with **opponent** (user) and **amount** (Root Units each puts in the pot).",
    });
  }
  if (units < 1 || units > MAX_SEND) {
    return interactionResponse(4, { content: `Amount must be 1–${MAX_SEND.toLocaleString()}.` });
  }
  if (opponentId === challengerId) {
    return interactionResponse(4, { content: "Pick someone else as your opponent." });
  }
  const chUid = await earnUserIdForDiscord(db, challengerId);
  const opUid = await earnUserIdForDiscord(db, opponentId);
  if (!chUid || !opUid) {
    return interactionResponse(4, {
      content: `Both players must be **linked** to RootRecord (**${DISCORD_VERIFY_URL}**).`,
    });
  }
  const have = await getEarnBalance(db, chUid);
  if (have < units) {
    return interactionResponse(4, {
      content: `You need at least **${units.toLocaleString()}** Root Units to open this wager (you have **${have.toLocaleString()}**).`,
    });
  }
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  try {
    await db
      .prepare(
        "INSERT INTO discord_dice_challenges (id, challenger_discord_user_id, opponent_discord_user_id, units, state, created_at) VALUES (?, ?, ?, ?, 'pending', ?)",
      )
      .bind(id, challengerId, opponentId, units, now)
      .run();
  } catch (e) {
    console.error("dice_create", e instanceof Error ? e.message : String(e));
    return interactionResponse(4, {
      content: "Could not create challenge (database not migrated?). Run D1 migration **0043_discord_faucet_dice.sql**.",
    });
  }
  return interactionResponse(4, {
    content: `<@${opponentId}> — <@${challengerId}> challenges you to **dice** for **${units.toLocaleString()}** Root Units each (winner takes **${(units * 2).toLocaleString()}**).`,
    components: [
      {
        type: 1,
        components: [
          {
            type: 2,
            style: 3,
            label: "Accept & roll",
            custom_id: `dice_ok:${id}`,
          },
        ],
      },
    ],
  });
}

async function settleDiceButtonClick(body: Record<string, unknown>, env: DiscordRootUnitsEnv): Promise<Response> {
  const data = body.data as Record<string, unknown> | undefined;
  const cid = String(data?.custom_id || "");
  if (!cid.startsWith("dice_ok:")) {
    return jsonInteractionPayload({ type: 4, data: { content: "Unknown button.", flags: 64 } });
  }
  const id = cid.slice("dice_ok:".length).trim();
  const actor = String(
    (body.member as { user?: { id?: string } } | undefined)?.user?.id ||
      (body as { user?: { id?: string } }).user?.id ||
      "",
  ).trim();
  if (!actor || !id) {
    return jsonInteractionPayload({ type: 4, data: { content: "Could not read user.", flags: 64 } });
  }

  const row = await env.DB
    .prepare(
      "SELECT challenger_discord_user_id, opponent_discord_user_id, units, state FROM discord_dice_challenges WHERE id = ?",
    )
    .bind(id)
    .first<{
      challenger_discord_user_id: string;
      opponent_discord_user_id: string;
      units: number;
      state: string;
    }>();
  if (!row || String(row.state) !== "pending") {
    return jsonInteractionPayload({
      type: 4,
      data: { content: "This challenge is already finished or expired.", flags: 64 },
    });
  }
  if (actor !== String(row.opponent_discord_user_id).trim()) {
    return jsonInteractionPayload({
      type: 4,
      data: { content: "Only the challenged user can accept.", flags: 64 },
    });
  }

  const units = Math.max(1, Math.floor(Number(row.units) || 0));
  const chDid = String(row.challenger_discord_user_id).trim();
  const opDid = String(row.opponent_discord_user_id).trim();
  const chUid = await earnUserIdForDiscord(env.DB, chDid);
  const opUid = await earnUserIdForDiscord(env.DB, opDid);
  if (!chUid || !opUid) {
    return jsonInteractionPayload({
      type: 4,
      data: { content: "Both players must stay linked to RootRecord.", flags: 64 },
    });
  }

  const hbCh = await getEarnBalance(env.DB, chUid);
  const hbOp = await getEarnBalance(env.DB, opUid);
  if (hbCh < units || hbOp < units) {
    return jsonInteractionPayload({
      type: 4,
      data: {
        content: `Someone no longer has **${units.toLocaleString()}** Root Units for this duel.`,
        flags: 64,
      },
    });
  }

  let r1 = rollD6();
  let r2 = rollD6();
  let guard = 0;
  while (r1 === r2 && guard++ < 10) {
    r1 = rollD6();
    r2 = rollD6();
  }

  const now = new Date().toISOString();
  await ensureBalanceRow(env.DB, chUid, now);
  await ensureBalanceRow(env.DB, opUid, now);

  try {
    if (r1 === r2) {
      await env.DB
        .prepare(
          "UPDATE discord_dice_challenges SET state = 'done', challenger_roll = ?, opponent_roll = ?, winner_discord_user_id = NULL, resolved_at = ? WHERE id = ? AND state = 'pending'",
        )
        .bind(r1, r2, now, id)
        .run();
      return jsonInteractionPayload({
        type: 7,
        data: {
          content: `**Tie ${r1}–${r2}** (after re-rolls). No wagers taken.`,
          components: [],
        },
      });
    }

    const dCh = await env.DB
      .prepare(
        "UPDATE rr_earn_balance SET balance = balance - ?, updated_at = ? WHERE user_id = ? AND balance >= ?",
      )
      .bind(units, now, chUid, units)
      .run();
    if ((dCh.meta?.changes ?? 0) !== 1) throw new Error("debit_ch");
    const dOp = await env.DB
      .prepare(
        "UPDATE rr_earn_balance SET balance = balance - ?, updated_at = ? WHERE user_id = ? AND balance >= ?",
      )
      .bind(units, now, opUid, units)
      .run();
    if ((dOp.meta?.changes ?? 0) !== 1) {
      await env.DB
        .prepare("UPDATE rr_earn_balance SET balance = balance + ?, updated_at = ? WHERE user_id = ?")
        .bind(units, now, chUid)
        .run()
        .catch(() => {});
      throw new Error("debit_op");
    }

    const winDid = r1 > r2 ? chDid : opDid;
    const winUid = r1 > r2 ? chUid : opUid;
    await env.DB
      .prepare("UPDATE rr_earn_balance SET balance = balance + ?, updated_at = ? WHERE user_id = ?")
      .bind(units * 2, now, winUid)
      .run();
    await env.DB
      .prepare(
        "UPDATE discord_dice_challenges SET state = 'done', challenger_roll = ?, opponent_roll = ?, winner_discord_user_id = ?, resolved_at = ? WHERE id = ? AND state = 'pending'",
      )
      .bind(r1, r2, winDid, now, id)
      .run();

    return jsonInteractionPayload({
      type: 7,
      data: {
        content: `🎲 <@${chDid}> rolled **${r1}**, <@${opDid}> rolled **${r2}**. **Winner:** <@${winDid}> takes **${(units * 2).toLocaleString()}** Root Units!`,
        components: [],
      },
    });
  } catch (e) {
    console.error("dice_settle", e instanceof Error ? e.message : String(e));
    return jsonInteractionPayload({
      type: 4,
      data: { content: "Could not settle the duel. Balances may have changed — try **`/dice`** again.", flags: 64 },
    });
  }
}

async function withEphemeralFromResponse(r: Response): Promise<Response> {
  const j = (await r.json()) as {
    data?: { content?: string; flags?: number; components?: unknown[]; embeds?: unknown[] };
  };
  const d = j.data || {};
  const hasEmbeds = Array.isArray(d.embeds) && d.embeds.length > 0;
  return jsonInteractionPayload({
    type: 4,
    data: {
      content: String(d.content ?? (hasEmbeds ? "\u200b" : "—")),
      flags: (typeof d.flags === "number" ? d.flags : 0) | 64,
      ...(Array.isArray(d.components) ? { components: d.components } : {}),
      ...(hasEmbeds ? { embeds: d.embeds } : {}),
    },
  });
}

async function handleMessageComponent(body: Record<string, unknown>, env: DiscordRootUnitsEnv): Promise<Response> {
  const data = body.data as Record<string, unknown> | undefined;
  const cid = String(data?.custom_id || "");
  if (cid.startsWith("dice_ok:")) {
    return settleDiceButtonClick(body, env);
  }
  if (cid === "rootrecord_menu") {
    const vals = Array.isArray(data?.values) ? (data.values as string[]) : [];
    const v = String(vals[0] || "").trim();
    const member = body.member as Record<string, unknown> | undefined;
    const uid = String((member?.user as { id?: string } | undefined)?.id || "").trim();
    if (!uid) {
      return jsonInteractionPayload({ type: 4, data: { content: "Missing user.", flags: 64 } });
    }
    if (v === "bal") return withEphemeralFromResponse(await handleBal(env.DB, uid, env));
    if (v === "wallet") return withEphemeralFromResponse(await handleWalletDeposit(env.DB, uid));
    if (v === "f_claim") {
      const iid = String(body.id || "").trim();
      return withEphemeralFromResponse(await handleFaucetClaim(env.DB, uid, iid));
    }
    if (v === "help") {
      return jsonInteractionPayload({
        type: 4,
        data: {
          flags: 64,
          content:
            "**Commands:** `/bal`, `/send` (**RUNIT** or **RRTT** + user / everyone / active / role), `/wallet`, `/deposit`, `/menu`, `/faucet`, `/dice`. `/withdraw` & `/airdrop` soon.",
        },
      });
    }
    return jsonInteractionPayload({ type: 4, data: { content: "Unknown menu choice.", flags: 64 } });
  }
  return jsonInteractionPayload({ type: 4, data: { content: "Unknown component.", flags: 64 } });
}

async function handleApplicationCommand(body: Record<string, unknown>, env: DiscordRootUnitsEnv): Promise<Response> {
  const data = body.data as Record<string, unknown> | undefined;
  if (!data) {
    return interactionResponse(4, { content: "Missing command data." });
  }
  const name = String(data.name || "").trim().toLowerCase();
  const member = body.member as Record<string, unknown> | undefined;
  const user = member?.user as Record<string, unknown> | undefined;
  const fromDiscordId = String(user?.id || "").trim();
  if (!fromDiscordId) {
    return interactionResponse(4, { content: "Could not read your Discord user id." });
  }

  const opts = (Array.isArray(data.options) ? data.options : []) as Array<Record<string, unknown>>;

  if (name === "bal") {
    return handleBal(env.DB, fromDiscordId, env);
  }

  if (name === "wallet" || name === "deposit") {
    return handleWalletDeposit(env.DB, fromDiscordId);
  }

  if (name === "menu") {
    return handleSlashMenu();
  }

  if (name === "withdraw") {
    return interactionResponse(4, {
      content: "**`/withdraw`** isn't in the bot yet. Use **`/deposit`** / **`/bal`** for what you've added to your address.",
    });
  }

  if (name === "airdrop") {
    return interactionResponse(4, {
      content: "**`/airdrop`** `claim` / `create` — coming soon.",
    });
  }

  if (name === "dice") {
    return handleDiceCreate(env.DB, fromDiscordId, opts);
  }

  if (name === "faucet") {
    const interactionId = String(body.id || "").trim();
    if (!interactionId) {
      return interactionResponse(4, { content: "Missing interaction id." });
    }
    const fromUid = await earnUserIdForDiscord(env.DB, fromDiscordId);
    if (!fromUid) {
      return interactionResponse(4, {
        content: `Your Discord account is not linked. Open **${DISCORD_VERIFY_URL}** to link Discord.`,
      });
    }
    const sc = invokedSubcommand(opts);
    const scName = sc ? sc.name : "";
    const inner = sc ? sc.inner : [];
    if (scName === "claim") {
      return handleFaucetClaim(env.DB, fromDiscordId, interactionId);
    }
    if (scName === "deposit") {
      const amt = optInteger(inner, "amount") ?? optIntegerDeep(opts, "amount");
      if (amt == null) {
        return interactionResponse(4, {
          content: "Use **`/faucet deposit`** with **amount** (Root Units into the shared pool).",
        });
      }
      return handleFaucetDeposit(env.DB, fromUid, amt);
    }
    return interactionResponse(4, { content: "Use **`/faucet claim`** or **`/faucet deposit`**." });
  }

  if (name === "send") {
    const interactionId = String(body.id || "").trim();
    if (!interactionId) {
      return interactionResponse(4, { content: "Missing interaction id." });
    }

    const fromUid = await earnUserIdForDiscord(env.DB, fromDiscordId);
    if (!fromUid) {
      return interactionResponse(4, {
        content:
          `Your Discord account is not linked to RootRecord. Open **${DISCORD_VERIFY_URL}** to link Discord.`,
      });
    }

    const sc = invokedSubcommand(opts);
    const scName = sc ? String(sc.name || "").trim().toLowerCase() : "";
    const inner = (sc ? sc.inner : []) as Array<Record<string, unknown>>;
    const sendAsset = parseSendAsset(optStringChoice(inner, "asset") ?? optStringDeep(opts, "asset"));
    if (sendAsset === "RRTT" && scName !== "" && scName !== "user") {
      return interactionResponse(4, {
        content:
          "**RRTT** only works under **`/send user`**: choose **RRTT**, **member**, then **amount**. For splits to many people, use **RUNIT** with **everyone** / **active** / **role** (Root Units).",
      });
    }
    if (scName === "everyone") {
      const total = optInteger(inner, "amount") ?? optIntegerDeep(opts, "amount");
      if (total == null) {
        return interactionResponse(4, {
          content:
            "Use **`/send everyone`**: **asset** = **RUNIT**, then **amount** (total Root Units split across every other linked member).",
        });
      }
      return handleSendBulk(env.DB, fromDiscordId, fromUid, total, interactionId, "all", env);
    }

    if (scName === "active") {
      const total = optInteger(inner, "amount") ?? optIntegerDeep(opts, "amount");
      if (total == null) {
        return interactionResponse(4, {
          content:
            "Use **`/send active`**: **asset** = **RUNIT**, then **amount** (split across linked members with recent message activity).",
        });
      }
      return handleSendBulk(env.DB, fromDiscordId, fromUid, total, interactionId, "active", env);
    }

    if (scName === "role") {
      const roleId = optRole(inner, "role") ?? optRoleDeep(opts, "role");
      const total = optInteger(inner, "amount") ?? optIntegerDeep(opts, "amount");
      if (!roleId || total == null) {
        return interactionResponse(4, {
          content:
            "Use **`/send role`**: **asset** = **RUNIT**, **role**, and **amount** (split among linked members with that role).",
        });
      }
      const bot = String(env.DISCORD_BOT_TOKEN || "").trim();
      const guildId = String(env.DISCORD_GUILD_ID || "").trim();
      if (!bot || !guildId) {
        return interactionResponse(4, {
          content: "Configure **`DISCORD_BOT_TOKEN`** (secret) and **`DISCORD_GUILD_ID`** for **role** sends.",
        });
      }
      const fetched = await fetchDiscordUserIdsWithGuildRole(guildId, roleId, bot);
      if (!fetched.ok) {
        return interactionResponse(4, {
          content: `Could not list guild members (${fetched.status}). Bot needs **View Server Members** + **Server Members Intent**.`,
        });
      }
      return handleSendBulk(env.DB, fromDiscordId, fromUid, total, interactionId, "role", env, fetched.ids);
    }

    if (scName === "user") {
      const toDiscordId = optSnowflake(inner, "member") ?? optSnowflakeDeep(opts, "member");
      const units = optInteger(inner, "amount") ?? optIntegerDeep(opts, "amount");
      if (!toDiscordId || units == null) {
        return interactionResponse(4, {
          content:
            "Use **`/send user`**: **asset** (**RUNIT** = Root Units, **RRTT** = on-chain token), **member**, **amount**.",
        });
      }
      if (units < 1) {
        return interactionResponse(4, { content: "Amount must be at least **1**." });
      }
      if (units > MAX_SEND) {
        return interactionResponse(4, {
          content: `Max **${MAX_SEND.toLocaleString()}** per send (${sendAsset === "RRTT" ? "whole RRTT" : "Root Units"}).`,
        });
      }
      if (toDiscordId === fromDiscordId) {
        return interactionResponse(4, { content: "You cannot send to yourself." });
      }
      const toUid = await earnUserIdForDiscord(env.DB, toDiscordId);
      if (!toUid) {
        return interactionResponse(4, {
          content: unlinkedRecipientSendFailedContent(toDiscordId, units, sendAsset),
        });
      }
      if (sendAsset === "RRTT") {
        return handleSendRrttUser(env, fromDiscordId, toDiscordId, fromUid, toUid, units, interactionId);
      }
      return handleSendExecute(env.DB, fromDiscordId, toDiscordId, fromUid, toUid, units, interactionId);
    }

    return interactionResponse(4, {
      content:
        "Use **`/send user`**, **`everyone`**, **`active`**, or **`role`**. Pick **RUNIT** or **RRTT** first where asked. `@everyone` is not a user field — use **everyone** (linked members only).",
    });
  }

  return interactionResponse(4, { content: "Unknown command." });
}

export async function handleDiscordInteractions(
  request: Request,
  env: DiscordRootUnitsEnv,
  ctx?: ExecutionContext,
): Promise<Response> {
  const pk = String(env.DISCORD_PUBLIC_KEY || "").trim();
  if (!pk) {
    return new Response(JSON.stringify({ detail: "DISCORD_PUBLIC_KEY is not set on this Worker." }), {
      status: 503,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  }

  const rawBody = await request.text();
  if (!verifyDiscordRequest(rawBody, request.headers, pk)) {
    const hasSig = Boolean(request.headers.get("x-signature-ed25519") || request.headers.get("X-Signature-Ed25519"));
    console.error(
      "discord_interaction_verify_fail",
      JSON.stringify({ has_sig: hasSig, body_len: rawBody.length, pk_len: pk.length }),
    );
    return new Response("invalid request signature", { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return new Response("invalid json", { status: 400 });
  }

  const t = Number(body.type);
  if (t === 1) {
    return interactionResponse(1);
  }
  // APPLICATION_COMMAND_AUTOCOMPLETE — must ACK with callback type 8 (not a channel message).
  if (t === 4) {
    return new Response(JSON.stringify({ type: 8, data: { choices: [] } }), {
      status: 200,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  }
  if (t === 3) {
    try {
      return await handleMessageComponent(body, env);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("discord_message_component", msg.slice(0, 400));
      return jsonInteractionPayload({
        type: 4,
        data: { content: "Something went wrong. Try again.", flags: 64 },
      });
    }
  }
  if (t === 2) {
    const rawAppId = body.application_id;
    const applicationId =
      typeof rawAppId === "string" && /^\d{10,22}$/.test(rawAppId.trim())
        ? rawAppId.trim()
        : String(env.DISCORD_CLIENT_ID || "").trim();
    const interactionToken = String(body.token || "").trim();
    if (!interactionToken) {
      return interactionResponse(4, {
        content: "Invalid Discord interaction (missing token). Check the Interactions URL points at this Worker.",
      });
    }
    const runCmd = async (): Promise<Response> => {
      try {
        return await handleApplicationCommand(body, env);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("discord_root_units_cmd", msg.slice(0, 400));
        return interactionResponse(4, {
          content: "Something went wrong processing that command. Try again in a moment.",
        });
      }
    };

    // Discord requires an initial response in ~3s. D1 work can exceed that — defer (type 5), then PATCH @original.
    // Only `interactionToken` is required to PATCH; `applicationId` falls back to env.DISCORD_CLIENT_ID.
    if (ctx?.waitUntil && interactionToken) {
      const appIdForPatch = applicationId || String(env.DISCORD_CLIENT_ID || "").trim();
      ctx.waitUntil(
        (async () => {
          if (!appIdForPatch) {
            console.error("discord_interaction_deferred_missing_application_id");
            return;
          }
          try {
            const r = await runCmd();
            let payload: {
              type?: number;
              data?: { content?: string; flags?: number; components?: unknown[]; embeds?: unknown[] };
            };
            try {
              payload = (await r.json()) as typeof payload;
            } catch {
              await patchDeferredInteractionMessage(appIdForPatch, interactionToken, {
                content: "Invalid bot response. Try again.",
              });
              return;
            }
            const hasEmbeds = Array.isArray(payload.data?.embeds) && payload.data!.embeds!.length > 0;
            const patchData: { content?: string; flags?: number; components?: unknown[]; embeds?: unknown[] } = {};
            if (typeof payload.data?.content === "string") patchData.content = payload.data.content;
            else if (hasEmbeds || Array.isArray(payload.data?.components)) patchData.content = "\u200b";
            else patchData.content = "Done.";
            if (typeof payload.data?.flags === "number" && Number.isFinite(payload.data.flags)) {
              patchData.flags = payload.data.flags;
            }
            if (Array.isArray(payload.data?.components)) {
              patchData.components = payload.data.components;
            }
            if (hasEmbeds) patchData.embeds = payload.data!.embeds;
            await patchDeferredInteractionMessage(appIdForPatch, interactionToken, patchData);
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            console.error("discord_root_units_deferred", msg.slice(0, 400));
            await patchDeferredInteractionMessage(appIdForPatch, interactionToken, {
              content: "Something went wrong processing that command. Try again in a moment.",
            });
          }
        })(),
      );
      return interactionResponse(5);
    }

    return runCmd();
  }

  return interactionResponse(4, { content: "Unsupported interaction type." });
}
