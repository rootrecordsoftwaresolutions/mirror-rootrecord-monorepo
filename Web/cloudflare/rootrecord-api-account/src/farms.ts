import type { D1Database } from "@cloudflare/workers-types";
import { json } from "./cors";
import { resolveUserId } from "./auth";
import {
  CATALOG_HASH,
  FARMS_APP_ID,
  FARMS_DAILY_CAP,
  PLOT_COUNT,
  createInitialPlots,
  getPlotCatalog,
  mergePlotsForSettle,
  parseClientPlots,
  parsePlotsJson,
  plotUnlockCost,
  plotsToJson,
  rowSlotCost,
  pendingRuSince,
  simulateHarvests,
  totalRuPerSec,
  type PlotProgress,
} from "./farms-catalog";
import {
  ackVarmintEvents,
  listPendingVarmintEvents,
  parseStoreJson,
  protectionIncomeMultiplier,
  protectionIncomeReductionPerMinute,
  storeToJson,
  type FarmsProtections,
  type ProtectionKind,
} from "./farms-varmint";

export interface FarmsEnv {
  DB: D1Database;
  JWT_SECRET: string;
}

const HARVEST_COOLDOWN_MS = 60_000;

type ProgressRow = {
  progress_version: number;
  last_settled_ms: number;
  last_harvest_ms: number;
  lifetime_farms_earned: number;
  plots_json: string;
  store_json: string;
};

function utcYmd(): string {
  return new Date().toISOString().slice(0, 10);
}

async function requireUser(request: Request, env: FarmsEnv): Promise<string | Response> {
  const u = await resolveUserId(request, env);
  if (u instanceof Response) return u;
  if (!u.startsWith("user:")) return json({ detail: "Sign in required." }, 401);
  return u;
}

async function ensureBalance(db: D1Database, userId: string, nowIso: string) {
  await db
    .prepare("INSERT OR IGNORE INTO rr_earn_balance (user_id, balance, updated_at) VALUES (?, 0, ?)")
    .bind(userId, nowIso)
    .run();
}

async function getBalance(db: D1Database, userId: string): Promise<number> {
  const row = await db.prepare("SELECT balance FROM rr_earn_balance WHERE user_id = ?").bind(userId).first<{ balance: number }>();
  return row ? Math.max(0, Math.floor(Number(row.balance) || 0)) : 0;
}

async function getAppDay(db: D1Database, userId: string, ymd: string): Promise<number> {
  const row = await db
    .prepare("SELECT units_earned FROM rr_earn_app_day WHERE user_id = ? AND app_id = ? AND ymd = ?")
    .bind(userId, FARMS_APP_ID, ymd)
    .first<{ units_earned: number }>();
  return row ? Math.max(0, Math.floor(Number(row.units_earned) || 0)) : 0;
}

async function incAppTotals(db: D1Database, userId: string, ymd: string, units: number, nowIso: string) {
  const iu = Math.floor(units);
  if (iu <= 0) return;
  await db
    .prepare(
      `INSERT INTO rr_earn_app_day (user_id, app_id, ymd, units_earned, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(user_id, app_id, ymd) DO UPDATE SET
         units_earned = units_earned + excluded.units_earned,
         updated_at = excluded.updated_at`,
    )
    .bind(userId, FARMS_APP_ID, ymd, iu, nowIso)
    .run();
  const rowT = await db
    .prepare("SELECT total_units FROM rr_earn_app_total WHERE user_id = ? AND app_id = ?")
    .bind(userId, FARMS_APP_ID)
    .first<{ total_units: number }>();
  const start = rowT ? Math.max(0, Math.floor(Number(rowT.total_units) || 0)) : 0;
  await db
    .prepare(
      `INSERT INTO rr_earn_app_total (user_id, app_id, total_units, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id, app_id) DO UPDATE SET total_units = ?, updated_at = ?`,
    )
    .bind(userId, FARMS_APP_ID, start + iu, nowIso, start + iu, nowIso)
    .run();
}

