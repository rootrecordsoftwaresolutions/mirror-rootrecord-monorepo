import type { D1Database } from "@cloudflare/workers-types";

import { hashNewAccountCredentials } from "../../shared/password-verify";
import { json } from "./cors";
import { upsertUserAccountFromLicense } from "./accounts";
import { verifyWorkerOpsAdmin } from "./push";
import {
  setCustodialWalletForAccountFromSecretKey,
  type InternalWalletEnv,
} from "./solana-internal-wallet";

export const TREASURY_ACCOUNT_EMAIL = "treasury@rootrecord.info";
export const TREASURY_USER_ID = `user:${TREASURY_ACCOUNT_EMAIL}`;
export const TREASURY_WALLET_PUBKEY = "G1DHctEcwkiLw8NZDfCbDCbuPktQBmWa6P2aobDuMKuZ";

export type TreasuryAccountEnv = InternalWalletEnv & {
  RR_PUSH_ADMIN_SECRET?: string;
  TREASURY_ACCOUNT_PASSWORD?: string;
};

export async function ensureTreasuryBalanceRow(db: D1Database, nowIso: string): Promise<void> {
  await db
    .prepare("INSERT OR IGNORE INTO rr_earn_balance (user_id, balance, updated_at) VALUES (?, 0, ?)")
    .bind(TREASURY_USER_ID, nowIso)
    .run();
}

export async function creditTreasuryBalance(db: D1Database, units: number, nowIso: string): Promise<void> {
  const amount = Math.max(0, Math.floor(Number(units) || 0));
  if (amount <= 0) return;
  await ensureTreasuryBalanceRow(db, nowIso);
  await db
    .prepare("UPDATE rr_earn_balance SET balance = balance + ?, updated_at = ? WHERE user_id = ?")
    .bind(amount, nowIso, TREASURY_USER_ID)
    .run();
}

async function treasuryAccountId(db: D1Database): Promise<string | null> {
  const row = await db
    .prepare("SELECT id FROM license_accounts WHERE lower(trim(email)) = ? LIMIT 1")
    .bind(TREASURY_ACCOUNT_EMAIL)
    .first<{ id: string }>();
  return String(row?.id || "").trim() || null;
}

async function upsertTreasuryLogin(
  env: TreasuryAccountEnv,
  password: string,
  nowIso: string,
): Promise<{ ok: true; accountId: string; created: boolean } | { ok: false; detail: string; status: number }> {
  const existingId = await treasuryAccountId(env.DB);
  const shouldHash = password.length > 0;
  if (!existingId && !shouldHash) {
    return { ok: false, detail: "Treasury account does not exist yet; provide a password in the request body or TREASURY_ACCOUNT_PASSWORD.", status: 400 };
  }

  let passwordHash: string | null = null;
  let salt: string | null = null;
  if (shouldHash) {
    try {
      const creds = await hashNewAccountCredentials(password);
      passwordHash = creds.password_hash;
      salt = creds.salt;
    } catch {
      return { ok: false, detail: "Could not hash treasury account password.", status: 500 };
    }
  }

  if (existingId) {
    if (passwordHash && salt) {
      await env.DB
        .prepare("UPDATE license_accounts SET password_hash = ?, salt = ?, updated_at = ? WHERE id = ?")
        .bind(passwordHash, salt, nowIso, existingId)
        .run();
    }
    return { ok: true, accountId: existingId, created: false };
  }

  const accountId = crypto.randomUUID();
  await env.DB
    .prepare("INSERT INTO license_accounts (id, email, password_hash, salt, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(accountId, TREASURY_ACCOUNT_EMAIL, passwordHash, salt, nowIso, nowIso)
    .run();
  return { ok: true, accountId, created: true };
}

export async function provisionTreasuryAccount(
  env: TreasuryAccountEnv,
  password: string,
): Promise<{ ok: true; account_id: string; created: boolean; custodial_wallet: string } | { ok: false; detail: string; status: number }> {
  const nowIso = new Date().toISOString();
  const login = await upsertTreasuryLogin(env, password, nowIso);
  if (!login.ok) return login;

  await upsertUserAccountFromLicense(env.DB, {
    email: TREASURY_ACCOUNT_EMAIL,
    account_id: login.accountId,
    pro_unlocked: true,
    life_member: true,
    extra: { source: "internal_treasury", role: "rootrecord_treasury" },
  });
  await ensureTreasuryBalanceRow(env.DB, nowIso);

  try {
    await env.DB
      .prepare("UPDATE license_accounts SET public_display_name = ?, updated_at = ? WHERE id = ?")
      .bind("Root Record Treasury", nowIso, login.accountId)
      .run();
  } catch {
    /* Migration 0048 may not be present in local test databases. */
  }

  const secret = String(env.RRTT_TREASURY_SECRET_KEY_B58 || "").trim();
  if (!secret) {
    return { ok: false, detail: "RRTT_TREASURY_SECRET_KEY_B58 is not configured.", status: 503 };
  }
  const wallet = await setCustodialWalletForAccountFromSecretKey(env, login.accountId, secret, TREASURY_WALLET_PUBKEY);
  if (!wallet.ok) return { ok: false, detail: wallet.detail, status: 503 };

  return {
    ok: true,
    account_id: login.accountId,
    created: login.created,
    custodial_wallet: wallet.pubkey,
  };
}

export async function handleTreasuryAccountProvisionRoute(
  request: Request,
  env: TreasuryAccountEnv,
  sub: string,
  method: string,
): Promise<Response | null> {
  if (sub !== "/internal/provision-treasury-account" || method !== "POST") return null;
  if (!(await verifyWorkerOpsAdmin(request, env))) return json({ ok: false, detail: "Unauthorized." }, 401);

  let body: { password?: string | null } = {};
  try {
    body = (await request.json().catch(() => ({}))) as typeof body;
  } catch {
    body = {};
  }
  const password = String(body.password || env.TREASURY_ACCOUNT_PASSWORD || "").trim();
  const result = await provisionTreasuryAccount(env, password);
  if (!result.ok) return json({ ok: false, detail: result.detail }, result.status);
  return json({
    ok: true,
    email: TREASURY_ACCOUNT_EMAIL,
    account_id: result.account_id,
    created: result.created,
    custodial_wallet: result.custodial_wallet,
    treasury_user_id: TREASURY_USER_ID,
  });
}
