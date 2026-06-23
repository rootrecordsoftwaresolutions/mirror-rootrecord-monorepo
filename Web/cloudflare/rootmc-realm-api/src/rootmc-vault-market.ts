import type { D1Database } from "@cloudflare/workers-types";

import { json } from "./cors";
import { requireSignedInAccount, record, str, resolveEconomyServerId } from "./realm-lib";
import type { RootStatEnv } from "./rootstat-minecraft";
import { validateServerAuth } from "./rootstat-minecraft";
import { shopMarketItemsPage, shopPriceCatalog } from "./rootmc-economy";
import { FEATURED_SERVER_DEFAULTS } from "./rootmc-server";

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeItemKey(raw: string): string {
  return str(raw).toUpperCase().replace(/[^A-Z0-9_]/g, "_").slice(0, 64);
}

async function cheapestListing(
  db: D1Database,
  serverId: string,
  itemKey: string,
  quantity: number,
): Promise<Record<string, unknown> | null> {
  const { results } = await db
    .prepare(
      `SELECT shop_id, owner_uuid, owner_username, world_name, x, y, z, item_key, price, listing_type
       FROM rootstat_shop_listings
       WHERE server_id = ? AND item_key = ? AND listing_type = 'sell'
       ORDER BY price ASC
       LIMIT 20`,
    )
    .bind(serverId, itemKey)
    .all<Record<string, unknown>>();
  if (!results?.length) return null;
  return results[0];
}