async function loadOrCreateProgress(db: D1Database, userId: string, nowMs: number, nowIso: string): Promise<ProgressRow> {
  const row = await db
    .prepare(
      "SELECT progress_version, last_settled_ms, COALESCE(last_harvest_ms, 0) AS last_harvest_ms, lifetime_farms_earned, plots_json, COALESCE(store_json, '{}') AS store_json FROM rr_farms_progress WHERE user_id = ?",
    )
    .bind(userId)
    .first<ProgressRow>();
  if (row) return row;
  const plots = createInitialPlots();
  await db
    .prepare(
      `INSERT INTO rr_farms_progress (user_id, progress_version, last_settled_ms, last_harvest_ms, lifetime_farms_earned, plots_json, store_json, updated_at)
       VALUES (?, 1, ?, 0, 0, ?, '{}', ?)`,
    )
    .bind(userId, nowMs, plotsToJson(plots), nowIso)
    .run();
  return {
    progress_version: 1,
    last_settled_ms: nowMs,
    last_harvest_ms: 0,
    lifetime_farms_earned: 0,
    plots_json: plotsToJson(plots),
    store_json: "{}",
  };
}

async function statePayload(
  db: D1Database,
  userId: string,
  balance: number,
  progress: ProgressRow,
  plots: PlotProgress[],
  dailyRemaining: number,
) {
  const protections = parseStoreJson(progress.store_json);
  const grossRuPerSec = totalRuPerSec(plots);
  const incomeMult = protectionIncomeMultiplier(protections);
  const ruPerSec = grossRuPerSec * incomeMult;
  const varmint_events = await listPendingVarmintEvents(db, userId);
  const nowMs = Date.now();
  const pending_ru = pendingRuSince(plots, progress.last_settled_ms, nowMs, incomeMult);
  return {
    ok: true,
    balance,
    ledger_balance: balance,
    pending_ru,
    progress_version: progress.progress_version,
    last_settled_ms: progress.last_settled_ms,
    lifetime_farms_earned: progress.lifetime_farms_earned,
    plots,
    catalog_hash: CATALOG_HASH,
    protections,
    ru_per_sec: ruPerSec,
    ru_per_sec_gross: grossRuPerSec,
    protection_income_reduction_pct: Math.round((1 - incomeMult) * 1000) / 10,
    protection_fee_per_minute: protectionIncomeReductionPerMinute(grossRuPerSec, protections),
    varmint_events,
    daily: {
      ymd: utcYmd(),
      daily_cap: FARMS_DAILY_CAP > 0 ? FARMS_DAILY_CAP : null,
      daily_remaining: FARMS_DAILY_CAP > 0 ? dailyRemaining : null,
    },
  };
}

