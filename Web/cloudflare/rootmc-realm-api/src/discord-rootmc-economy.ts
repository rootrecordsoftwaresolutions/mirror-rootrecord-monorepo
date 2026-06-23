import type { D1Database } from "@cloudflare/workers-types";

import { FEATURED_SERVER_DEFAULTS } from "./rootmc-server";

export const GOLD_MIN_AMOUNT = 0.01;

export type LinkedMcPlayer = {
  discordUserId: string;
  accountId: string;
  minecraftUuid: string;
  minecraftUsername: string | null;
};

function nowIso(): string {
  return new Date().toISOString();
}

function str(v: unknown): string {
  return v == null ? "" : String(v).trim();
}

export function roundGold(amount: number): number {
  if (!Number.isFinite(amount)) return 0;
  return Math.round(amount * 100) / 100;
}

export function formatGold(amount: number): string {
  return `${roundGold(amount).toFixed(2)} gold`;
}

export async function resolveLinkedPlayerByDiscord(
  db: D1Database,
  discordUserId: string,
): Promise<LinkedMcPlayer | null> {
  const userId = str(discordUserId);
  if (!userId) return null;
  const row = await db
    .prepare(
      `SELECT d.discord_user_id, d.account_id, l.minecraft_uuid, l.minecraft_username
       FROM discord_account_links d
       INNER JOIN rootstat_minecraft_links l ON l.account_id = d.account_id
       WHERE d.discord_user_id = ?
       LIMIT 1`,
    )
    .bind(userId)
    .first<{
      discord_user_id: string;
      account_id: string;
      minecraft_uuid: string;
      minecraft_username: string | null;
    }>();
  if (!row?.minecraft_uuid) return null;
  return {
    discordUserId: str(row.discord_user_id),
    accountId: str(row.account_id),
    minecraftUuid: str(row.minecraft_uuid).toLowerCase(),
    minecraftUsername: str(row.minecraft_username) || null,
  };
}

export async function getPlayerBalance(
  db: D1Database,
  serverId: string,
  minecraftUuid: string,
): Promise<{ balance: number; username: string | null }> {
  const uuid = str(minecraftUuid).toLowerCase();
  const row = await db
    .prepare(
      `SELECT balance, minecraft_username
       FROM rootstat_player_balances
       WHERE server_id = ? AND minecraft_uuid = ?
       LIMIT 1`,
    )
    .bind(serverId, uuid)
    .first<{ balance: number; minecraft_username: string | null }>();
  return {
    balance: roundGold(Number(row?.balance) || 0),
    username: str(row?.minecraft_username) || null,
  };
}

export type DiscordPayResult =
  | { ok: true; transferId: string; amount: number; recipientName: string; newBalance: number }
  | { ok: false; error: string };

export async function executeDiscordPay(
  db: D1Database,
  serverId: string,
  sender: LinkedMcPlayer,
  recipient: LinkedMcPlayer,
  rawAmount: number,
): Promise<DiscordPayResult> {
  const amount = roundGold(rawAmount);
  if (amount < GOLD_MIN_AMOUNT) {
    return { ok: false, error: `Minimum payment is ${formatGold(GOLD_MIN_AMOUNT)}.` };
  }
  if (sender.discordUserId === recipient.discordUserId) {
    return { ok: false, error: "You cannot pay yourself." };
  }

  const senderBal = await getPlayerBalance(db, serverId, sender.minecraftUuid);
  if (senderBal.balance < amount) {
    return {
      ok: false,
      error: `Insufficient balance. You have **${formatGold(senderBal.balance)}**.`,
    };
  }

  const transferId = crypto.randomUUID();
  const ts = nowIso();
  const toName = recipient.minecraftUsername || recipient.minecraftUuid.slice(0, 8);
  const fromName = sender.minecraftUsername || sender.minecraftUuid.slice(0, 8);

  const deduct = await db
    .prepare(
      `UPDATE rootstat_player_balances
       SET balance = balance - ?, updated_at = ?, synced_at = ?
       WHERE server_id = ? AND minecraft_uuid = ? AND balance >= ?`,
    )
    .bind(amount, ts, ts, serverId, sender.minecraftUuid, amount)
    .run();

  if ((deduct.meta?.changes ?? 0) < 1) {
    return { ok: false, error: `Insufficient balance. You have **${formatGold(senderBal.balance)}**.` };
  }

  await db.batch([
    db
      .prepare(
        `INSERT INTO rootstat_player_balances
           (server_id, minecraft_uuid, minecraft_username, balance, currency, synced_at, updated_at)
         VALUES (?, ?, ?, ?, 'gold', ?, ?)
         ON CONFLICT(server_id, minecraft_uuid) DO UPDATE SET
           balance = rootstat_player_balances.balance + excluded.balance,
           minecraft_username = COALESCE(excluded.minecraft_username, rootstat_player_balances.minecraft_username),
           updated_at = excluded.updated_at,
           synced_at = excluded.synced_at`,
      )
      .bind(serverId, recipient.minecraftUuid, toName, amount, ts, ts),
    db
      .prepare(
        `INSERT INTO rootmc_gold_transfers (
           id, server_id, from_uuid, from_username, to_uuid, to_username, amount,
           source, discord_from_user_id, discord_to_user_id, status, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, 'discord', ?, ?, 'pending', ?)`,
      )
      .bind(
        transferId,
        serverId,
        sender.minecraftUuid,
        fromName,
        recipient.minecraftUuid,
        toName,
        amount,
        sender.discordUserId,
        recipient.discordUserId,
        ts,
      ),
    db
      .prepare(
        `UPDATE rootstat_player_net_worth
         SET balance_value = MAX(0, balance_value - ?), total_value = MAX(0, total_value - ?), synced_at = ?
         WHERE server_id = ? AND minecraft_uuid = ?`,
      )
      .bind(amount, amount, ts, serverId, sender.minecraftUuid),
    db
      .prepare(
        `INSERT INTO rootstat_player_net_worth
           (server_id, minecraft_uuid, minecraft_username, balance_value, inventory_value,
            chest_value, shop_stock_value, total_value, ranked_at, synced_at)
         VALUES (?, ?, ?, ?, 0, 0, 0, ?, ?, ?)
         ON CONFLICT(server_id, minecraft_uuid) DO UPDATE SET
           balance_value = rootstat_player_net_worth.balance_value + excluded.balance_value,
           total_value = rootstat_player_net_worth.total_value + excluded.total_value,
           minecraft_username = COALESCE(excluded.minecraft_username, rootstat_player_net_worth.minecraft_username),
           synced_at = excluded.synced_at`,
      )
      .bind(serverId, recipient.minecraftUuid, toName, amount, amount, ts, ts),
  ]);

  const newBalance = roundGold(senderBal.balance - amount);
  return { ok: true, transferId, amount, recipientName: toName, newBalance };
}

export function defaultRootMcServerId(): string {
  return FEATURED_SERVER_DEFAULTS.server_id;
}
