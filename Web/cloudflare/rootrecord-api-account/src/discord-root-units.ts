import type { D1Database, D1PreparedStatement, ExecutionContext } from "@cloudflare/workers-types";
import nacl from "tweetnacl";

import {
  readCustodialTokenSlots,
  syncCustodialTokenSlotsFromRpc,
  type CustodialTokenSlotRow,
} from "./custodial-wallet-token-slots";
import { transferRrttCustodialPeerViaTreasury } from "./discord-rrtt-peer-send";
import { transferSolCustodialPeerViaTreasury } from "./discord-sol-peer-send";
import type { InternalWalletEnv } from "./solana-internal-wallet";
import { buildEconomyDiscordMessage, leaderboardEntryLabel, loadEconomyLeaderboardData } from "./root-economy";
import { MAX_ROOT_UNITS_PER_TRANSFER } from "../../shared/earn-program-constants";
import { formatRootsAtomicLocale, rootsWholeToAtomic } from "../../shared/roots-units";
import { loadEconomyDailySeries, readCirculationTotals } from "../../shared/root-economy-snapshot";

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
  /** Role assigned after account-to-Discord linking succeeds. */
  DISCORD_VERIFIED_ROLE_ID?: string;
  RR_PUSH_ADMIN_SECRET?: string;
  ROOTRECORD_SOLANA_TX_URL?: string;
  /** Used by `/bal` to refresh `custodial_wallet_token_slots` from RPC (same as custodial routes). */
  SOLANA_RPC_URL?: string;
  RRTT_MINT_BASE58?: string;
  RRTT_DECIMALS?: string;
  CUSTODIAL_RPC_REFRESH_BUDGET_MS?: string;
  HELIUS_API_KEY?: string;
  HELIUS_RPC_URL?: string;
  NEXT_PUBLIC_HELIUS_API_KEY?: string;
  SOLANA_HELIUS_API_KEY?: string;
  NEXT_PUBLIC_RPC_URL?: string;
  /** Custodial key decrypt (RRTT `/send user`). */
  INTERNAL_WALLET_ENC_KEY_B64?: string;
  /** Treasury pays ATA + tx fees for RRTT peer sends. */
  RRTT_TREASURY_SECRET_KEY_B58?: string;
  /** Developer-only /screenshot report archive webhook. */
  DISCORD_GROK_WEBHOOK_URL?: string;
  /** Optional role id for @Developer; otherwise bot fetches role named Developer. */
  DISCORD_DEVELOPER_ROLE_ID?: string;
  /** X/Grok credentials for report collection + AI summary. */
  GROK_X_BEARER_TOKEN?: string;
  GROK_X_V1_CONSUMER_KEY?: string;
  GROK_X_V1_CONSUMER_KEY_SECRET?: string;
  GROK_X_V2_CLIENT_ID?: string;
  GROK_X_V2_CLIENT_SECRET?: string;
  GROK_API_BEARER_TOKEN?: string;
  GROK_API_URL?: string;
  GROK_MODEL?: string;
  GROK_X_USERNAME?: string;
};

const ROOT_RECORD_GLOBAL_UPDATER_PUBKEY = "G1DHctEcwkiLw8NZDfCbDCbuPktQBmWa6P2aobDuMKuZ";
const ROOTS_MINT_BASE58 = "8hwxLN1Q4Yr8xFErErULCqNvcF1cMwGjpRXPz6DAH7gM";
const MAX_SEND = MAX_ROOT_UNITS_PER_TRANSFER;
const MIN_SEND = rootsWholeToAtomic(0.00000001);
const FAUCET_COOLDOWN_MS = 12 * 3600 * 1000;

function fmtRoots(atomic: number): string {
  return formatRootsAtomicLocale(Math.max(0, Math.floor(Number(atomic) || 0)));
}

/** Discord slash command numbers are whole Roots; ledger stores atomic units. */
function ledgerFromWholeRoots(whole: number | null): number | null {
  if (whole == null || !Number.isFinite(whole) || whole <= 0) return null;
  const atomic = Math.round(whole * 100_000_000);
  return atomic > 0 ? atomic : null;
}
const DISCORD_VERIFY_URL = "https://rootrecord.info/discord-verify";
const ACCOUNT_URL = "https://rootrecord.info/account";

type DiscordSendAsset = "ROOTS" | "RRTT" | "SOL";

function sendAssetDisplayName(asset: DiscordSendAsset): string {
  if (asset === "RRTT") return "RRTT";
  if (asset === "SOL") return "SOL";
  return "ROOTS";
}

function formatSolLamports(lamports: number): string {
  const n = Math.max(0, Math.floor(Number(lamports) || 0));
  const sol = n / 1e9;
  if (sol >= 0.01) return `${sol.toLocaleString(undefined, { maximumFractionDigits: 6 })} SOL`;
  return `${n.toLocaleString()} lamports`;
}

function formatSolWhole(sol: number): string {
  const s = Number(sol);
  if (!Number.isFinite(s) || s <= 0) return "0 SOL";
  return `${s.toLocaleString(undefined, { maximumFractionDigits: 9 })} SOL`;
}

const MAX_SOL_SEND_LAMPORTS = 10_000_000_000; // 10 SOL per Discord send
const MIN_SOL_SEND_LAMPORTS = 10_000; // 0.00001 SOL

function sendFailedAmountText(unitsOrWhole: number, asset: DiscordSendAsset): string {
  return asset === "SOL"
    ? formatSolWhole(unitsOrWhole)
    : asset === "RRTT"
      ? `${Math.floor(unitsOrWhole).toLocaleString()} RRTT`
      : `${fmtRoots(unitsOrWhole)} ROOTS`;
}

/** Public reply: ping recipient so they see verify link + failed amount (not ephemeral). */
function unlinkedRecipientSendFailedContent(
  toDiscordId: string,
  unitsOrWhole: number,
  asset: DiscordSendAsset,
): string {
  const amountText = sendFailedAmountText(unitsOrWhole, asset);
  return (
    `<@${toDiscordId}> — a **${amountText}** transfer could not be delivered because your Discord is not linked to RootRecord.\n\n` +
    `Link at **${DISCORD_VERIFY_URL}**. Once you're verified, incoming sends are **auto-credited** to your account — this **${amountText}** would have been claimed automatically.`
  );
}

function verifiedButUnlinkedRecipientSendFailedContent(toDiscordId: string, amountText: string): string {
  return (
    `<@${toDiscordId}> — a **${amountText}** transfer could not be delivered. You have **@Verified** in Discord, but RootRecord does not have a saved account link for your Discord ID.\n\n` +
    `Open **${DISCORD_VERIFY_URL}**, sign in, and tap **Re-verify with Discord**. That rebuilds the account link so incoming sends can be **auto-credited**.`
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

async function postDiscordInteractionFollowup(
  applicationId: string,
  interactionToken: string,
  data: { content?: string; flags?: number; embeds?: unknown[] },
): Promise<void> {
  const url = `https://discord.com/api/v10/webhooks/${encodeURIComponent(applicationId)}/${encodeURIComponent(
    interactionToken,
  )}`;
  const body: Record<string, unknown> = {};
  const hasEmbeds = Array.isArray(data.embeds) && data.embeds.length > 0;
  if (typeof data.content === "string") body.content = data.content;
  if (typeof data.flags === "number" && Number.isFinite(data.flags)) body.flags = data.flags;
  if (hasEmbeds) body.embeds = data.embeds;
  if (!("content" in body) && !hasEmbeds) body.content = "Done.";
  if (!("content" in body) && hasEmbeds) body.content = "\u200b";
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "User-Agent": "RootRecord/discord-root-units",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const rt = await res.text().catch(() => "");
    console.error("discord_interaction_followup", res.status, rt.slice(0, 500));
  }
}

async function ensureBalanceRow(db: D1Database, userId: string, nowIso: string): Promise<void> {
  await db
    .prepare("INSERT OR IGNORE INTO rr_earn_balance (user_id, balance, updated_at) VALUES (?, 0, ?)")
    .bind(userId, nowIso)
    .run();
}

async function discordLinkForUserId(
  db: D1Database,
  discordUserId: string,
): Promise<{ accountId: string; email: string; userId: string } | null> {
  const row = await db
    .prepare(
      `SELECT l.account_id AS account_id,
              lower(trim(COALESCE(NULLIF(l.email, ''), la.email))) AS e
       FROM discord_account_links l
       LEFT JOIN license_accounts la ON la.id = l.account_id
       WHERE l.discord_user_id = ?`,
    )
    .bind(String(discordUserId || "").trim())
    .first<{ account_id: string; e: string }>();
  const accountId = row?.account_id ? String(row.account_id).trim() : "";
  const e = row?.e ? String(row.e).trim().toLowerCase() : "";
  if (!accountId || !e || !e.includes("@")) return null;
  return { accountId, email: e, userId: `user:${e}` };
}

async function earnUserIdForDiscord(db: D1Database, discordUserId: string): Promise<string | null> {
  return (await discordLinkForUserId(db, discordUserId))?.userId ?? null;
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

function parseSendAsset(raw: string | null): DiscordSendAsset {
  const u = String(raw || "").trim().toUpperCase();
  if (u === "RRTT") return "RRTT";
  if (u === "SOL") return "SOL";
  return "ROOTS";
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
  const o = findOptionDeep(opts, name, [4]);
  if (!o) return null;
  const v = Math.floor(Number(String(o.value ?? "").trim()));
  if (!Number.isFinite(v)) return null;
  return v;
}

/** INTEGER or NUMBER slash options (decimals preserved for SOL / fractional Roots). */
function optNumber(opts: Array<Record<string, unknown>>, name: string): number | null {
  const o = opts.find((x) => String(x.name) === name);
  if (!o) return null;
  const t = Number(o.type);
  if (t !== 4 && t !== 10) return null;
  const v = Number(o.value);
  if (!Number.isFinite(v) || v <= 0) return null;
  return v;
}

function optNumberDeep(opts: Array<Record<string, unknown>>, name: string): number | null {
  const o = findOptionDeep(opts, name, [4, 10]);
  if (!o) return null;
  const v = Number(o.value);
  if (!Number.isFinite(v) || v <= 0) return null;
  return v;
}

function solWholeToLamports(sol: number): number | null {
  if (!Number.isFinite(sol) || sol <= 0) return null;
  const lam = Math.floor(sol * 1e9);
  if (lam < 1) return null;
  return lam;
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

async function discordUserHasVerifiedRole(env: DiscordRootUnitsEnv, discordUserId: string): Promise<boolean> {
  const bot = String(env.DISCORD_BOT_TOKEN || "").trim();
  const guildId = String(env.DISCORD_GUILD_ID || "").trim();
  const roleId = String(env.DISCORD_VERIFIED_ROLE_ID || "").trim();
  const userId = String(discordUserId || "").trim();
  if (!bot || !guildId || !roleId || !userId) return false;
  try {
    const res = await fetch(
      `https://discord.com/api/v10/guilds/${encodeURIComponent(guildId)}/members/${encodeURIComponent(userId)}`,
      {
        headers: {
          Authorization: `Bot ${bot}`,
          "User-Agent": "RootRecord/discord-root-units (member)",
        },
      },
    );
    if (!res.ok) return false;
    const member = (await res.json()) as { roles?: unknown };
    const roles = Array.isArray(member.roles) ? member.roles.map((r) => String(r)) : [];
    return roles.includes(roleId);
  } catch {
    return false;
  }
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
  const link = await discordLinkForUserId(db, fromDiscordId);
  if (!link) {
    return interactionResponse(4, {
      content:
        `No linked RootRecord account for this Discord user. Open **${DISCORD_VERIFY_URL}** to link Discord, then try \`/bal\` again.`,
    });
  }
  const uid = link.userId;
  const accountId = link.accountId;
  const now = new Date().toISOString();
  await ensureBalanceRow(db, uid, now);
  const b = await getEarnBalance(db, uid);
  const lines: string[] = [
    `**Roots:** ${fmtRoots(b)}`,
    "**Sharing in Discord:** **`/send`** — **ROOTS** updates the in-bot Roots ledger; **RRTT** / **SOL** move between custodial deposit wallets on-chain (**`/send user`**).",
    "**Your deposit address:** SOL and SPL balances below. **`/send`** with **SOL** or **RRTT** transfers wallet → wallet; treasury covers network fees.",
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
  wholeRrtt: number,
  interactionId: string,
): Promise<Response> {
  const dupe = await env.DB
    .prepare(
      "SELECT 1 AS ok FROM rr_earn_discord_peer_transfer WHERE interaction_id = ? AND COALESCE(asset, 'ROOTS') = 'RRTT' LIMIT 1",
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
      content: unlinkedRecipientSendFailedContent(toDiscordId, wholeRrtt, "RRTT"),
    });
  }

  const res = await transferRrttCustodialPeerViaTreasury(env as unknown as InternalWalletEnv, fromAid, toAid, wholeRrtt);
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
    .bind(rowId, interactionId, fromUid, toUid, wholeRrtt, fromDiscordId, toDiscordId, now, res.signature)
    .run();

  return interactionResponse(4, {
    content: `Sent **${wholeRrtt.toLocaleString()}** **RRTT** to <@${toDiscordId}> (custodial → custodial on-chain). Tx: \`${sigShort}\``,
  });
}

async function handleSendSolUser(
  env: DiscordRootUnitsEnv,
  fromDiscordId: string,
  toDiscordId: string,
  fromUid: string,
  toUid: string,
  lamports: number,
  interactionId: string,
): Promise<Response> {
  const dupe = await env.DB
    .prepare(
      "SELECT 1 AS ok FROM rr_earn_discord_peer_transfer WHERE interaction_id = ? AND COALESCE(asset, 'ROOTS') = 'SOL' LIMIT 1",
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
      content: `Your Discord must be linked at **${DISCORD_VERIFY_URL}** before sending **SOL**.`,
    });
  }
  if (!toAid) {
    return interactionResponse(4, {
      content: unlinkedRecipientSendFailedContent(toDiscordId, lamports, "SOL"),
    });
  }

  const res = await transferSolCustodialPeerViaTreasury(env as unknown as InternalWalletEnv, fromAid, toAid, lamports);
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
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'SOL', ?)`,
    )
    .bind(rowId, interactionId, fromUid, toUid, lamports, fromDiscordId, toDiscordId, now, res.signature)
    .run();

  return interactionResponse(4, {
    content: `Sent **${formatSolLamports(lamports)}** to <@${toDiscordId}> (custodial → custodial on-chain). Tx: \`${sigShort}\``,
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
      "SELECT SUM(units) AS s FROM rr_earn_discord_peer_transfer WHERE interaction_id = ? AND COALESCE(asset, 'ROOTS') IN ('ROOTS', 'RUNIT')",
    )
    .bind(interactionId)
    .first<{ s: number | null }>();
  const dupeSum = dupe?.s != null ? Math.floor(Number(dupe.s) || 0) : 0;
  if (dupeSum > 0) {
    return interactionResponse(4, {
      content: `This interaction was already completed (**${fmtRoots(dupeSum)} ROOTS** total).`,
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
      content: `Insufficient ROOTS. You have **${fmtRoots(have)} ROOTS**; tried to send **${fmtRoots(units)} ROOTS**.`,
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
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ROOTS')`,
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
    content: `Sent **${fmtRoots(units)}** Roots to <@${toDiscordId}>. Your new balance: **${fmtRoots(newBal)}**.`,
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
      "SELECT 1 AS ok FROM rr_earn_discord_peer_transfer WHERE interaction_id = ? AND COALESCE(asset, 'ROOTS') IN ('ROOTS', 'RUNIT') LIMIT 1",
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
      content: `Total too small to split across **${n.toLocaleString()}** recipients (need at least **${n}** atomic units total). Try a larger Roots amount.`,
    });
  }
  if (totalUnits > MAX_SEND) {
    return interactionResponse(4, {
      content: `Max **${formatRootsAtomicLocale(MAX_SEND)}** Roots per command.`,
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
      content: `Insufficient Roots. You have **${fmtRoots(have)}**; tried to split **${fmtRoots(totalUnits)}** among **${m.toLocaleString()}** members.`,
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
      content: `Insufficient ROOTS. You have **${fmtRoots(have2)} ROOTS**; tried to split **${fmtRoots(totalUnits)} ROOTS**.`,
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
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ROOTS')`,
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
    content: `Split **${fmtRoots(totalUnits)} ROOTS** among **${m.toLocaleString()}** ${cohort} (${fmtRoots(minShare)}–${fmtRoots(maxShare)} ROOTS each). Your new balance: **${fmtRoots(newBal)} ROOTS**.`,
  });
}