async function settleUser(
  db: D1Database,
  userId: string,
  clientNowMs: number,
  expectedVersion: number | null,
  clientPlots: PlotProgress[] | null = null,
): Promise<{ ok: true; body: Record<string, unknown> } | { ok: false; status: number; body: Record<string, unknown> }> {
  const nowIso = new Date().toISOString();
  const ymd = utcYmd();
  await ensureBalance(db, userId, nowIso);

  const progress = await loadOrCreateProgress(db, userId, clientNowMs, nowIso);
  if (expectedVersion != null && expectedVersion > 0 && progress.progress_version !== expectedVersion) {
    const balance = await getBalance(db, userId);
    const plots = parsePlotsJson(progress.plots_json);
    const today = await getAppDay(db, userId, ymd);
    return {
      ok: false,
      status: 409,
      body: {
        detail: "Progress version mismatch. Refresh and try again.",
        ...(await statePayload(db, userId, balance, progress, plots, Math.max(0, FARMS_DAILY_CAP - today))),
      },
    };
  }

  const serverPlots = parsePlotsJson(progress.plots_json);
  const fromMs = Math.max(0, Math.floor(Number(progress.last_settled_ms) || clientNowMs));
  const plots0 = mergePlotsForSettle(serverPlots, clientPlots, fromMs, clientNowMs);
  const protections = parseStoreJson(progress.store_json);
  const incomeMult = protectionIncomeMultiplier(protections);
  const { granted: rawGranted, plots: plots1 } = simulateHarvests(plots0, fromMs, clientNowMs, incomeMult);
  const today0 = await getAppDay(db, userId, ymd);
  const dailyLeft = FARMS_DAILY_CAP > 0 ? Math.max(0, FARMS_DAILY_CAP - today0) : rawGranted;
  const balance0 = await getBalance(db, userId);

  if (rawGranted <= 0) {
    const pending_ru = pendingRuSince(plots0, progress.last_settled_ms, clientNowMs, incomeMult);
    return {
      ok: true,
      body: {
        ok: true,
        granted: 0,
        raw_granted: 0,
        balance: balance0,
        last_settled_ms: progress.last_settled_ms,
        progress_version: progress.progress_version,
        lifetime_farms_earned: progress.lifetime_farms_earned,
        plots: serverPlots,
        pending_ru,
        daily_remaining: FARMS_DAILY_CAP > 0 ? dailyLeft : null,
        detail: "No new earnings since your last harvest.",
      },
    };
  }

  const granted = FARMS_DAILY_CAP > 0 ? Math.min(rawGranted, dailyLeft) : rawGranted;

  if (granted <= 0 && rawGranted > 0) {
    const pending_ru = pendingRuSince(plots0, progress.last_settled_ms, clientNowMs, incomeMult);
    return {
      ok: true,
      body: {
        ok: true,
        granted: 0,
        raw_granted: rawGranted,
        daily_cap_blocked: true,
        balance: balance0,
        last_settled_ms: progress.last_settled_ms,
        progress_version: progress.progress_version,
        lifetime_farms_earned: progress.lifetime_farms_earned,
        plots: serverPlots,
        pending_ru,
        daily_remaining: 0,
        detail: `Daily farms earning cap reached (${FARMS_DAILY_CAP} Root Units per day).`,
      },
    };
  }

  const newBalance = balance0 + granted;
  const newLifetime = progress.lifetime_farms_earned + granted;
  const newVersion = progress.progress_version + 1;

  const stmts = [
    db
      .prepare("UPDATE rr_earn_balance SET balance = ?, updated_at = ? WHERE user_id = ?")
      .bind(newBalance, nowIso, userId),
    db
      .prepare(
        `UPDATE rr_farms_progress SET last_settled_ms = ?, lifetime_farms_earned = ?, plots_json = ?, progress_version = ?, updated_at = ?
         WHERE user_id = ?`,
      )
      .bind(clientNowMs, newLifetime, plotsToJson(plots1), newVersion, nowIso, userId),
  ];
  await db.batch(stmts);
  if (granted > 0) await incAppTotals(db, userId, ymd, granted, nowIso);

  const today1 = today0 + granted;

  return {
    ok: true,
    body: {
      ok: true,
      granted,
      raw_granted: rawGranted,
      balance: newBalance,
      last_settled_ms: clientNowMs,
      progress_version: newVersion,
      lifetime_farms_earned: newLifetime,
      plots: plots1,
      daily_remaining: FARMS_DAILY_CAP > 0 ? Math.max(0, FARMS_DAILY_CAP - today1) : null,
      pending_ru: 0,
    },
  };
}