export async function recordShopPriceHistory(
  db: D1Database,
  serverId: string,
  syncedAt: string,
): Promise<number> {
  const prices = await shopPriceCatalog(db, serverId, 200);
  let count = 0;
  for (const row of prices) {
    const itemKey = normalizeItemKey(str(row.item_key));
    const avg = Number(row.avg_price) || 0;
    const samples = Number(row.sample_count) || 0;
    if (!itemKey || avg <= 0) continue;
    await db
      .prepare(
        `INSERT INTO rootmc_shop_price_history (server_id, item_key, avg_price, sample_count, recorded_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .bind(serverId, itemKey, avg, samples, syncedAt)
      .run();
    count++;
  }
  return count;
}

export async function handleRootMcVaultMarket(
  request: Request,
  env: RootStatEnv,
  subpath: string,
  method: string,
): Promise<Response | null> {
  const serverIdDefault = FEATURED_SERVER_DEFAULTS.server_id;

  if (method === "GET" && subpath === "/rootmc/stock-market/items") {
    const url = new URL(request.url);
    const requested = str(url.searchParams.get("server_id")) || serverIdDefault;
    const serverId = await resolveEconomyServerId(env.DB, requested);
    const page = await shopMarketItemsPage(env.DB, serverId, {
      page: Number(url.searchParams.get("page")) || 1,
      perPage: Number(url.searchParams.get("per_page")) || 25,
      sort: str(url.searchParams.get("sort")) || "quantity_desc",
      q: str(url.searchParams.get("q")),
      minPrice: url.searchParams.has("min_price") ? Number(url.searchParams.get("min_price")) : undefined,
      maxPrice: url.searchParams.has("max_price") ? Number(url.searchParams.get("max_price")) : undefined,
      minQty: url.searchParams.has("min_qty") ? Number(url.searchParams.get("min_qty")) : undefined,
      maxQty: url.searchParams.has("max_qty") ? Number(url.searchParams.get("max_qty")) : undefined,
      minShops: url.searchParams.has("min_shops") ? Number(url.searchParams.get("min_shops")) : undefined,
      inStockOnly: url.searchParams.get("in_stock") === "1",
    });

    return json({
      server_id: serverId,
      requested_server_id: requested !== serverId ? requested : undefined,
      ...page,
      synced_at: nowIso(),
    });
  }

  if (method === "GET" && subpath === "/rootmc/stock-market") {
    const url = new URL(request.url);
    const requested = str(url.searchParams.get("server_id")) || serverIdDefault;
    const serverId = await resolveEconomyServerId(env.DB, requested);
    const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit")) || 50));

    const latest = await env.DB.prepare(
      `SELECT item_key, avg_price, sample_count, recorded_at
       FROM rootmc_shop_price_history
       WHERE server_id = ?
         AND recorded_at = (
           SELECT MAX(recorded_at) FROM rootmc_shop_price_history h2
           WHERE h2.server_id = rootmc_shop_price_history.server_id
             AND h2.item_key = rootmc_shop_price_history.item_key
         )
       ORDER BY sample_count DESC, avg_price DESC
       LIMIT ?`,
    )
      .bind(serverId, limit)
      .all<Record<string, unknown>>();

    let catalog = latest.results || [];
    if (catalog.length === 0) {
      const live = await shopPriceCatalog(env.DB, serverId, limit);
      catalog = live.map((row) => ({
        item_key: row.item_key,
        avg_price: row.avg_price,
        sample_count: row.sample_count,
        recorded_at: row.synced_at || nowIso(),
      }));
    }

    const movers = await env.DB.prepare(
      `SELECT h.item_key,
              h.avg_price AS current_price,
              (
                SELECT avg_price FROM rootmc_shop_price_history prev
                WHERE prev.server_id = h.server_id AND prev.item_key = h.item_key
                  AND prev.recorded_at < h.recorded_at
                ORDER BY prev.recorded_at DESC LIMIT 1
              ) AS prior_price,
              h.sample_count,
              h.recorded_at
       FROM rootmc_shop_price_history h
       WHERE h.server_id = ?
       ORDER BY h.recorded_at DESC
       LIMIT ?`,
    )
      .bind(serverId, limit * 3)
      .all<Record<string, unknown>>();

    const circulation = await env.DB.prepare(
      `SELECT COALESCE(SUM(total_quantity), 0) AS total_items
       FROM rootstat_server_item_totals WHERE server_id = ?`,
    )
      .bind(serverId)
      .first<{ total_items: number }>();

    return json({
      server_id: serverId,
      requested_server_id: requested !== serverId ? requested : undefined,
      catalog,
      recent_history: movers.results || [],
      total_server_items: Number(circulation?.total_items) || 0,
      synced_at: nowIso(),
    });
  }

  if (method === "GET" && subpath === "/rootmc/stock-market/history") {
    const url = new URL(request.url);
    const requested = str(url.searchParams.get("server_id")) || serverIdDefault;
    const serverId = await resolveEconomyServerId(env.DB, requested);
    const itemKey = normalizeItemKey(str(url.searchParams.get("item")));
    const limit = Math.min(500, Math.max(1, Number(url.searchParams.get("limit")) || 120));
    if (!itemKey) {
      return json({ detail: "item query parameter required" }, 400);
    }

    const { results } = await env.DB.prepare(
      `SELECT avg_price, sample_count, recorded_at
       FROM rootmc_shop_price_history
       WHERE server_id = ? AND item_key = ?
       ORDER BY recorded_at DESC
       LIMIT ?`,
    )
      .bind(serverId, itemKey, limit)
      .all<Record<string, unknown>>();

    const points = (results || []).slice().reverse().map((row) => ({
      avg_price: Number(row.avg_price) || 0,
      sample_count: Number(row.sample_count) || 0,
      recorded_at: str(row.recorded_at),
    }));

    const current = await env.DB.prepare(
      `SELECT avg_price, sample_count, synced_at
       FROM rootstat_shop_prices
       WHERE server_id = ? AND item_key = ?
       LIMIT 1`,
    )
      .bind(serverId, itemKey)
      .first<{ avg_price: number; sample_count: number; synced_at: string | null }>();

    return json({
      server_id: serverId,
      item_key: itemKey,
      current_avg: Number(current?.avg_price) || 0,
      sample_count: Number(current?.sample_count) || 0,
      synced_at: current?.synced_at || null,
      points,
    });
  }

  if (method === "GET" && subpath === "/rootmc/vault") {
    const auth = await requireSignedInAccount(request, env);
    if (auth instanceof Response) return auth;

    const url = new URL(request.url);
    const serverId = str(url.searchParams.get("server_id")) || serverIdDefault;

    const { results } = await env.DB.prepare(
      `SELECT id, server_id, item_key, quantity, price_paid, shop_id, status, created_at, expires_at
       FROM rootmc_vault_orders
       WHERE account_id = ? AND server_id = ? AND status = 'pending'
       ORDER BY created_at ASC`,
    )
      .bind(auth.accountId, serverId)
      .all<Record<string, unknown>>();

    return json({
      account_id: auth.accountId,
      server_id: serverId,
      pending: results || [],
      claim_hint: "Run /vault in-game while linked to claim pending items.",
    });
  }

  if (method === "POST" && subpath === "/rootmc/buy") {
    const auth = await requireSignedInAccount(request, env);
    if (auth instanceof Response) return auth;

    let body: Record<string, unknown>;
    try {
      body = record(JSON.parse(await request.text()));
    } catch {
      return json({ detail: "Invalid JSON body." }, 400);
    }

    const serverId = str(body.server_id) || serverIdDefault;
    const itemKey = normalizeItemKey(str(body.item_key));
    const quantity = Math.max(1, Math.min(64 * 9, Math.floor(Number(body.quantity) || 1)));
    if (!itemKey) return json({ detail: "item_key required." }, 400);

    const link = await env.DB.prepare(
      `SELECT minecraft_uuid FROM rootstat_minecraft_links WHERE account_id = ? LIMIT 1`,
    )
      .bind(auth.accountId)
      .first<{ minecraft_uuid: string }>();

    const listing = await cheapestListing(env.DB, serverId, itemKey, quantity);
    if (!listing) {
      return json({ detail: "No listings for that item." }, 404);
    }

    const unitPrice = Number(listing.price) || 0;
    const total = unitPrice * quantity;
    const now = nowIso();
    const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const insert = await env.DB.prepare(
      `INSERT INTO rootmc_vault_orders
         (server_id, account_id, minecraft_uuid, item_key, quantity, price_paid, shop_id, status, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
       RETURNING id`,
    )
      .bind(
        serverId,
        auth.accountId,
        link?.minecraft_uuid || null,
        itemKey,
        quantity,
        total,
        str(listing.shop_id) || null,
        now,
        expires,
      )
      .first<{ id: number }>();

    return json({
      ok: true,
      order_id: insert?.id,
      item_key: itemKey,
      quantity,
      price_paid: total,
      unit_price: unitPrice,
      shop_id: str(listing.shop_id),
      status: "pending",
      message: "Purchase queued. Claim with /vault in-game.",
    });
  }

  if (method === "POST" && subpath === "/rootmc/vault/claim") {
    const server = await validateServerAuth(env, request);
    if (server instanceof Response) return server;

    let body: Record<string, unknown>;
    try {
      body = record(JSON.parse(await request.text()));
    } catch {
      return json({ detail: "Invalid JSON body." }, 400);
    }

    const uuid = str(body.minecraft_uuid).toLowerCase();
    if (!/^[0-9a-f-]{36}$/.test(uuid)) {
      return json({ detail: "minecraft_uuid required." }, 400);
    }

    const link = await env.DB.prepare(
      `SELECT account_id FROM rootstat_minecraft_links WHERE minecraft_uuid = ? LIMIT 1`,
    )
      .bind(uuid)
      .first<{ account_id: string }>();
    if (!link?.account_id) {
      return json({ detail: "Player not linked." }, 404);
    }

    const { results } = await env.DB.prepare(
      `SELECT id, item_key, quantity, price_paid
       FROM rootmc_vault_orders
       WHERE account_id = ? AND server_id = ? AND status = 'pending'
       ORDER BY created_at ASC
       LIMIT 32`,
    )
      .bind(link.account_id, server.serverId)
      .all<Record<string, unknown>>();

    const now = nowIso();
    const items = results || [];
    for (const row of items) {
      await env.DB.prepare(
        `UPDATE rootmc_vault_orders SET status = 'claimed', claimed_at = ? WHERE id = ?`,
      )
        .bind(now, Number(row.id))
        .run();
    }

    return json({
      ok: true,
      minecraft_uuid: uuid,
      claimed: items.map((row) => ({
        order_id: row.id,
        item_key: row.item_key,
        quantity: row.quantity,
      })),
    });
  }

  return null;
}