function rollD6(): number {
  const u = new Uint32Array(1);
  crypto.getRandomValues(u);
  return 1 + (u[0] % 6);
}

async function handleEconomy(db: D1Database): Promise<Response> {
  const data = await loadEconomyLeaderboardData(db);
  return interactionResponse(4, { content: buildEconomyDiscordMessage(data) });
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
    content: `**Your deposit address (Solana)**\n\`${pk}\`\n\nSend **Solana** or supported tokens from your phone or browser wallet. Amounts show in **\`/bal\`** after a short wait. **ROOTS** are the in-bot credits you share with **\`/send\`**.`,
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
    content: "Pick an action below (only you see this). **Balance** = ROOTS + tokens from your deposit address. **Wallet** = address and QR.",
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
              { label: "Balance", value: "bal", description: "ROOTS + deposit tokens" },
              { label: "Wallet", value: "wallet", description: "Address + QR" },
              { label: "Faucet claim", value: "f_claim", description: "Random ROOTS (12h)" },
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
      content: "Faucet pool is empty. Add ROOTS with **`/faucet deposit`** (linked users).",
    });
  }
  const maxGive = Math.min(50, poolBal, 200);
  const rnd = new Uint32Array(1);
  crypto.getRandomValues(rnd);
  const amount = rootsWholeToAtomic(1 + (rnd[0] % maxGive));
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
    content: `Claimed **${fmtRoots(amount)} ROOTS** from the faucet. Pool remaining: **${fmtRoots(lb)} ROOTS**.`,
  });
}

async function handleFaucetDeposit(
  db: D1Database,
  fromUid: string,
  amount: number,
): Promise<Response> {
  if (amount < MIN_SEND || amount > MAX_SEND) {
    return interactionResponse(4, { content: `Deposit **0.00000001**–**${formatRootsAtomicLocale(MAX_SEND)}** Roots (atomic ledger units).` });
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
      content: `Insufficient ROOTS to deposit. You have **${fmtRoots(have)} ROOTS**.`,
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
    content: `Deposited **${fmtRoots(amount)} ROOTS** into the **faucet pool**. Thank you!`,
  });
}

async function handleDiceCreate(
  db: D1Database,
  challengerId: string,
  opts: Array<Record<string, unknown>>,
): Promise<Response> {
  const opponentId = optSnowflake(opts, "opponent") ?? optSnowflakeDeep(opts, "opponent");
  const amountWhole = optNumber(opts, "amount") ?? optNumberDeep(opts, "amount");
  const units = amountWhole != null ? ledgerFromWholeRoots(amountWhole) : null;
  if (!opponentId || units == null) {
    return interactionResponse(4, {
      content: "Use **`/dice`** with **opponent** (user) and **amount** (Roots each puts in the pot, decimal).",
    });
  }
  if (units < MIN_SEND || units > MAX_SEND) {
    return interactionResponse(4, { content: `Amount must be **0.00000001**–**${formatRootsAtomicLocale(MAX_SEND)}** Roots.` });
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
      content: `You need at least **${fmtRoots(units)} ROOTS** to open this wager (you have **${fmtRoots(have)} ROOTS**).`,
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
    content: `<@${opponentId}> — <@${challengerId}> challenges you to **dice** for **${fmtRoots(units)} ROOTS** each (winner takes **${fmtRoots(units * 2)} ROOTS**).`,
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
        content: `Someone no longer has **${fmtRoots(units)} ROOTS** for this duel.`,
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
        content: `🎲 <@${chDid}> rolled **${r1}**, <@${opDid}> rolled **${r2}**. **Winner:** <@${winDid}> takes **${fmtRoots(units * 2)} ROOTS**!`,
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
            "**Commands:** `/bal`, `/economy`, `/send` (**ROOTS** ledger, **RRTT**/**SOL** on-chain via `/send user`), `/wallet`, `/deposit`, `/menu`, `/faucet`, `/dice`. Developer: `/screenshot`, `/snapshot`, `/activity`, `/token`, `/mint`. `/withdraw` & `/airdrop` soon.",
        },
      });
    }
    return jsonInteractionPayload({ type: 4, data: { content: "Unknown menu choice.", flags: 64 } });
  }
  return jsonInteractionPayload({ type: 4, data: { content: "Unknown component.", flags: 64 } });
}

function truncateText(raw: unknown, max: number): string {
  const s = String(raw ?? "").replace(/\s+/g, " ").trim();
  return s.length > max ? `${s.slice(0, Math.max(0, max - 1))}…` : s;
}

function jsonForArchive(value: unknown): string {
  return JSON.stringify(value, (_k, v) => (typeof v === "bigint" ? v.toString() : v), 2);
}

function parseJsonObject(raw: unknown): Record<string, unknown> | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function decodeHtmlEntities(raw: unknown): string {
  return String(raw ?? "")
    .replace(/&mdash;/g, "—")
    .replace(/&ndash;/g, "–")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

async function developerRoleIds(env: DiscordRootUnitsEnv): Promise<Set<string>> {
  const configured = String(env.DISCORD_DEVELOPER_ROLE_ID || "").trim();
  if (configured) return new Set([configured]);

  const bot = String(env.DISCORD_BOT_TOKEN || "").trim();
  const guildId = String(env.DISCORD_GUILD_ID || "").trim();
  if (!bot || !guildId) return new Set();

  try {
    const res = await fetch(`https://discord.com/api/v10/guilds/${encodeURIComponent(guildId)}/roles`, {
      headers: { Authorization: `Bot ${bot}`, "User-Agent": "RootRecord/discord-screenshot" },
    });
    if (!res.ok) return new Set();
    const roles = (await res.json()) as Array<Record<string, unknown>>;
    const match = roles.find((r) => String(r.name || "").trim().toLowerCase() === "developer");
    const id = String(match?.id || "").trim();
    return id ? new Set([id]) : new Set();
  } catch {
    return new Set();
  }
}

async function hasDeveloperRole(member: Record<string, unknown> | undefined, env: DiscordRootUnitsEnv): Promise<boolean> {
  const memberRoles = Array.isArray(member?.roles) ? member!.roles.map((r) => String(r)) : [];
  if (!memberRoles.length) return false;
  const allowed = await developerRoleIds(env);
  if (!allowed.size) return false;
  return memberRoles.some((r) => allowed.has(r));
}

async function dbAll<T>(db: D1Database, sql: string, ...binds: unknown[]): Promise<T[]> {
  try {
    let stmt = db.prepare(sql);
    if (binds.length) stmt = stmt.bind(...binds);
    const rows = await stmt.all<T>();
    return rows.results || [];
  } catch (e) {
    return [{ error: e instanceof Error ? e.message : String(e) } as T];
  }
}

async function dbFirst<T>(db: D1Database, sql: string, ...binds: unknown[]): Promise<T | null> {
  try {
    let stmt = db.prepare(sql);
    if (binds.length) stmt = stmt.bind(...binds);
    return await stmt.first<T>();
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) } as T;
  }
}