/** Rewarded ad: credit the same amount again (2× total) without a second settle pass. */
async function creditAdDoubleBonus(
  db: D1Database,
  userId: string,
  baseGranted: number,
): Promise<{ bonusGranted: number; balance: number; lifetime_farms_earned: number }> {
  if (baseGranted <= 0) {
    const balance = await getBalance(db, userId);
    const progress = await db
      .prepare("SELECT lifetime_farms_earned FROM rr_farms_progress WHERE user_id = ?")
      .bind(userId)
      .first<{ lifetime_farms_earned: number }>();
    return {
      bonusGranted: 0,
      balance,
      lifetime_farms_earned: Math.max(0, Math.floor(Number(progress?.lifetime_farms_earned) || 0)),
    };
  }
  const nowIso = new Date().toISOString();
  const ymd = utcYmd();
  await ensureBalance(db, userId, nowIso);
  const today0 = await getAppDay(db, userId, ymd);
  const dailyLeft = FARMS_DAILY_CAP > 0 ? Math.max(0, FARMS_DAILY_CAP - today0) : baseGranted;
  const bonusGranted = FARMS_DAILY_CAP > 0 ? Math.min(baseGranted, dailyLeft) : baseGranted;
  const balance0 = await getBalance(db, userId);
  if (bonusGranted <= 0) {
    const progress = await db
      .prepare("SELECT lifetime_farms_earned FROM rr_farms_progress WHERE user_id = ?")
      .bind(userId)
      .first<{ lifetime_farms_earned: number }>();
    return {
      bonusGranted: 0,
      balance: balance0,
      lifetime_farms_earned: Math.max(0, Math.floor(Number(progress?.lifetime_farms_earned) || 0)),
    };
  }
  const newBalance = balance0 + bonusGranted;
  await db
    .prepare("UPDATE rr_earn_balance SET balance = ?, updated_at = ? WHERE user_id = ?")
    .bind(newBalance, nowIso, userId)
    .run();
  await incAppTotals(db, userId, ymd, bonusGranted, nowIso);
  await db
    .prepare(
      "UPDATE rr_farms_progress SET lifetime_farms_earned = lifetime_farms_earned + ?, updated_at = ? WHERE user_id = ?",
    )
    .bind(bonusGranted, nowIso, userId)
    .run();
  const progress = await db
    .prepare("SELECT lifetime_farms_earned FROM rr_farms_progress WHERE user_id = ?")
    .bind(userId)
    .first<{ lifetime_farms_earned: number }>();
  return {
    bonusGranted,
    balance: newBalance,
    lifetime_farms_earned: Math.max(0, Math.floor(Number(progress?.lifetime_farms_earned) || 0)),
  };
}

function previousPlotUnlocked(plots: PlotProgress[], plotId: number): boolean {
  if (plotId <= 1) return true;
  const prev = plots.find((p) => p.id === plotId - 1);
  return Boolean(prev?.unlocked);
}

async function purchaseErrorPayload(
  db: D1Database,
  userId: string,
  progress: ProgressRow,
  plots: PlotProgress[],
  detail: string,
  extra?: Record<string, unknown>,
) {
  const balance = await getBalance(db, userId);
  const today = await getAppDay(db, userId, utcYmd());
  return {
    detail,
    ...(await statePayload(db, userId, balance, progress, plots, Math.max(0, FARMS_DAILY_CAP - today))),
    ...extra,
  };
}

function purchaseCost(kind: string, plotId: number, plots: PlotProgress[]): number | null {
  const plot = plots.find((p) => p.id === plotId);
  if (!plot) return null;
  if (kind === "unlock_plot") {
    if (plot.unlocked || plotId <= 1) return null;
    if (!previousPlotUnlocked(plots, plotId)) return null;
    return plotUnlockCost(plotId);
  }
  if (kind === "row_slot") {
    if (!plot.unlocked) return null;
    const cat = getPlotCatalog(plotId);
    if (plot.rowCount >= cat.maxRows) return null;
    return rowSlotCost(plotId, plot.rowCount);
  }
  return null;
}

function applyPurchase(kind: string, plotId: number, plots: PlotProgress[], lifetime: number): PlotProgress[] | null {
  const idx = plots.findIndex((p) => p.id === plotId);
  if (idx < 0) return null;
  const plot = plots[idx];
  const cat = getPlotCatalog(plotId);

  if (kind === "unlock_plot") {
    if (plot.unlocked || plotId <= 1) return null;
    if (!previousPlotUnlocked(plots, plotId)) return null;
    const next = [...plots];
    next[idx] = { ...plot, unlocked: true, rowCount: 1, rowsActive: 1, cycleProgress: 0 };
    return next;
  }

  if (kind === "row_slot") {
    if (!plot.unlocked) return null;
    if (plot.rowCount >= cat.maxRows) return null;
    const rowCount = plot.rowCount + 1;
    const next = [...plots];
    next[idx] = { ...plot, rowCount, rowsActive: rowCount };
    return next;
  }

  return null;
}

async function farmsState(request: Request, env: FarmsEnv): Promise<Response> {
  const u = await requireUser(request, env);
  if (u instanceof Response) return u;
  const userId = u;
  const nowIso = new Date().toISOString();
  const nowMs = Date.now();
  await ensureBalance(env.DB, userId, nowIso);
  const progress = await loadOrCreateProgress(env.DB, userId, nowMs, nowIso);
  const balance = await getBalance(env.DB, userId);
  const plots = parsePlotsJson(progress.plots_json);
  const today = await getAppDay(env.DB, userId, utcYmd());
  return json(
    await statePayload(env.DB, userId, balance, progress, plots, Math.max(0, FARMS_DAILY_CAP - today)),
  );
}

async function farmsSettle(request: Request, env: FarmsEnv): Promise<Response> {
  const u = await requireUser(request, env);
  if (u instanceof Response) return u;
  const userId = u;
  const nowIso = new Date().toISOString();
  let body: {
    client_now_ms?: number;
    progress_version?: number;
    catalog_hash?: string;
    plots?: unknown;
    rewarded_double?: boolean;
  } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ detail: "Invalid JSON" }, 400);
  }
  if (String(body.catalog_hash || "") !== CATALOG_HASH) {
    return json({ detail: "App catalog outdated. Update Root Farms and try again." }, 400);
  }
  const serverNowMs = Date.now();
  const clientNowMs = Math.min(serverNowMs + 60_000, Math.floor(Number(body.client_now_ms) || serverNowMs));
  const expectedVersion =
    body.progress_version != null ? Math.floor(Number(body.progress_version) || 0) : null;
  const clientPlots = parseClientPlots(body.plots);
  const rewardedDouble = body.rewarded_double === true;

  const progress0 = await loadOrCreateProgress(env.DB, userId, clientNowMs, nowIso);
  const lastHarvestMs = Math.max(0, Math.floor(Number(progress0.last_harvest_ms) || 0));
  const sinceHarvest = clientNowMs - lastHarvestMs;
  if (lastHarvestMs > 0 && sinceHarvest < HARVEST_COOLDOWN_MS) {
    const retry_after_sec = Math.max(1, Math.ceil((HARVEST_COOLDOWN_MS - sinceHarvest) / 1000));
    const balance = await getBalance(env.DB, userId);
    const plots = parsePlotsJson(progress0.plots_json);
    const protections = parseStoreJson(progress0.store_json);
    const incomeMult = protectionIncomeMultiplier(protections);
    const pending_ru = pendingRuSince(plots, progress0.last_settled_ms, clientNowMs, incomeMult);
    return json(
      {
        detail: `Harvest again in ${retry_after_sec}s.`,
        retry_after_sec,
        harvest_cooldown_sec: retry_after_sec,
        balance,
        pending_ru,
        progress_version: progress0.progress_version,
        last_settled_ms: progress0.last_settled_ms,
      },
      429,
    );
  }

  const result = await settleUser(env.DB, userId, clientNowMs, expectedVersion, clientPlots);
  if (!result.ok) return json(result.body, result.status);

  const granted = Math.floor(Number(result.body.granted) || 0);
  if (granted > 0) {
    await env.DB
      .prepare("UPDATE rr_farms_progress SET last_harvest_ms = ?, updated_at = ? WHERE user_id = ?")
      .bind(clientNowMs, nowIso, userId)
      .run();
  }

  const cooldownSec = granted > 0 ? Math.ceil(HARVEST_COOLDOWN_MS / 1000) : 0;
  const pending_ru =
    granted > 0
      ? 0
      : pendingRuSince(
          (Array.isArray(result.body.plots) ? (result.body.plots as PlotProgress[]) : parsePlotsJson(progress0.plots_json)),
          Math.floor(Number(result.body.last_settled_ms) || clientNowMs),
          clientNowMs,
          protectionIncomeMultiplier(parseStoreJson(progress0.store_json)),
        );
  let responseBody: Record<string, unknown> = { ...result.body, pending_ru, harvest_cooldown_sec: cooldownSec };
  if (rewardedDouble && granted > 0) {
    const bonus = await creditAdDoubleBonus(env.DB, userId, granted);
    if (bonus.bonusGranted > 0) {
      responseBody = {
        ...responseBody,
        granted: granted + bonus.bonusGranted,
        ad_bonus_granted: bonus.bonusGranted,
        balance: bonus.balance,
        lifetime_farms_earned: bonus.lifetime_farms_earned,
      };
    }
  }
  return json(responseBody, 200);
}