async function fetchRootRecordPageSummary(url: string): Promise<Record<string, unknown>> {
  try {
    const res = await fetch(url, { headers: { "User-Agent": "RootRecord/discord-screenshot" } });
    const text = await res.text();
    const title = text.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "";
    const description =
      text.match(/<meta\s+name=["']description["']\s+content=["']([^"']*)["']/i)?.[1] ||
      text.match(/<meta\s+content=["']([^"']*)["']\s+name=["']description["']/i)?.[1] ||
      "";
    const h1 = text.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || "";
    return {
      url,
      status: res.status,
      title: truncateText(decodeHtmlEntities(title.replace(/<[^>]+>/g, "")), 160),
      description: truncateText(decodeHtmlEntities(description), 260),
      h1: truncateText(decodeHtmlEntities(h1.replace(/<[^>]+>/g, "")), 180),
      bytes: text.length,
    };
  } catch (e) {
    return { url, error: e instanceof Error ? e.message : String(e) };
  }
}

async function fetchRootRecordTweets(env: DiscordRootUnitsEnv): Promise<Record<string, unknown>> {
  const bearer = String(env.GROK_X_BEARER_TOKEN || "").trim();
  const username = String(env.GROK_X_USERNAME || "rootrecord").replace(/^@/, "").trim() || "rootrecord";
  if (!bearer) return { configured: false, username };

  const headers = { Authorization: `Bearer ${bearer}`, "User-Agent": "RootRecord/discord-screenshot" };
  try {
    const userRes = await fetch(`https://api.twitter.com/2/users/by/username/${encodeURIComponent(username)}`, { headers });
    const userJson = (await userRes.json().catch(() => ({}))) as Record<string, unknown>;
    const userId = String((userJson.data as Record<string, unknown> | undefined)?.id || "").trim();
    if (!userRes.ok || !userId) return { configured: true, username, status: userRes.status, error: userJson };
    const q = new URLSearchParams({
      max_results: "5",
      exclude: "retweets,replies",
      "tweet.fields": "created_at,public_metrics",
    });
    const twRes = await fetch(`https://api.twitter.com/2/users/${encodeURIComponent(userId)}/tweets?${q}`, { headers });
    const twJson = (await twRes.json().catch(() => ({}))) as Record<string, unknown>;
    return { configured: true, username, status: twRes.status, tweets: twJson };
  } catch (e) {
    return { configured: true, username, error: e instanceof Error ? e.message : String(e) };
  }
}

async function fetchRootRecordReddit(): Promise<Record<string, unknown>> {
  const url = "https://www.reddit.com/r/rootrecord/new.json?limit=10";
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "RootRecord/discord-ai-report/1.0 (community usage scan)" },
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    const children = Array.isArray((data.data as Record<string, unknown> | undefined)?.children)
      ? ((data.data as Record<string, unknown>).children as Array<Record<string, unknown>>)
      : [];
    const posts = children
      .map((child) => {
        const p = (child.data as Record<string, unknown> | undefined) || {};
        return {
          id: String(p.id || ""),
          title: truncateText(p.title, 160),
          author: String(p.author || ""),
          score: n(p.score),
          comments: n(p.num_comments),
          created_utc: n(p.created_utc),
          permalink: p.permalink ? `https://www.reddit.com${String(p.permalink)}` : "",
          selftext: truncateText(p.selftext, 320),
        };
      })
      .filter((p) => p.id && p.title);
    return { configured: true, subreddit: "r/rootrecord", status: res.status, posts };
  } catch (e) {
    return { configured: true, subreddit: "r/rootrecord", error: e instanceof Error ? e.message : String(e) };
  }
}

function pct(part: number, total: number): number {
  if (!Number.isFinite(part) || !Number.isFinite(total) || total <= 0) return 0;
  return Math.round((part / total) * 1000) / 10;
}

function enrichAppUsageRows(appDays: unknown, sessionRows: unknown, openRows: unknown): Array<Record<string, unknown>> {
  const dayRows = Array.isArray(appDays) ? appDays : [];
  const sessionList = Array.isArray(sessionRows) ? sessionRows : [];
  const openList = Array.isArray(openRows) ? openRows : [];
  const byApp = new Map<string, Record<string, unknown>>();

  for (const raw of dayRows) {
    const row = raw as Record<string, unknown>;
    const appId = String(row.app_id || "").trim();
    if (!appId || row.error) continue;
    byApp.set(appId, {
      app_id: appId,
      units_earned: Math.max(0, Math.floor(n(row.units_earned))),
      active_days: Math.max(0, Math.floor(n(row.active_days))),
    });
  }
  for (const raw of sessionList) {
    const row = raw as Record<string, unknown>;
    const appId = String(row.app_id || "").trim();
    if (!appId || row.error) continue;
    const entry = byApp.get(appId) || { app_id: appId, units_earned: 0, active_days: 0 };
    entry.sec_on_page = Math.max(0, Math.floor(n(row.sec_on_page)));
    entry.active_users = Math.max(0, Math.floor(n(row.active_users)));
    entry.latest_heartbeat_at = row.latest_heartbeat_at || null;
    byApp.set(appId, entry);
  }
  for (const raw of openList) {
    const row = raw as Record<string, unknown>;
    const appId = String(row.app_id || "").trim();
    if (!appId || row.error) continue;
    const entry = byApp.get(appId) || { app_id: appId, units_earned: 0, active_days: 0 };
    entry.recent_open_users = Math.max(0, Math.floor(n(row.recent_open_users)));
    entry.latest_open_at = row.latest_open_at || null;
    byApp.set(appId, entry);
  }

  const rows = [...byApp.values()];
  const totalUnits = rows.reduce((sum, row) => sum + n(row.units_earned), 0);
  const totalSeconds = rows.reduce((sum, row) => sum + n(row.sec_on_page), 0);
  for (const row of rows) {
    row.earned_share_pct = pct(n(row.units_earned), totalUnits);
    row.time_share_pct = pct(n(row.sec_on_page), totalSeconds);
  }
  rows.sort((a, b) => n(b.time_share_pct) - n(a.time_share_pct) || n(b.units_earned) - n(a.units_earned));
  return rows;
}

async function collectDiscordActivityReportData(env: DiscordRootUnitsEnv, requesterDiscordId: string): Promise<Record<string, unknown>> {
  const nowIso = new Date().toISOString();
  const [
    totals,
    daily,
    channels,
    topUsers,
    linkedActive,
    recentMessages,
    discoveredChannels,
    announcements,
  ] = await Promise.all([
    dbFirst(
      env.DB,
      `SELECT COUNT(*) AS tracked_users,
              COALESCE(SUM(message_count), 0) AS tracked_user_messages,
              COALESCE(SUM(CASE WHEN last_message_at >= datetime('now', '-7 days') THEN 1 ELSE 0 END), 0) AS active_users_7d,
              COALESCE(SUM(CASE WHEN last_message_at >= datetime('now', '-30 days') THEN 1 ELSE 0 END), 0) AS active_users_30d,
              MAX(last_message_at) AS latest_message_at
       FROM discord_user_activity`,
    ),
    dbAll(
      env.DB,
      `SELECT day, message_count
       FROM discord_activity_daily
       ORDER BY day DESC
       LIMIT 30`,
    ),
    dbAll(
      env.DB,
      `SELECT c.channel_id,
              COALESCE(d.name, c.channel_id) AS channel_name,
              d.type AS channel_type,
              COALESCE(SUM(c.message_count), 0) AS message_count,
              MAX(c.day) AS latest_day
       FROM discord_activity_daily_by_channel c
       LEFT JOIN discord_discovered_channels d ON d.channel_id = c.channel_id
       WHERE c.day >= date('now', '-30 days')
       GROUP BY c.channel_id
       ORDER BY message_count DESC
       LIMIT 25`,
    ),
    dbAll(
      env.DB,
      `SELECT discord_user_id,
              username,
              global_name,
              last_message_at,
              message_count
       FROM discord_user_activity
       WHERE last_message_at >= datetime('now', '-30 days')
       ORDER BY message_count DESC, last_message_at DESC
       LIMIT 25`,
    ),
    dbAll(
      env.DB,
      `SELECT l.account_id,
              l.email,
              a.discord_user_id,
              a.username,
              a.global_name,
              a.last_message_at,
              a.message_count
       FROM discord_account_links l
       INNER JOIN discord_user_activity a ON a.discord_user_id = l.discord_user_id
       WHERE a.last_message_at >= datetime('now', '-30 days')
       ORDER BY a.last_message_at DESC
       LIMIT 25`,
    ),
    dbAll(
      env.DB,
      `SELECT s.discord_message_id,
              s.channel_id,
              COALESCE(d.name, s.channel_id) AS channel_name,
              s.created_at
       FROM discord_channel_message_stats s
       LEFT JOIN discord_discovered_channels d ON d.channel_id = s.channel_id
       ORDER BY s.created_at DESC
       LIMIT 25`,
    ),
    dbAll(
      env.DB,
      `SELECT channel_id, guild_id, name, type, position, parent_id, updated_at
       FROM discord_discovered_channels
       ORDER BY position ASC, name ASC
       LIMIT 75`,
    ),
    dbAll(
      env.DB,
      `SELECT app_scope, title, body, created_at
       FROM developer_messages
       ORDER BY created_at DESC
       LIMIT 12`,
    ),
  ]);

  const days = (Array.isArray(daily) ? daily : []) as Array<Record<string, unknown>>;
  const totalMessages30d = days.reduce((sum, row) => sum + n((row as Record<string, unknown>).message_count), 0);
  const mostRecentDay = days[0] as Record<string, unknown> | undefined;
  const previousDay = days[1] as Record<string, unknown> | undefined;

  return {
    generated_at: nowIso,
    requested_by_discord_id: requesterDiscordId,
    purpose: "Developer-only Discord activity report for Root Record community operations",
    source_tables: [
      "discord_activity_daily",
      "discord_activity_daily_by_channel",
      "discord_channel_message_stats",
      "discord_discovered_channels",
      "discord_user_activity",
      "discord_account_links",
      "developer_messages",
    ],
    totals,
    calculated: {
      total_messages_30d: totalMessages30d,
      latest_day: mostRecentDay?.day || null,
      latest_day_messages: n(mostRecentDay?.message_count),
      previous_day_messages: n(previousDay?.message_count),
      latest_day_delta: n(mostRecentDay?.message_count) - n(previousDay?.message_count),
    },
    daily_30d: daily,
    channel_activity_30d: channels,
    top_users_30d: topUsers,
    linked_active_users_30d: linkedActive,
    recent_messages: recentMessages,
    discovered_channels: discoveredChannels,
    recent_announcements_feed: announcements,
  };
}

async function loadRecentActivityAiReport(env: DiscordRootUnitsEnv, maxAgeMs: number): Promise<Record<string, unknown> | null> {
  const row = await dbFirst<{ id: string; created_at: string; prompt_json: string; response_json: string }>(
    env.DB,
    `SELECT id, created_at, prompt_json, response_json
     FROM discord_ai_reports
     WHERE command_name = '/activity'
     ORDER BY created_at DESC
     LIMIT 1`,
  );
  if (!row || (row as Record<string, unknown>).error) return null;
  const createdMs = Date.parse(row.created_at);
  if (!Number.isFinite(createdMs) || Date.now() - createdMs > maxAgeMs) return null;
  const response = parseJsonObject(row.response_json);
  const final = (response?.final as Record<string, unknown> | undefined) || response;
  const prompt = parseJsonObject(row.prompt_json);
  return {
    id: row.id,
    created_at: row.created_at,
    generated_for_snapshot: false,
    content: truncateText(String(final?.content || final?.fallback || ""), 1800),
    status: final?.status || null,
    summary_metrics: (prompt?.calculated as Record<string, unknown> | undefined) || null,
  };
}

async function generateDiscordActivityAiReport(
  env: DiscordRootUnitsEnv,
  requesterDiscordId: string,
  discord: { interactionId: string; channelId: string; guildId: string; userId: string },
  opts: { generatedForSnapshot?: boolean } = {},
): Promise<Record<string, unknown>> {
  const reportData = await collectDiscordActivityReportData(env, requesterDiscordId);
  const archiveId = crypto.randomUUID();
  const final = await callGrokAnalysis(
    env,
    "Discord Activity Report",
    "Analyze Discord-only activity for the Root Record community. Focus on channel utilization, message trends, active/linked member signals, announcement feed activity, and operational watch items. Avoid token price or ROOTS balance analysis unless the Discord activity directly references it. Return Discord-ready Markdown sections: Activity Pulse, Channels, Member Signals, Watch Items, Recommended Actions.",
    reportData,
  );
  await postAiChannelMessage(env, {
    content: `**/activity Discord report ${archiveId.slice(0, 8)}${opts.generatedForSnapshot ? " (snapshot refresh)" : ""}**\n${String(final.content || "No activity AI content returned.").slice(0, 1700)}`,
  });
  await archiveAiReport(
    env,
    "/activity",
    {
      id: archiveId,
      created_at: new Date().toISOString(),
      prompt: reportData,
      response: { final },
    },
    discord,
  );
  return {
    id: archiveId,
    created_at: new Date().toISOString(),
    generated_for_snapshot: Boolean(opts.generatedForSnapshot),
    content: truncateText(String(final.content || final.fallback || "Discord activity report generated."), 1800),
    status: final.status || null,
    summary_metrics: reportData.calculated as Record<string, unknown>,
  };
}

async function collectScreenshotReportData(env: DiscordRootUnitsEnv, requesterDiscordId: string): Promise<Record<string, unknown>> {
  const nowIso = new Date().toISOString();
  const [
    leaderboard,
    circulation,
    daily,
    x,
    reddit,
    website,
    accounts,
    balances,
    appDays,
    appSessionTime,
    appRecentOpens,
    photos,
    messages,
    errors,
    discordActivity,
  ] =
    await Promise.all([
      loadEconomyLeaderboardData(env.DB).catch((e) => ({ error: e instanceof Error ? e.message : String(e) })),
      readCirculationTotals(env.DB).catch((e) => ({ error: e instanceof Error ? e.message : String(e) })),
      loadEconomyDailySeries(env.DB, 14).catch((e) => [{ error: e instanceof Error ? e.message : String(e) }]),
      fetchRootRecordTweets(env),
      fetchRootRecordReddit(),
      Promise.all(
        [
          "https://rootrecord.info/",
          "https://rootrecord.info/products/rootunits/",
          "https://rootrecord.info/beta-tester-rewards.html",
          "https://rootrecord.info/charts/root-economy/",
          "https://rootrecord.info/products.html",
        ].map(fetchRootRecordPageSummary),
      ),
      dbFirst(env.DB, `SELECT COUNT(*) AS total_accounts FROM license_accounts`),
      dbFirst(env.DB, `SELECT COUNT(*) AS accounts_with_balance, COALESCE(SUM(balance), 0) AS total_balance FROM rr_earn_balance WHERE balance > 0`),
      dbAll(
        env.DB,
        `SELECT app_id, SUM(units_earned) AS units_earned, COUNT(*) AS active_days
         FROM rr_earn_app_day
         WHERE ymd >= date('now', '-14 days')
         GROUP BY app_id
         ORDER BY units_earned DESC
         LIMIT 20`,
      ),
      dbAll(
        env.DB,
        `SELECT app_id, COUNT(*) AS active_users, COALESCE(SUM(sec_on_page), 0) AS sec_on_page, MAX(updated_at) AS latest_heartbeat_at
         FROM rr_earn_state
         GROUP BY app_id
         ORDER BY sec_on_page DESC
         LIMIT 20`,
      ),
      dbAll(
        env.DB,
        `SELECT app_id, COUNT(DISTINCT user_id) AS recent_open_users, MAX(last_open_at) AS latest_open_at
         FROM rr_app_session_last_open
         WHERE last_open_at >= datetime('now', '-14 days')
         GROUP BY app_id
         ORDER BY recent_open_users DESC
         LIMIT 20`,
      ),
      dbAll(
        env.DB,
        `SELECT status, COUNT(*) AS count
         FROM volcano_photo_submissions
         GROUP BY status
         ORDER BY status ASC`,
      ),
      dbAll(
        env.DB,
        `SELECT app_scope, title, body, created_at
         FROM developer_messages
         ORDER BY created_at DESC
         LIMIT 10`,
      ),
      dbAll(
        env.DB,
        `SELECT method, path_redacted, status, duration_ms, message, created_at
         FROM worker_http_error_events
         ORDER BY created_at DESC
         LIMIT 10`,
      ),
      dbAll(
        env.DB,
        `SELECT day, message_count
         FROM discord_activity_daily
         ORDER BY day DESC
         LIMIT 20`,
      ),
    ]);

  return {
    generated_at: nowIso,
    requested_by_discord_id: requesterDiscordId,
    purpose: "Root Record ecosystem report for Discord /screenshot",
    root_economy: { circulation, daily, leaderboard },
    rootrecord_x: x,
    reddit,
    website,
    accounts,
    balances,
    app_usage_14d: enrichAppUsageRows(appDays, appSessionTime, appRecentOpens),
    app_usage_raw: { earned_14d: appDays, session_time: appSessionTime, recent_opens: appRecentOpens },
    volcano_photos: photos,
    developer_messages: messages,
    recent_worker_errors: errors,
    discord_activity: discordActivity,
  };
}

async function loadPreviousScreenshotReport(env: DiscordRootUnitsEnv): Promise<Record<string, unknown> | null> {
  const row = await dbFirst<{ id: string; created_at: string; prompt_json: string; response_json: string }>(
    env.DB,
    `SELECT id, created_at, prompt_json, response_json
     FROM discord_screenshot_reports
     ORDER BY created_at DESC
     LIMIT 1`,
  );
  if (!row || (row as Record<string, unknown>).error) return null;
  const prompt = parseJsonObject(row.prompt_json);
  if (prompt) delete prompt.previous_report;
  const response = parseJsonObject(row.response_json);
  const reportResponse = (response?.report as Record<string, unknown> | undefined) || response;
  const content = truncateText(String(reportResponse?.content || reportResponse?.fallback || ""), 1800);
  return {
    id: row.id,
    created_at: row.created_at,
    prompt,
    content,
  };
}

async function callGrokReport(env: DiscordRootUnitsEnv, reportData: Record<string, unknown>): Promise<Record<string, unknown>> {
  const token = String(env.GROK_API_BEARER_TOKEN || "").trim();
  const apiUrl = String(env.GROK_API_URL || "https://api.x.ai/v1/chat/completions").trim();
  const model = String(env.GROK_MODEL || "grok-3-latest").trim();
  const prompt =
    "Create a concise Discord-ready Root Record ecosystem report. Use only the provided data. " +
    "Move focus away from ROOTS balances and toward actual app usage, service utilization, user activity, product updates, and community signals. " +
    "Compare current data to previous_report when present. Use clean Markdown sections: Since Last Report, App Usage & Services, Community Signals, Watch Items, X Copy. " +
    "Use app_usage_14d earned_share_pct and time_share_pct to compare apps. Mention Reddit r/rootrecord when posts exist. " +
    "Use discord_activity_ai_report as the Discord-specific subreport and fold its findings into Community Signals and Watch Items. " +
    "X Copy must be a short copy-pasteable post with no hashtags. Keep token/internal balance details secondary unless they explain adoption. " +
    "Keep the full response under 1800 characters and do not mention secrets or internal tokens.";
  const body = {
    model,
    messages: [
      { role: "system", content: prompt },
      { role: "user", content: jsonForArchive(reportData) },
    ],
    temperature: 0.3,
  };

  if (!token) {
    return {
      ok: false,
      detail: "Grok API bearer token is not configured.",
      fallback: buildFallbackScreenshotPost(reportData),
      request: body,
    };
  }

  try {
    const res = await fetch(apiUrl, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    const content = String(
      (((data.choices as Array<Record<string, unknown>> | undefined)?.[0]?.message as Record<string, unknown> | undefined)
        ?.content as string | undefined) || "",
    ).trim();
    return {
      ok: res.ok && Boolean(content),
      status: res.status,
      content: content || buildFallbackScreenshotPost(reportData),
      request: body,
      response: data,
    };
  } catch (e) {
    return {
      ok: false,
      detail: e instanceof Error ? e.message : String(e),
      content: buildFallbackScreenshotPost(reportData),
      request: body,
    };
  }
}

async function callGrokSocialUpdate(
  env: DiscordRootUnitsEnv,
  reportData: Record<string, unknown>,
  reportEmbeds: DiscordEmbed[],
): Promise<Record<string, unknown>> {
  const token = String(env.GROK_API_BEARER_TOKEN || "").trim();
  const apiUrl = String(env.GROK_API_URL || "https://api.x.ai/v1/chat/completions").trim();
  const model = String(env.GROK_MODEL || "grok-3-latest").trim();
  const prompt =
    "You are drafting a short daily Root Record community update after reviewing the generated ecosystem report. " +
    "Return two clearly labeled sections: DISCORD and X. Keep both short. Include only meaningful changes, one daily unique update angle, and no hashtags. " +
    "Do not mention internal archive ids, secrets, raw JSON, prompts, or unavailable data.";
  const body = {
    model,
    messages: [
      { role: "system", content: prompt },
      {
        role: "user",
        content: jsonForArchive({
          current_report_data: reportData,
          original_discord_report: reportEmbeds,
          fallback_social_update: buildSocialUpdateFallback(reportData),
        }),
      },
    ],
    temperature: 0.45,
  };

  if (!token) {
    return {
      ok: false,
      detail: "Grok API bearer token is not configured.",
      content: buildSocialUpdateFallback(reportData),
      request: body,
    };
  }

  try {
    const res = await fetch(apiUrl, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    const content = String(
      (((data.choices as Array<Record<string, unknown>> | undefined)?.[0]?.message as Record<string, unknown> | undefined)
        ?.content as string | undefined) || "",
    ).trim();
    return {
      ok: res.ok && Boolean(content),
      status: res.status,
      content: content || buildSocialUpdateFallback(reportData),
      request: body,
      response: data,
    };
  } catch (e) {
    return {
      ok: false,
      detail: e instanceof Error ? e.message : String(e),
      content: buildSocialUpdateFallback(reportData),
      request: body,
    };
  }
}

function n(raw: unknown): number {
  const v = Number(raw);
  return Number.isFinite(v) ? v : 0;
}

function compactList(items: string[], maxItems: number): string {
  const kept = items.filter(Boolean).slice(0, maxItems);
  return kept.length ? kept.join(", ") : "none";
}

function reportTimestamp(raw: unknown): string {
  const ms = Date.parse(String(raw || ""));
  if (!Number.isFinite(ms)) return String(raw || "");
  return `<t:${Math.floor(ms / 1000)}:f>`;
}

function formatPhotoQueue(rows: unknown): string {
  if (!Array.isArray(rows) || !rows.length) return "unavailable";
  return rows
    .map((r) => {
      const row = r as Record<string, unknown>;
      return `${String(row.status || "unknown")}: ${n(row.count).toLocaleString()}`;
    })
    .join(" / ");
}

function formatTopHolders(leaderboard: Record<string, unknown> | undefined): string {
  const entries = Array.isArray(leaderboard?.entries) ? leaderboard!.entries.slice(0, 3) : [];
  if (!entries.length) return "No leaderboard rows returned.";
  return entries
    .map((raw, i) => {
      const e = raw as {
        balance?: number;
        public_display_name?: string | null;
        discord_username?: string | null;
        discord_global_name?: string | null;
        wallet_short?: string;
        farms_plots_unlocked?: number;
        farms_rows_accumulated?: number;
      };
      const label = truncateText(leaderboardEntryLabel({ rank: i + 1, balance: n(e.balance), wallet_short: String(e.wallet_short || ""), public_display_name: e.public_display_name || null, discord_username: e.discord_username || null, discord_global_name: e.discord_global_name || null, farms_plots_unlocked: n(e.farms_plots_unlocked), farms_rows_accumulated: n(e.farms_rows_accumulated) }), 32);
      return `#${i + 1} ${label} (${formatRootsAtomicLocale(n(e.balance))} ROOTS)`;
    })
    .join("\n");
}

function formatAppUsage(rows: unknown): string {
  if (!Array.isArray(rows) || !rows.length) return "No 14-day app usage rows returned.";
  return compactList(
    rows.slice(0, 5).map((raw) => {
      const row = raw as Record<string, unknown>;
      const time = n(row.time_share_pct) > 0 ? `, ${n(row.time_share_pct).toFixed(1)}% time` : "";
      const users = n(row.recent_open_users || row.active_users);
      return `${String(row.app_id || "unknown")}: ${n(row.earned_share_pct).toFixed(1)}% rewards${time}, ${users.toLocaleString()} users`;
    }),
    5,
  );
}

function formatRedditSummary(reddit: Record<string, unknown> | undefined): string {
  if (!reddit) return "Reddit r/rootrecord scan unavailable.";
  if (reddit.error) return `Reddit r/rootrecord error: ${truncateText(reddit.error, 100)}`;
  const posts = Array.isArray(reddit.posts) ? reddit.posts : [];
  if (!posts.length) return "Reddit r/rootrecord: no recent posts returned.";
  return compactList(
    posts.slice(0, 3).map((raw) => {
      const p = raw as Record<string, unknown>;
      const comments = n(p.comments);
      return `${truncateText(p.title, 70)} (${comments.toLocaleString()} comments)`;
    }),
    3,
  );
}

function formatXSummary(rootrecordX: Record<string, unknown> | undefined): string {
  if (!rootrecordX?.configured) return "@rootrecord lookup not configured.";
  const tweets = rootrecordX.tweets as Record<string, unknown> | undefined;
  const data = Array.isArray(tweets?.data) ? tweets!.data : [];
  if (!data.length) {
    const status = rootrecordX.status ? `status ${rootrecordX.status}` : "no posts returned";
    return `@rootrecord: ${status}.`;
  }
  const first = data[0] as Record<string, unknown>;
  const text = truncateText(first.text, 135);
  const created = first.created_at ? ` (${reportTimestamp(first.created_at)})` : "";
  return `@rootrecord latest${created}: ${text}`;
}

function formatWebsiteSummary(rows: unknown): string {
  if (!Array.isArray(rows) || !rows.length) return "Website snapshots unavailable.";
  const ok = rows.filter((raw) => n((raw as Record<string, unknown>).status) >= 200 && n((raw as Record<string, unknown>).status) < 400).length;
  const highlights = rows.slice(0, 2).map((raw) => {
    const row = raw as Record<string, unknown>;
    const title = truncateText(row.title || row.h1 || row.url, 36);
    return `${title} (${row.status || "?"})`;
  });
  return `${ok}/${rows.length} pages reachable: ${compactList(highlights, 2)}`;
}

function formatOpsSummary(reportData: Record<string, unknown>): string {
  const errors = Array.isArray(reportData.recent_worker_errors) ? reportData.recent_worker_errors : [];
  const discordDays = Array.isArray(reportData.discord_activity) ? reportData.discord_activity : [];
  const recentErrors = errors.filter((raw) => !(raw as Record<string, unknown>).error).slice(0, 2);
  const discordMessages = discordDays.reduce((sum, raw) => sum + n((raw as Record<string, unknown>).message_count), 0);
  const errText = recentErrors.length
    ? recentErrors
        .map((raw) => {
          const row = raw as Record<string, unknown>;
          return `${row.status || "?"} ${truncateText(row.path_redacted || row.message || "worker event", 44)}`;
        })
        .join("; ")
    : "no recent worker errors returned";
  return `Discord messages tracked: ${discordMessages.toLocaleString()} recent. Worker signals: ${errText}.`;
}

function formatDiscordActivityAiSummary(reportData: Record<string, unknown>): string {
  const activity = reportData.discord_activity_ai_report as Record<string, unknown> | undefined;
  if (!activity) return "Discord activity AI report unavailable.";
  const age = activity.generated_for_snapshot ? "fresh" : "recent";
  const content = truncateText(activity.content || activity.fallback || "No activity report text.", 620);
  return `${age} activity pass ${activity.id ? `(${String(activity.id).slice(0, 8)})` : ""}: ${content}`;
}

function reportMetrics(reportData: Record<string, unknown> | null | undefined): {
  accounts: number;
  circulation: number;
  holders: number;
  topHolder: string;
  appLeader: string;
  appLeaderUnits: number;
  workerErrorCount: number;
} {
  const economy = reportData?.root_economy as Record<string, unknown> | undefined;
  const circulation = economy?.circulation as Record<string, unknown> | undefined;
  const balances = reportData?.balances as Record<string, unknown> | null | undefined;
  const accounts = reportData?.accounts as Record<string, unknown> | null | undefined;
  const leaderboard = economy?.leaderboard as Record<string, unknown> | undefined;
  const entries = Array.isArray(leaderboard?.entries) ? leaderboard!.entries : [];
  const top = entries[0] as
    | {
        balance?: number;
        wallet_short?: string;
        public_display_name?: string | null;
        discord_username?: string | null;
        discord_global_name?: string | null;
        farms_plots_unlocked?: number;
        farms_rows_accumulated?: number;
      }
    | undefined;
  const topHolder = top
    ? leaderboardEntryLabel({
        rank: 1,
        balance: n(top.balance),
        wallet_short: String(top.wallet_short || ""),
        public_display_name: top.public_display_name || null,
        discord_username: top.discord_username || null,
        discord_global_name: top.discord_global_name || null,
        farms_plots_unlocked: n(top.farms_plots_unlocked),
        farms_rows_accumulated: n(top.farms_rows_accumulated),
      })
    : "none";
  const appRows = Array.isArray(reportData?.app_usage_14d) ? reportData!.app_usage_14d : [];
  const appTop = appRows[0] as Record<string, unknown> | undefined;
  const errors = Array.isArray(reportData?.recent_worker_errors) ? reportData!.recent_worker_errors : [];
  return {
    accounts: n(accounts?.total_accounts),
    circulation: n(circulation?.total_circulation || balances?.total_balance),
    holders: n(circulation?.account_count || balances?.accounts_with_balance),
    topHolder,
    appLeader: String(appTop?.app_id || "none"),
    appLeaderUnits: n(appTop?.units_earned),
    workerErrorCount: errors.filter((raw) => !(raw as Record<string, unknown>).error).length,
  };
}

function signedDelta(current: number, previous: number, kind: "count" | "roots"): string {
  const delta = Math.floor(current) - Math.floor(previous);
  if (!delta) return kind === "count" ? "no change" : "no change";
  const sign = delta > 0 ? "+" : "-";
  if (kind === "roots") return `${sign}${formatRootsAtomicLocale(Math.abs(delta))} ROOTS`;
  return `${sign}${Math.abs(delta).toLocaleString()}`;
}

function previousPrompt(reportData: Record<string, unknown>): Record<string, unknown> | null {
  const previous = reportData.previous_report as Record<string, unknown> | undefined;
  return (previous?.prompt as Record<string, unknown> | null | undefined) || null;
}

function formatComparison(reportData: Record<string, unknown>): string {
  const previous = previousPrompt(reportData);
  if (!previous) return "First archived comparison run; future reports will show movement here.";
  const cur = reportMetrics(reportData);
  const prev = reportMetrics(previous);
  const topText = cur.topHolder === prev.topHolder ? `Top holder unchanged: ${truncateText(cur.topHolder, 36)}` : `Top holder changed: ${truncateText(prev.topHolder, 24)} → ${truncateText(cur.topHolder, 24)}`;
  return [
    `• Accounts: **${signedDelta(cur.accounts, prev.accounts, "count")}** (${cur.accounts.toLocaleString()} total)`,
    `• Circulation: **${signedDelta(cur.circulation, prev.circulation, "roots")}** (${formatRootsAtomicLocale(cur.circulation)} ROOTS total)`,
    `• ${topText}`,
    `• App leader: ${cur.appLeader} (${formatRootsAtomicLocale(cur.appLeaderUnits)} ROOTS / 14d)`,
  ].join("\n");
}

function buildXCopy(reportData: Record<string, unknown>): string {
  const cur = reportMetrics(reportData);
  const previous = previousPrompt(reportData);
  const prev = reportMetrics(previous);
  const movement = previous
    ? `Accounts ${signedDelta(cur.accounts, prev.accounts, "count")}; circulation ${signedDelta(cur.circulation, prev.circulation, "roots")}.`
    : "First comparison snapshot archived.";
  const xSignal = formatXSummary(reportData.rootrecord_x as Record<string, unknown> | undefined)
    .replace(/^@rootrecord latest(?: \([^)]*\))?:\s*/i, "Latest RootRecord update: ")
    .replace(/^@rootrecord:\s*/i, "RootRecord X: ");
  const appUsage = formatAppUsage(reportData.app_usage_14d);
  return truncateText(
    [
      "Root Record ecosystem update:",
      `${cur.accounts.toLocaleString()} accounts are using Root Record services.`,
      movement,
      `App usage: ${appUsage}.`,
      xSignal,
    ].join(" "),
    420,
  );
}

function buildSocialUpdateFallback(reportData: Record<string, unknown>): string {
  const cur = reportMetrics(reportData);
  const previous = previousPrompt(reportData);
  const movement = previous
    ? `Accounts ${signedDelta(cur.accounts, reportMetrics(previous).accounts, "count")}; circulation ${signedDelta(cur.circulation, reportMetrics(previous).circulation, "roots")}.`
    : "First daily comparison snapshot is now archived.";
  const xCopy = buildXCopy(reportData);
  const discordCopy = truncateText(
    [
      "Daily Root Record update:",
      `${cur.accounts.toLocaleString()} accounts are tracked across Root Record services.`,
      movement,
      `App usage mix: ${formatAppUsage(reportData.app_usage_14d)}.`,
    ].join(" "),
    650,
  );
  return [`**DISCORD**`, discordCopy, "", `**X**`, xCopy].join("\n");
}

function buildSocialUpdateEmbed(social: Record<string, unknown>): DiscordEmbed[] {
  const content = fieldValue(social.content || "Daily update generated.", 1800);
  return [
    {
      title: "Daily Social Update Draft",
      description: "Short copy for Discord and X. No hashtags.",
      color: 0x1d9bf0,
      fields: [{ name: "Copy", value: content }],
    },
  ];
}

type DiscordEmbed = {
  title?: string;
  description?: string;
  color?: number;
  fields?: Array<{ name: string; value: string; inline?: boolean }>;
  footer?: { text: string };
  timestamp?: string;
};

function fieldValue(raw: unknown, max = 980): string {
  const s = String(raw ?? "").trim();
  if (!s) return "No data returned.";
  return s.length > max ? `${s.slice(0, Math.max(0, max - 1))}…` : s;
}

async function postAiChannelMessage(
  env: DiscordRootUnitsEnv,
  payload: { content?: string; embeds?: DiscordEmbed[]; username?: string },
): Promise<void> {
  const webhook = String(env.DISCORD_GROK_WEBHOOK_URL || "").trim();
  if (!webhook) return;
  const body: Record<string, unknown> = {
    username: payload.username || "Root Record AI",
  };
  if (payload.content) body.content = truncateText(payload.content, 1900);
  if (payload.embeds?.length) body.embeds = payload.embeds;
  if (!body.content && !body.embeds) body.content = "Root Record AI report update.";
  try {
    const res = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error("discord_ai_channel_post", res.status, text.slice(0, 300));
    }
  } catch (e) {
    console.error("discord_ai_channel_post", e instanceof Error ? e.message : String(e));
  }
}

function buildScreenshotReportEmbeds(reportData: Record<string, unknown>, archiveId: string): DiscordEmbed[] {
  const economy = reportData.root_economy as Record<string, unknown> | undefined;
  const circulation = economy?.circulation as Record<string, unknown> | undefined;
  const leaderboard = economy?.leaderboard as Record<string, unknown> | undefined;
  const accounts = reportData.accounts as Record<string, unknown> | null | undefined;
  const balances = reportData.balances as Record<string, unknown> | null | undefined;
  const holders = n(circulation?.account_count || balances?.accounts_with_balance);
  const total = n(circulation?.total_circulation || balances?.total_balance);
  const generated = String(reportData.generated_at || new Date().toISOString());

  return [
    {
      title: "Root Record Ecosystem Report",
      description: `Generated ${reportTimestamp(generated)} from live Worker, app usage, website, Discord, X, and Reddit data.`,
      color: 0x00a37a,
      timestamp: generated,
      fields: [
        {
          name: "Since Last Report",
          value: fieldValue(formatComparison(reportData)),
        },
        {
          name: "Account Snapshot",
          value: fieldValue(
            [
              `Accounts: **${n(accounts?.total_accounts).toLocaleString()}**`,
              `Internal ROOTS: **${formatRootsAtomicLocale(total)}**`,
              `Holders: **${holders.toLocaleString()}**`,
            ].join("\n"),
          ),
          inline: true,
        },
        {
          name: "Queues",
          value: fieldValue([`Photos: ${formatPhotoQueue(reportData.volcano_photos)}`, formatOpsSummary(reportData)].join("\n")),
          inline: true,
        },
        {
          name: "App Usage Mix",
          value: fieldValue(formatAppUsage(reportData.app_usage_14d)),
        },
        {
          name: "Content Signals",
          value: fieldValue(
            [
              formatXSummary(reportData.rootrecord_x as Record<string, unknown> | undefined),
              `Reddit: ${formatRedditSummary(reportData.reddit as Record<string, unknown> | undefined)}`,
              `Discord: ${formatDiscordActivityAiSummary(reportData)}`,
              `Website: ${formatWebsiteSummary(reportData.website)}`,
            ].join("\n"),
          ),
        },
        {
          name: "Top Holders (Secondary)",
          value: fieldValue(formatTopHolders(leaderboard)),
        },
      ],
      footer: { text: `Raw JSON saved: ${archiveId.slice(0, 8)}` },
    },
  ];
}

function buildFallbackScreenshotPost(reportData: Record<string, unknown>): string {
  const economy = reportData.root_economy as Record<string, unknown> | undefined;
  const circulation = economy?.circulation as Record<string, unknown> | undefined;
  const leaderboard = economy?.leaderboard as Record<string, unknown> | undefined;
  const accounts = reportData.accounts as Record<string, unknown> | null | undefined;
  const balances = reportData.balances as Record<string, unknown> | null | undefined;
  const photos = Array.isArray(reportData.volcano_photos) ? reportData.volcano_photos : [];
  const holders = n(circulation?.account_count || balances?.accounts_with_balance);
  const total = n(circulation?.total_circulation || balances?.total_balance);
  return [
    "**Root Record Ecosystem Report**",
    `_Generated ${reportTimestamp(reportData.generated_at)} from live Worker, app usage, website, Discord, X, and Reddit data._`,
    "",
    "**Since Last Report**",
    formatComparison(reportData),
    "",
    "**Usage & Services**",
    `• Total accounts: **${n(accounts?.total_accounts).toLocaleString()}**`,
    `• App usage mix: ${formatAppUsage(reportData.app_usage_14d)}`,
    `• Internal ROOTS: **${formatRootsAtomicLocale(total)}** across **${holders.toLocaleString()}** holders`,
    "",
    "**Activity & Queues**",
    `• Volcano photo queue: ${formatPhotoQueue(photos)}`,
    `• ${formatOpsSummary(reportData)}`,
    "",
    "**Content Signals**",
    `• ${formatXSummary(reportData.rootrecord_x as Record<string, unknown> | undefined)}`,
    `• Reddit: ${formatRedditSummary(reportData.reddit as Record<string, unknown> | undefined)}`,
    `• Discord: ${formatDiscordActivityAiSummary(reportData)}`,
    `• Website: ${formatWebsiteSummary(reportData.website)}`,
    `• Top holders (secondary): ${formatTopHolders(leaderboard).replace(/\n/g, "; ")}`,
    "",
    "**X Copy**",
    "```text",
    buildXCopy(reportData),
    "```",
  ].join("\n");
}

async function archiveScreenshotReport(
  env: DiscordRootUnitsEnv,
  record: Record<string, unknown>,
  discord: { interactionId: string; channelId: string; guildId: string; userId: string },
): Promise<void> {
  const id = String(record.id || crypto.randomUUID());
  const nowIso = String(record.created_at || new Date().toISOString());
  try {
    await env.DB.prepare(
      `INSERT INTO discord_screenshot_reports
       (id, interaction_id, channel_id, guild_id, requested_by_discord_id, prompt_json, response_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        id,
        discord.interactionId,
        discord.channelId,
        discord.guildId,
        discord.userId,
        jsonForArchive(record.prompt),
        jsonForArchive(record.response),
        nowIso,
      )
      .run();
  } catch (e) {
    console.error("discord_screenshot_archive_d1", e instanceof Error ? e.message : String(e));
  }

  const webhook = String(env.DISCORD_GROK_WEBHOOK_URL || "").trim();
  if (!webhook) return;
  try {
    const payload = jsonForArchive(record);
    const form = new FormData();
    form.set(
      "payload_json",
      JSON.stringify({
        content: `Root Record /screenshot archive ${id}`,
        username: "Root Record Global Updater",
      }),
    );
    form.set("files[0]", new Blob([payload], { type: "application/json" }), `rootrecord-screenshot-${id}.json`);
    await fetch(webhook, { method: "POST", body: form });
  } catch (e) {
    console.error("discord_screenshot_archive_webhook", e instanceof Error ? e.message : String(e));
  }
}

function solanaRpcUrl(env: DiscordRootUnitsEnv): string {
  const direct = String(env.HELIUS_RPC_URL || env.SOLANA_RPC_URL || env.NEXT_PUBLIC_RPC_URL || "").trim();
  if (direct) return direct;
  const key = String(env.HELIUS_API_KEY || env.NEXT_PUBLIC_HELIUS_API_KEY || env.SOLANA_HELIUS_API_KEY || "").trim();
  if (key) return `https://mainnet.helius-rpc.com/?api-key=${encodeURIComponent(key)}`;
  return "https://api.mainnet-beta.solana.com";
}

async function solanaRpc(env: DiscordRootUnitsEnv, method: string, params: unknown[]): Promise<Record<string, unknown>> {
  try {
    const res = await fetch(solanaRpcUrl(env), {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": "RootRecord/discord-token-report" },
      body: JSON.stringify({ jsonrpc: "2.0", id: crypto.randomUUID(), method, params }),
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { ok: res.ok && !data.error, status: res.status, data };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

async function fetchJsonUrl(url: string): Promise<Record<string, unknown>> {
  try {
    const res = await fetch(url, { headers: { "User-Agent": "RootRecord/discord-token-report" } });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { ok: res.ok, status: res.status, data };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

async function collectRootsOnchainData(env: DiscordRootUnitsEnv): Promise<Record<string, unknown>> {
  const [supply, largestAccounts, asset, heliusTokenAccounts] = await Promise.all([
    solanaRpc(env, "getTokenSupply", [ROOTS_MINT_BASE58]),
    solanaRpc(env, "getTokenLargestAccounts", [ROOTS_MINT_BASE58]),
    solanaRpc(env, "getAsset", [{ id: ROOTS_MINT_BASE58 }]),
    solanaRpc(env, "getTokenAccounts", [{ mint: ROOTS_MINT_BASE58, page: 1, limit: 20, displayOptions: { showZeroBalance: false } }]),
  ]);
  return {
    mint: ROOTS_MINT_BASE58,
    solscan_holders_url: `https://solscan.io/token/${ROOTS_MINT_BASE58}#holders`,
    rpc_url_kind: solanaRpcUrl(env).includes("helius") ? "helius" : "configured_rpc",
    supply,
    largest_accounts: largestAccounts,
    asset,
    helius_token_accounts: heliusTokenAccounts,
  };
}

async function collectRootsMarketData(): Promise<Record<string, unknown>> {
  const [dex, jupiter] = await Promise.all([
    fetchJsonUrl(`https://api.dexscreener.com/latest/dex/tokens/${encodeURIComponent(ROOTS_MINT_BASE58)}`),
    fetchJsonUrl(`https://lite-api.jup.ag/price/v3?ids=${encodeURIComponent(ROOTS_MINT_BASE58)}`),
  ]);
  const dexData = (dex.data as Record<string, unknown> | undefined) || {};
  const pairs = Array.isArray(dexData.pairs) ? (dexData.pairs as unknown[]).slice(0, 8) : [];
  return {
    roots_mint: ROOTS_MINT_BASE58,
    solscan_url: `https://solscan.io/token/${ROOTS_MINT_BASE58}`,
    solscan_holders_url: `https://solscan.io/token/${ROOTS_MINT_BASE58}#holders`,
    dexscreener: { ...dex, data: { pairs } },
    jupiter,
  };
}

async function collectTokenReportData(env: DiscordRootUnitsEnv, requesterDiscordId: string): Promise<Record<string, unknown>> {
  const nowIso = new Date().toISOString();
  const [circulation, leaderboard, internalBalances, mintRequests, cachedCustodialRoots, onchain, market, appUsage, reddit] =
    await Promise.all([
      readCirculationTotals(env.DB).catch((e) => ({ error: e instanceof Error ? e.message : String(e) })),
      loadEconomyLeaderboardData(env.DB).catch((e) => ({ error: e instanceof Error ? e.message : String(e) })),
      dbFirst(
        env.DB,
        `SELECT COUNT(*) AS accounts_with_balance,
                COALESCE(SUM(balance), 0) AS total_balance,
                COALESCE(AVG(balance), 0) AS avg_balance,
                COALESCE(MAX(balance), 0) AS max_balance
         FROM rr_earn_balance
         WHERE balance > 0`,
      ),
      dbAll(
        env.DB,
        `SELECT status, COUNT(*) AS count, COALESCE(SUM(amount_atomic), 0) AS amount_atomic
         FROM rr_roots_mint_requests
         GROUP BY status
         ORDER BY status`,
      ),
      dbFirst(
        env.DB,
        `SELECT COUNT(DISTINCT account_id) AS custodial_accounts,
                COALESCE(SUM(CAST(amount_raw AS INTEGER)), 0) AS amount_raw,
                MAX(updated_at) AS updated_at
         FROM custodial_wallet_token_slots
         WHERE mint_base58 = ? AND CAST(amount_raw AS INTEGER) > 0`,
        ROOTS_MINT_BASE58,
      ),
      collectRootsOnchainData(env),
      collectRootsMarketData(),
      dbAll(
        env.DB,
        `SELECT app_id, SUM(units_earned) AS units_earned, COUNT(*) AS active_days
         FROM rr_earn_app_day
         WHERE ymd >= date('now', '-14 days')
         GROUP BY app_id
         ORDER BY units_earned DESC
         LIMIT 20`,
      ),
      fetchRootRecordReddit(),
    ]);
  return {
    generated_at: nowIso,
    requested_by_discord_id: requesterDiscordId,
    purpose: "Developer-only Discord /token ROOTS token report",
    internal_roots: { circulation, leaderboard, internal_balances: internalBalances, mint_requests: mintRequests, cached_custodial_roots: cachedCustodialRoots },
    onchain_roots: onchain,
    market,
    usage_context: { app_usage_14d: appUsage, reddit },
  };
}

async function callGrokAnalysis(
  env: DiscordRootUnitsEnv,
  title: string,
  instruction: string,
  data: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const token = String(env.GROK_API_BEARER_TOKEN || "").trim();
  const apiUrl = String(env.GROK_API_URL || "https://api.x.ai/v1/chat/completions").trim();
  const model = String(env.GROK_MODEL || "grok-3-latest").trim();
  const body = {
    model,
    messages: [
      {
        role: "system",
        content:
          `${instruction} Use only provided data. Be precise, mention unavailable/failed sources, and keep under 1200 characters. ` +
          "Do not reveal secrets or raw credentials.",
      },
      { role: "user", content: jsonForArchive(data) },
    ],
    temperature: 0.25,
  };
  if (!token) {
    return { ok: false, title, detail: "Grok API bearer token is not configured.", content: `${title}: AI unavailable; data archived.`, request: body };
  }
  try {
    const res = await fetch(apiUrl, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const response = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    const content = String(
      (((response.choices as Array<Record<string, unknown>> | undefined)?.[0]?.message as Record<string, unknown> | undefined)
        ?.content as string | undefined) || "",
    ).trim();
    return { ok: res.ok && Boolean(content), title, status: res.status, content: content || `${title}: no AI text returned.`, request: body, response };
  } catch (e) {
    return { ok: false, title, detail: e instanceof Error ? e.message : String(e), content: `${title}: AI request failed.`, request: body };
  }
}

async function archiveAiReport(
  env: DiscordRootUnitsEnv,
  commandName: string,
  record: Record<string, unknown>,
  discord: { interactionId: string; channelId: string; guildId: string; userId: string },
): Promise<void> {
  const id = String(record.id || crypto.randomUUID());
  const nowIso = String(record.created_at || new Date().toISOString());
  try {
    await env.DB.prepare(
      `INSERT INTO discord_ai_reports
       (id, command_name, interaction_id, channel_id, guild_id, requested_by_discord_id, prompt_json, response_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        id,
        commandName,
        discord.interactionId,
        discord.channelId,
        discord.guildId,
        discord.userId,
        jsonForArchive(record.prompt),
        jsonForArchive(record.response),
        nowIso,
      )
      .run();
  } catch (e) {
    console.error("discord_ai_report_archive_d1", e instanceof Error ? e.message : String(e));
  }

  const webhook = String(env.DISCORD_GROK_WEBHOOK_URL || "").trim();
  if (!webhook) return;
  try {
    const form = new FormData();
    form.set(
      "payload_json",
      JSON.stringify({
        content: `Root Record ${commandName} archive ${id}`,
        username: "Root Record AI",
      }),
    );
    form.set("files[0]", new Blob([jsonForArchive(record)], { type: "application/json" }), `rootrecord-${commandName.replace(/^\//, "")}-${id}.json`);
    await fetch(webhook, { method: "POST", body: form });
  } catch (e) {
    console.error("discord_ai_report_archive_webhook", e instanceof Error ? e.message : String(e));
  }
}

function tokenReportEmbed(finalReport: Record<string, unknown>, archiveId: string): DiscordEmbed[] {
  return [
    {
      title: "ROOTS Token Report",
      description: fieldValue(finalReport.content || "Token report generated.", 1800),
      color: 0x7c3aed,
      fields: [
        { name: "Mint", value: `\`${ROOTS_MINT_BASE58}\`` },
        { name: "Solscan", value: `[Token](https://solscan.io/token/${ROOTS_MINT_BASE58}) · [Holders](https://solscan.io/token/${ROOTS_MINT_BASE58}#holders)` },
      ],
      footer: { text: `AI record saved: ${archiveId.slice(0, 8)}` },
      timestamp: new Date().toISOString(),
    },
  ];
}

function activityReportEmbed(activityReport: Record<string, unknown>): DiscordEmbed[] {
  const metrics = (activityReport.summary_metrics as Record<string, unknown> | undefined) || {};
  const generatedForSnapshot = Boolean(activityReport.generated_for_snapshot);
  return [
    {
      title: "Discord Activity Report",
      description: fieldValue(activityReport.content || "Discord activity report generated.", 1800),
      color: 0x5865f2,
      fields: [
        {
          name: "30d Messages",
          value: n(metrics.total_messages_30d).toLocaleString(),
          inline: true,
        },
        {
          name: "Latest Day",
          value: `${metrics.latest_day || "n/a"} · ${n(metrics.latest_day_messages).toLocaleString()}`,
          inline: true,
        },
        {
          name: "Source",
          value: generatedForSnapshot ? "Generated for snapshot refresh" : "Developer /activity",
          inline: true,
        },
      ],
      footer: { text: `AI record saved: ${String(activityReport.id || "").slice(0, 8)}` },
      timestamp: String(activityReport.created_at || new Date().toISOString()),
    },
  ];
}

async function handleActivityCommand(
  body: Record<string, unknown>,
  env: DiscordRootUnitsEnv,
  member: Record<string, unknown> | undefined,
  requesterDiscordId: string,
): Promise<Response> {
  if (!(await hasDeveloperRole(member, env))) {
    return interactionResponse(4, { content: "Only @Developer can use `/activity`.", flags: 64 });
  }
  const activityReport = await generateDiscordActivityAiReport(env, requesterDiscordId, {
    interactionId: String(body.id || ""),
    channelId: String(body.channel_id || ""),
    guildId: String(body.guild_id || ""),
    userId: requesterDiscordId,
  });
  return jsonInteractionPayload({
    type: 4,
    data: {
      embeds: activityReportEmbed(activityReport),
      flags: 64,
    },
  });
}

async function handleTokenCommand(
  body: Record<string, unknown>,
  env: DiscordRootUnitsEnv,
  member: Record<string, unknown> | undefined,
  requesterDiscordId: string,
): Promise<Response> {
  if (!(await hasDeveloperRole(member, env))) {
    return interactionResponse(4, { content: "Only @Developer can use `/token`.", flags: 64 });
  }
  const reportData = await collectTokenReportData(env, requesterDiscordId);
  const archiveId = crypto.randomUUID();
  const sectionSpecs = [
    {
      key: "internal",
      title: "Internal ROOTS Ledger",
      instruction: "Analyze internal ROOTS balances, circulation, mint request status, and custodial cached ROOTS. Focus on what this says about usage and distribution.",
      data: reportData.internal_roots as Record<string, unknown>,
    },
    {
      key: "onchain",
      title: "On-chain ROOTS Token",
      instruction: "Analyze on-chain ROOTS supply, largest token accounts, holder/account data from Helius/RPC, and Solscan holder context.",
      data: reportData.onchain_roots as Record<string, unknown>,
    },
    {
      key: "market",
      title: "ROOTS LP Market",
      instruction: "Analyze ROOTS market/LP data from DexScreener/Jupiter/Solscan links. Call out price, liquidity, pairs, volume, and missing data.",
      data: reportData.market as Record<string, unknown>,
    },
    {
      key: "usage",
      title: "ROOTS Usage Context",
      instruction: "Analyze how ROOTS usage connects to app activity and community signals. Prefer app/service utilization over raw token balance hype.",
      data: reportData.usage_context as Record<string, unknown>,
    },
  ];
  const subreports: Record<string, unknown>[] = [];
  for (const spec of sectionSpecs) {
    const ai = await callGrokAnalysis(env, spec.title, spec.instruction, spec.data);
    subreports.push({ key: spec.key, ...ai });
    await postAiChannelMessage(env, {
      content: `**/token subreport: ${spec.title} (${archiveId.slice(0, 8)})**\n${String(ai.content || "No AI content returned.").slice(0, 1700)}`,
    });
  }
  const final = await callGrokAnalysis(
    env,
    "Final ROOTS Token Report",
    "Combine the provided subreports into one developer-ready ROOTS token report. Include internal ledger, on-chain holder/supply, LP market, app usage context, risks, and next actions. Keep it Discord-ready.",
    { report_data: reportData, subreports },
  );
  await postAiChannelMessage(env, {
    content: `**/token final report ${archiveId.slice(0, 8)}**\n${String(final.content || "No final AI content returned.").slice(0, 1700)}`,
  });
  await archiveAiReport(
    env,
    "/token",
    {
      id: archiveId,
      created_at: new Date().toISOString(),
      prompt: reportData,
      response: { subreports, final },
    },
    {
      interactionId: String(body.id || ""),
      channelId: String(body.channel_id || ""),
      guildId: String(body.guild_id || ""),
      userId: requesterDiscordId,
    },
  );
  return jsonInteractionPayload({
    type: 4,
    data: {
      embeds: tokenReportEmbed(final, archiveId),
      flags: 64,
    },
  });
}

async function handleScreenshotCommand(
  body: Record<string, unknown>,
  env: DiscordRootUnitsEnv,
  member: Record<string, unknown> | undefined,
  requesterDiscordId: string,
): Promise<Response> {
  if (!(await hasDeveloperRole(member, env))) {
    return interactionResponse(4, { content: "Only @Developer can use `/screenshot` or `/snapshot`.", flags: 64 });
  }

  const [reportData, previous] = await Promise.all([
    collectScreenshotReportData(env, requesterDiscordId),
    loadPreviousScreenshotReport(env),
  ]);
  if (previous) {
    reportData.previous_report = previous;
  }
  const recentActivityReport = await loadRecentActivityAiReport(env, 60 * 60 * 1000);
  reportData.discord_activity_ai_report =
    recentActivityReport ||
    (await generateDiscordActivityAiReport(
      env,
      requesterDiscordId,
      {
        interactionId: String(body.id || ""),
        channelId: String(body.channel_id || ""),
        guildId: String(body.guild_id || ""),
        userId: requesterDiscordId,
      },
      { generatedForSnapshot: true },
    ));
  const grok = await callGrokReport(env, reportData);
  const archiveId = crypto.randomUUID();
  const reportEmbeds = buildScreenshotReportEmbeds(reportData, archiveId);
  const social = await callGrokSocialUpdate(env, reportData, reportEmbeds);
  await postAiChannelMessage(env, {
    content: `**/screenshot AI report ${archiveId.slice(0, 8)}**\n${String(grok.content || grok.fallback || "Report generated.").slice(0, 1700)}`,
  });
  await postAiChannelMessage(env, {
    content: `**/screenshot social draft ${archiveId.slice(0, 8)}**\n${String(social.content || "Social draft generated.").slice(0, 1700)}`,
  });
  await archiveScreenshotReport(
    env,
    {
      id: archiveId,
      created_at: new Date().toISOString(),
      prompt: reportData,
      response: { report: grok, social },
    },
    {
      interactionId: String(body.id || ""),
      channelId: String(body.channel_id || ""),
      guildId: String(body.guild_id || ""),
      userId: requesterDiscordId,
    },
  );

  return jsonInteractionPayload({
    type: 4,
    data: {
      embeds: reportEmbeds,
    },
    rr_followup: {
      embeds: buildSocialUpdateEmbed(social),
    },
  });
}

async function handleMintCommand(
  body: Record<string, unknown>,
  env: DiscordRootUnitsEnv,
  member: Record<string, unknown> | undefined,
  requesterDiscordId: string,
  opts: Array<Record<string, unknown>>,
): Promise<Response> {
  if (!(await hasDeveloperRole(member, env))) {
    return interactionResponse(4, { content: "Only @Developer can use `/mint`.", flags: 64 });
  }
  const base = String(env.ROOTRECORD_SOLANA_TX_URL || "").trim().replace(/\/+$/, "");
  const admin = String(env.RR_PUSH_ADMIN_SECRET || "").trim();
  if (!base || !admin) {
    return interactionResponse(4, {
      content: "Mint worker is not configured. Set `ROOTRECORD_SOLANA_TX_URL` and `RR_PUSH_ADMIN_SECRET`.",
      flags: 64,
    });
  }

  const amount = optNumber(opts, "amount") ?? optNumberDeep(opts, "amount");
  const wallet = optStringDeep(opts, "wallet") || ROOT_RECORD_GLOBAL_UPDATER_PUBKEY;
  const note = optStringDeep(opts, "note") || "Discord /mint";
  const requestBody: Record<string, unknown> = {
    destination_owner: wallet,
    requested_by_discord_id: requesterDiscordId,
    interaction_id: String(body.id || ""),
    note,
  };
  let modeLabel = "";
  if (amount != null) {
    requestBody.amount_ui = String(amount);
    modeLabel = `${amount} ROOTS`;
  } else {
    const totals = await readCirculationTotals(env.DB);
    requestBody.target_atomic = String(totals.total_circulation);
    modeLabel = `top up to internal circulation (${formatRootsAtomicLocale(totals.total_circulation)} ROOTS)`;
  }

  let res: Response;
  try {
    res = await fetch(`${base}/api/internal/mint-roots`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-RR-Push-Admin-Key": admin,
        "User-Agent": "RootRecord/discord-mint",
      },
      body: JSON.stringify(requestBody),
    });
  } catch (e) {
    return interactionResponse(4, {
      content: `Mint request failed before reaching Solana worker: ${e instanceof Error ? e.message : String(e)}`,
      flags: 64,
    });
  }
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || !data.ok) {
    return interactionResponse(4, {
      content: `Mint failed: ${String(data.detail || `HTTP ${res.status}`)}`,
      flags: 64,
    });
  }
  const sig = String(data.signature || "").trim();
  const minted = String(data.amount_ui || "").trim();
  const dest = String(data.destination_owner || wallet).trim();
  const skipped = Boolean(data.skipped);
  return interactionResponse(4, {
    embeds: [
      {
        title: skipped ? "ROOTS Mint Not Needed" : "ROOTS Mint Complete",
        color: skipped ? 0x38bdf8 : 0x22c55e,
        fields: [
          { name: "Mode", value: modeLabel, inline: false },
          { name: "Minted", value: `${minted} ROOTS`, inline: true },
          { name: "Mint", value: `\`${ROOTS_MINT_BASE58}\``, inline: false },
          { name: "Destination", value: `\`${dest}\``, inline: false },
          { name: "Transaction", value: skipped ? "No transaction needed" : sig ? `[${sig.slice(0, 10)}…](${String(data.explorer || `https://solscan.io/tx/${sig}`)})` : "submitted", inline: false },
        ],
      },
    ],
  });
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

  if (name === "economy") {
    return handleEconomy(env.DB);
  }

  if (name === "screenshot" || name === "snapshot") {
    return handleScreenshotCommand(body, env, member, fromDiscordId);
  }

  if (name === "activity") {
    return handleActivityCommand(body, env, member, fromDiscordId);
  }

  if (name === "token") {
    return handleTokenCommand(body, env, member, fromDiscordId);
  }

  if (name === "mint") {
    return handleMintCommand(body, env, member, fromDiscordId, opts);
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
      const amt = ledgerFromWholeRoots(optNumber(inner, "amount") ?? optNumberDeep(opts, "amount"));
      if (amt == null) {
        return interactionResponse(4, {
          content: "Use **`/faucet deposit`** with **amount** (whole Roots into the shared pool).",
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
    if ((sendAsset === "RRTT" || sendAsset === "SOL") && scName !== "" && scName !== "user") {
      return interactionResponse(4, {
        content:
          `**${sendAsset}** only works under **\`/send user\`**: pick **${sendAsset}**, **member**, then **amount**. For splits to many people, use **ROOTS** with **everyone** / **active** / **role**.`,
      });
    }
    if (scName === "everyone") {
      const total = ledgerFromWholeRoots(optNumber(inner, "amount") ?? optNumberDeep(opts, "amount"));
      if (total == null) {
        return interactionResponse(4, {
          content:
            "Use **`/send everyone`**: **asset** = **ROOTS**, then **amount** (total ROOTS to split, decimal e.g. `0.01`).",
        });
      }
      return handleSendBulk(env.DB, fromDiscordId, fromUid, total, interactionId, "all", env);
    }

    if (scName === "active") {
      const total = ledgerFromWholeRoots(optNumber(inner, "amount") ?? optNumberDeep(opts, "amount"));
      if (total == null) {
        return interactionResponse(4, {
          content:
            "Use **`/send active`**: **asset** = **ROOTS**, then **amount** (total ROOTS to split, decimal).",
        });
      }
      return handleSendBulk(env.DB, fromDiscordId, fromUid, total, interactionId, "active", env);
    }

    if (scName === "role") {
      const roleId = optRole(inner, "role") ?? optRoleDeep(opts, "role");
      const total = ledgerFromWholeRoots(optNumber(inner, "amount") ?? optNumberDeep(opts, "amount"));
      if (!roleId || total == null) {
        return interactionResponse(4, {
          content:
            "Use **`/send role`**: **asset** = **ROOTS**, **role**, and **amount** (total ROOTS to split, decimal).",
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
      const amountRaw = optNumber(inner, "amount") ?? optNumberDeep(opts, "amount");
      if (!toDiscordId || amountRaw == null) {
        return interactionResponse(4, {
          content:
            "Use **`/send user`**: **asset**, **member**, **amount** (SOL = decimal e.g. `0.00001`; ROOTS = decimal ROOTS; RRTT = whole tokens).",
        });
      }
      if (toDiscordId === fromDiscordId) {
        return interactionResponse(4, { content: "You cannot send to yourself." });
      }
      const failedDisplayUnits =
        sendAsset === "ROOTS"
          ? ledgerFromWholeRoots(amountRaw) ?? 0
          : amountRaw;
      const toUid = await earnUserIdForDiscord(env.DB, toDiscordId);
      if (!toUid) {
        const hasVerifiedRole = await discordUserHasVerifiedRole(env, toDiscordId);
        return interactionResponse(4, {
          content: hasVerifiedRole
            ? verifiedButUnlinkedRecipientSendFailedContent(
                toDiscordId,
                sendFailedAmountText(failedDisplayUnits, sendAsset),
              )
            : unlinkedRecipientSendFailedContent(toDiscordId, failedDisplayUnits, sendAsset),
        });
      }
      if (sendAsset === "RRTT") {
        const wholeRrtt = Math.floor(amountRaw);
        if (wholeRrtt < 1) {
          return interactionResponse(4, { content: "RRTT amount must be at least **1** whole token." });
        }
        if (wholeRrtt > 10_000_000) {
          return interactionResponse(4, { content: "Max **10,000,000** whole RRTT per send." });
        }
        return handleSendRrttUser(env, fromDiscordId, toDiscordId, fromUid, toUid, wholeRrtt, interactionId);
      }
      if (sendAsset === "SOL") {
        const lamports = solWholeToLamports(amountRaw);
        if (lamports == null || lamports < MIN_SOL_SEND_LAMPORTS) {
          return interactionResponse(4, {
            content: `SOL amount must be at least **${(MIN_SOL_SEND_LAMPORTS / 1e9).toFixed(5)}** SOL (e.g. \`0.00001\`).`,
          });
        }
        if (lamports > MAX_SOL_SEND_LAMPORTS) {
          return interactionResponse(4, {
            content: `Max **${(MAX_SOL_SEND_LAMPORTS / 1e9).toFixed(0)}** SOL per send (\`${MAX_SOL_SEND_LAMPORTS.toLocaleString()}\` lamports).`,
          });
        }
        return handleSendSolUser(env, fromDiscordId, toDiscordId, fromUid, toUid, lamports, interactionId);
      }
      const units = ledgerFromWholeRoots(amountRaw);
      if (units == null) {
        return interactionResponse(4, { content: "Amount must be at least **0.00000001** Roots." });
      }
      if (units < MIN_SEND) {
        return interactionResponse(4, { content: "Amount must be at least **0.00000001** Roots." });
      }
      if (units > MAX_SEND) {
        return interactionResponse(4, {
          content: `Max **${formatRootsAtomicLocale(MAX_SEND)}** Roots per send.`,
        });
      }
      return handleSendExecute(env.DB, fromDiscordId, toDiscordId, fromUid, toUid, units, interactionId);
    }

    return interactionResponse(4, {
      content:
        "Use **`/send user`**, **`everyone`**, **`active`**, or **`role`**. **ROOTS** = in-bot ledger; **RRTT** / **SOL** = on-chain custodial wallets (**`/send user`** only). `@everyone` is not a user field — use **everyone** (linked members only).",
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
              rr_followup?: { content?: string; flags?: number; embeds?: unknown[] };
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
            if (payload.rr_followup) {
              await postDiscordInteractionFollowup(appIdForPatch, interactionToken, payload.rr_followup);
            }
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