async function farmsPurchase(request: Request, env: FarmsEnv): Promise<Response> {
  const u = await requireUser(request, env);
  if (u instanceof Response) return u;
  const userId = u;

  let body: {
    kind?: string;
    plot_id?: number;
    progress_version?: number;
    catalog_hash?: string;
    client_now_ms?: number;
  } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ detail: "Invalid JSON" }, 400);
  }

  if (String(body.catalog_hash || "") !== CATALOG_HASH) {
    return json({ detail: "App catalog outdated. Update Root Farms and try again." }, 400);
  }

  const kind = String(body.kind || "").trim();
  const plotId = Math.floor(Number(body.plot_id) || 0);
  if (!kind || plotId < 1 || plotId > PLOT_COUNT) return json({ detail: "Invalid purchase." }, 400);

  const clientNowMs = Math.floor(Number(body.client_now_ms) || Date.now());
  const expectedVersion = Math.floor(Number(body.progress_version) || 0);
  if (expectedVersion <= 0) return json({ detail: "progress_version required." }, 400);

  const settled = await settleUser(env.DB, userId, clientNowMs, expectedVersion);
  if (!settled.ok) return json(settled.body, settled.status);

  const versionAfterSettle = Math.floor(Number(settled.body.progress_version) || 0);
  const nowIso = new Date().toISOString();
  const progress = await loadOrCreateProgress(env.DB, userId, clientNowMs, nowIso);
  const plots = parsePlotsJson(progress.plots_json);
  const cost = purchaseCost(kind, plotId, plots);
  if (cost == null) {
    const body = await purchaseErrorPayload(
      env.DB,
      userId,
      progress,
      plots,
      kind === "unlock_plot" ? "Unlock the previous plot first." : "Purchase not available.",
    );
    return json(body, 400);
  }

  const nextPlots = applyPurchase(kind, plotId, plots, progress.lifetime_farms_earned);
  if (!nextPlots) {
    const body = await purchaseErrorPayload(env.DB, userId, progress, plots, "Purchase not allowed.");
    return json(body, 400);
  }

  const debit = await env.DB
    .prepare(
      `UPDATE rr_earn_balance SET balance = balance - ?, updated_at = ? WHERE user_id = ? AND balance >= ?`,
    )
    .bind(cost, nowIso, userId, cost)
    .run();
  if ((debit.meta?.changes ?? 0) !== 1) {
    const balance = await getBalance(env.DB, userId);
    return json(
      {
        detail: "Insufficient Root Units for this purchase.",
        balance,
        cost,
        ...(await statePayload(
          env.DB,
          userId,
          balance,
          progress,
          plots,
          Number(settled.body.daily_remaining) || 0,
        )),
      },
      409,
    );
  }

  const versionForUpdate = versionAfterSettle > 0 ? versionAfterSettle : progress.progress_version;
  const upd = await env.DB
    .prepare(
      `UPDATE rr_farms_progress SET plots_json = ?, progress_version = progress_version + 1, updated_at = ?
       WHERE user_id = ? AND progress_version = ?`,
    )
    .bind(plotsToJson(nextPlots), nowIso, userId, versionForUpdate)
    .run();
  if ((upd.meta?.changes ?? 0) !== 1) {
    const balance = await getBalance(env.DB, userId);
    await env.DB
      .prepare("UPDATE rr_earn_balance SET balance = balance + ?, updated_at = ? WHERE user_id = ?")
      .bind(cost, nowIso, userId)
      .run()
      .catch(() => {});
    const body = await purchaseErrorPayload(env.DB, userId, progress, plots, "Progress changed. Refresh and try again.", {
      balance,
    });
    return json(body, 409);
  }

  const balance = await getBalance(env.DB, userId);
  const newVersion = versionForUpdate + 1;

  return json({
    ok: true,
    kind,
    plot_id: plotId,
    cost,
    balance,
    progress_version: newVersion,
    last_settled_ms: progress.last_settled_ms,
    lifetime_farms_earned: progress.lifetime_farms_earned,
    plots: nextPlots,
    daily_remaining: settled.body.daily_remaining,
  });
}

async function farmsStoreToggle(request: Request, env: FarmsEnv): Promise<Response> {
  const u = await requireUser(request, env);
  if (u instanceof Response) return u;
  const userId = u;
  let body: { kind?: string; enabled?: boolean; progress_version?: number; catalog_hash?: string } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ detail: "Invalid JSON" }, 400);
  }
  if (String(body.catalog_hash || "") !== CATALOG_HASH) {
    return json({ detail: "App catalog outdated. Update Root Farms and try again." }, 400);
  }
  const kind = String(body.kind || "").trim() as ProtectionKind;
  if (kind !== "gopher" && kind !== "mice" && kind !== "rabbit") {
    return json({ detail: "kind must be gopher, mice, or rabbit." }, 400);
  }
  const enabled = Boolean(body.enabled);
  const expectedVersion = Math.floor(Number(body.progress_version) || 0);
  const nowIso = new Date().toISOString();
  const nowMs = Date.now();
  const progress = await loadOrCreateProgress(env.DB, userId, nowMs, nowIso);
  if (expectedVersion > 0 && progress.progress_version !== expectedVersion) {
    return json({ detail: "Progress version mismatch. Refresh and try again." }, 409);
  }
  const protections = parseStoreJson(progress.store_json);
  protections[kind] = enabled;
  const upd = await env.DB.prepare(
    `UPDATE rr_farms_progress SET store_json = ?, progress_version = progress_version + 1, updated_at = ?
     WHERE user_id = ? AND progress_version = ?`,
  )
    .bind(storeToJson(protections), nowIso, userId, progress.progress_version)
    .run();
  if ((upd.meta?.changes ?? 0) !== 1) {
    return json({ detail: "Progress changed. Refresh and try again." }, 409);
  }
  const balance = await getBalance(env.DB, userId);
  const plots = parsePlotsJson(progress.plots_json);
  const nextProgress: ProgressRow = {
    ...progress,
    progress_version: progress.progress_version + 1,
    store_json: storeToJson(protections),
  };
  const today = await getAppDay(env.DB, userId, utcYmd());
  return json(
    await statePayload(env.DB, userId, balance, nextProgress, plots, Math.max(0, FARMS_DAILY_CAP - today)),
  );
}

async function farmsVarmintAck(request: Request, env: FarmsEnv): Promise<Response> {
  const u = await requireUser(request, env);
  if (u instanceof Response) return u;
  const userId = u;
  let body: { event_ids?: string[] } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ detail: "Invalid JSON" }, 400);
  }
  const ids = Array.isArray(body.event_ids) ? body.event_ids.map(String) : [];
  await ackVarmintEvents(env.DB, userId, ids);
  return json({ ok: true });
}

export async function handleFarmsRoutes(
  request: Request,
  env: FarmsEnv,
  sub: string,
  method: string,
): Promise<Response | null> {
  if (!sub.startsWith("/v1/farms/")) return null;
  if (sub === "/v1/farms/state" && method === "GET") return farmsState(request, env);
  if (sub === "/v1/farms/settle" && method === "POST") return farmsSettle(request, env);
  if (sub === "/v1/farms/purchase" && method === "POST") return farmsPurchase(request, env);
  if (sub === "/v1/farms/store/toggle" && method === "POST") return farmsStoreToggle(request, env);
  if (sub === "/v1/farms/varmint/ack" && method === "POST") return farmsVarmintAck(request, env);
  return json({ detail: "Not found" }, 404);
}
