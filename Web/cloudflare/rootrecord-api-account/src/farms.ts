import type { D1Database } from "@cloudflare/workers-types";
import { json } from "./cors";
import { resolveUserId } from "./auth";
import {
  CATALOG_HASH,
  FARMS_APP_ID,
  FARMS_DAILY_CAP,
  PLOT_COUNT,
  ROOT_CLUSTER_COUNT,
  createInitialPlots,
  getPlotCatalog,
  mergePlotsForSettle,
  parseClientPlots,
  parsePlotsJson,
  plotUnlockCost,
  plotsToJson,
  rootClusterCompleted,
  rootClusterCost,
  rowSlotCost,
  pendingRuSince,
  simulateHarvests,
  totalRuPerSec,
  type PlotProgress,
} from "./farms-catalog";
import {
  createInitialOrchards,
  createInitialVegetables,
  parseTierPlotsJson,
  simulateTierHarvests,
  tierPlotsToJson,
  vegetableRowCost,
  vegetableRuPerSec,
  vegetableUnlockCost,
  canUnlockVegetable,
  ORCHARD_COUNT,
  VEGETABLE_COUNT,
  type TierPlotProgress,
} from "./farms-orchards";
import { syncFarmAdvisories } from "./farms-advisory";
import { getLightningRowForClient } from "./farms-varmint";
import {
  LIGHTNING_ROD_COST,
  computeRootLevel,
  parseFarmsStore,
  farmsStoreToJson,
  protectionIncomeMultiplier,
  protectionIncomeReductionPerMinute,
  rootClusterIncomeMultiplier,
  vegetablesProtected,
  vegetablesUnlocked,
  type ProtectionKind,
} from "./farms-store";
import {
  ackVarmintEvents,
  listPendingVarmintEvents,
} from "./farms-varmint";
import { formatRootsAtomicLocale } from "../../shared/roots-units";
import { isDiscordWebhookUrl, notifySolanaToolsDiscord } from "./discord-solana-notify";

export interface FarmsEnv {
  DB: D1Database;
  JWT_SECRET: string;
  DISCORD_ROOT_ECONOMY_WEBHOOK_URL?: string;
}

const HARVEST_COOLDOWN_MS = 60_000;
const ORCHARD_APP_BONUS_WINDOW_MS = 24 * 60 * 60 * 1000;
const ORCHARD_APP_BONUS_PCT = 10;
const FARMHAND_CHECKIN_WINDOW_MS = 48 * 60 * 60 * 1000;
const FARMHAND_CHECKIN_APP_IDS = [FARMS_APP_ID, "root_farms_android"];
const INSUFFICIENT_FUNDS_REWARDED_AD_BONUS = 100_000; // 0.001 ROOTS
const MARKET_MIN_STAKE = 100_000; // 0.001 ROOTS
const MARKET_MAX_STAKE = 100_000_000; // 1 ROOT
const MARKET_WHEEL_SPIN_COST = 100_000; // 0.001 ROOTS

const MARKET_WHEEL_PRIZES = [
  { label: "0.0001 ROOTS", prize: 10_000, weight: 52_000, visualCount: 52 },
  { label: "0.0005 ROOTS", prize: 50_000, weight: 18_000, visualCount: 18 },
  { label: "0.001 ROOTS", prize: 100_000, weight: 14_000, visualCount: 14 },
  { label: "0.0015 ROOTS", prize: 150_000, weight: 10_000, visualCount: 10 },
  { label: "0.0025 ROOTS", prize: 250_000, weight: 4_000, visualCount: 4 },
  { label: "0.01 ROOTS", prize: 1_000_000, weight: 1_980, visualCount: 1 },
  { label: "1 ROOT", prize: 100_000_000, weight: 20, visualCount: 1 },
] as const;

const ROULETTE_RED_NUMBERS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);

type OrchardAppBonusTreeKey = "volcano" | "business" | "weather";

type OrchardAppBonusTree = {
  id: number;
  key: OrchardAppBonusTreeKey;
  name: string;
  appIds: string[];
};

const ORCHARD_APP_BONUS_TREES: OrchardAppBonusTree[] = [
  {
    id: 1,
    key: "volcano",
    name: "Volcano tree",
    appIds: ["rootrecord_kilauea_alerts_android", "rootrecord_kilauea_alerts_web"],
  },
  {
    id: 2,
    key: "business",
    name: "Business tree",
    appIds: ["rootrecord_business_manager_android", "rootrecord_business_manager_web"],
  },
  {
    id: 3,
    key: "weather",
    name: "Weather tree",
    appIds: ["rootrecord_weather_manager_android", "rootrecord_weather_manager_web"],
  },
];

type OrchardAppBonusStatus = {
  multiplier: number;
  active_count: number;
  trees: Array<{
    id: number;
    key: OrchardAppBonusTreeKey;
    name: string;
    unlocked: boolean;
    used_recently: boolean;
    active: boolean;
    bonus_pct: number;
    last_open_at: string | null;
  }>;
};

type FarmhandCheckinStatus = {
  active: boolean;
  last_checkin_at: string | null;
  expires_at: string | null;
  window_hours: number;
};

type ProgressRow = {
  progress_version: number;
  last_settled_ms: number;
  last_harvest_ms: number;
  lifetime_farms_earned: number;
  plots_json: string;
  store_json: string;
  orchards_json: string | null;
  vegetables_json: string | null;
};

type DiceRequestRow = {
  id: string;
  creator_user_id: string;
  joiner_user_id: string | null;
  stake: number;
  status: string;
  creator_roll: number | null;
  joiner_roll: number | null;
  winner_user_id: string | null;
  created_at: string;
  joined_at: string | null;
  resolved_at: string | null;
};

function parseOrchardsProgress(raw: string | null | undefined): TierPlotProgress[] {
  return parseTierPlotsJson(raw, ORCHARD_COUNT);
}

function parseVegetablesProgress(raw: string | null | undefined): TierPlotProgress[] {
  return parseTierPlotsJson(raw, VEGETABLE_COUNT);
}

function vegetableGrowSec(id: number): number {
  return Math.floor(3_600 * (6 + id * 2.2));
}

function vegetableRuRow(id: number): number {
  return Math.max(5, Math.floor(8 * Math.pow(2.1, id - 1)));
}

function grossFarmRuPerSec(plots: PlotProgress[], orchards: TierPlotProgress[], vegetables: TierPlotProgress[]): number {
  void orchards;
  return totalRuPerSec(plots) + vegetableRuPerSec(vegetables, 1);
}

async function loadOrchardAppBonusStatus(
  db: D1Database,
  userId: string,
  orchards: TierPlotProgress[],
  nowMs = Date.now(),
): Promise<OrchardAppBonusStatus> {
  const allAppIds = ORCHARD_APP_BONUS_TREES.flatMap((tree) => tree.appIds);
  const placeholders = allAppIds.map(() => "?").join(", ");
  const rows = await db
    .prepare(
      `SELECT app_id, last_open_at
       FROM rr_app_session_last_open
       WHERE user_id = ? AND app_id IN (${placeholders})`,
    )
    .bind(userId, ...allAppIds)
    .all<{ app_id: string; last_open_at: string }>()
    .catch(() => ({ results: [] as { app_id: string; last_open_at: string }[] }));
  const stateRows = await db
    .prepare(
      `SELECT app_id, updated_at AS last_open_at
       FROM rr_earn_state
       WHERE user_id = ? AND app_id IN (${placeholders})`,
    )
    .bind(userId, ...allAppIds)
    .all<{ app_id: string; last_open_at: string }>()
    .catch(() => ({ results: [] as { app_id: string; last_open_at: string }[] }));
  const lastOpenByApp = new Map<string, string>();
  for (const row of [...(rows.results ?? []), ...(stateRows.results ?? [])]) {
    const appId = String(row.app_id || "").trim();
    const lastOpenAt = String(row.last_open_at || "").trim();
    if (!appId || !lastOpenAt) continue;
    const current = lastOpenByApp.get(appId);
    if (!current || Date.parse(lastOpenAt) > Date.parse(current)) lastOpenByApp.set(appId, lastOpenAt);
  }

  void orchards;
  let activeCount = 0;
  const trees = ORCHARD_APP_BONUS_TREES.map((tree) => {
    const unlocked = true;
    const lastOpenAt =
      tree.appIds
        .map((appId) => lastOpenByApp.get(appId) || "")
        .filter(Boolean)
        .sort((a, b) => Date.parse(b) - Date.parse(a))[0] || null;
    const lastOpenMs = lastOpenAt ? Date.parse(lastOpenAt) : 0;
    const usedRecently = Number.isFinite(lastOpenMs) && lastOpenMs > 0 && nowMs - lastOpenMs <= ORCHARD_APP_BONUS_WINDOW_MS;
    const active = usedRecently;
    if (active) activeCount += 1;
    return {
      id: tree.id,
      key: tree.key,
      name: tree.name,
      unlocked,
      used_recently: usedRecently,
      active,
      bonus_pct: ORCHARD_APP_BONUS_PCT,
      last_open_at: lastOpenAt,
    };
  });

  return {
    multiplier: 1 + activeCount * (ORCHARD_APP_BONUS_PCT / 100),
    active_count: activeCount,
    trees,
  };
}

async function loadFarmhandCheckinStatus(db: D1Database, userId: string, nowMs = Date.now()): Promise<FarmhandCheckinStatus> {
  const placeholders = FARMHAND_CHECKIN_APP_IDS.map(() => "?").join(", ");
  const rows = await db
    .prepare(
      `SELECT app_id, last_open_at
       FROM rr_app_session_last_open
       WHERE user_id = ? AND app_id IN (${placeholders})`,
    )
    .bind(userId, ...FARMHAND_CHECKIN_APP_IDS)
    .all<{ app_id: string; last_open_at: string }>()
    .catch(() => ({ results: [] as { app_id: string; last_open_at: string }[] }));
  const stateRows = await db
    .prepare(
      `SELECT app_id, updated_at AS last_open_at
       FROM rr_earn_state
       WHERE user_id = ? AND app_id IN (${placeholders})`,
    )
    .bind(userId, ...FARMHAND_CHECKIN_APP_IDS)
    .all<{ app_id: string; last_open_at: string }>()
    .catch(() => ({ results: [] as { app_id: string; last_open_at: string }[] }));
  const lastOpenAt =
    [...(rows.results ?? []), ...(stateRows.results ?? [])]
      .map((row) => String(row.last_open_at || "").trim())
      .filter(Boolean)
      .sort((a, b) => Date.parse(b) - Date.parse(a))[0] || null;
  const lastOpenMs = lastOpenAt ? Date.parse(lastOpenAt) : 0;
  const active = Number.isFinite(lastOpenMs) && lastOpenMs > 0 && nowMs - lastOpenMs <= FARMHAND_CHECKIN_WINDOW_MS;
  const expiresAt =
    Number.isFinite(lastOpenMs) && lastOpenMs > 0 ? new Date(lastOpenMs + FARMHAND_CHECKIN_WINDOW_MS).toISOString() : null;
  return {
    active,
    last_checkin_at: lastOpenAt,
    expires_at: expiresAt,
    window_hours: 48,
  };
}

function pendingAllRu(
  plots: PlotProgress[],
  orchards: TierPlotProgress[],
  vegetables: TierPlotProgress[],
  lastSettledMs: number,
  nowMs: number,
  incomeMult: number,
): number {
  const fromMs = Math.max(0, Math.floor(Number(lastSettledMs) || 0));
  const roots = pendingRuSince(plots, fromMs, nowMs, incomeMult);
  void orchards;
  const v = simulateTierHarvests(vegetables, fromMs, nowMs, vegetableGrowSec, vegetableRuRow, incomeMult).granted;
  return roots + v;
}

function settleAllHarvests(
  plots: PlotProgress[],
  orchards: TierPlotProgress[],
  vegetables: TierPlotProgress[],
  fromMs: number,
  toMs: number,
  incomeMult: number,
): { granted: number; plots: PlotProgress[]; orchards: TierPlotProgress[]; vegetables: TierPlotProgress[] } {
  const r = simulateHarvests(plots, fromMs, toMs, incomeMult);
  const v = simulateTierHarvests(vegetables, fromMs, toMs, vegetableGrowSec, vegetableRuRow, incomeMult);
  return {
    granted: r.granted + v.granted,
    plots: r.plots,
    orchards,
    vegetables: v.plots,
  };
}

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

async function creditBalance(db: D1Database, userId: string, units: number, nowIso: string) {
  const amount = Math.max(0, Math.floor(Number(units) || 0));
  if (amount <= 0) return;
  await ensureBalance(db, userId, nowIso);
  await db
    .prepare("UPDATE rr_earn_balance SET balance = balance + ?, updated_at = ? WHERE user_id = ?")
    .bind(amount, nowIso, userId)
    .run();
}

function farmerLabel(userId: string | null | undefined): string {
  const clean = String(userId || "").replace(/[^a-z0-9]/gi, "");
  const suffix = clean.slice(-6).toUpperCase() || "ROOTS";
  return `Farmer ${suffix}`;
}

function emailFromUserId(userId: string): string | null {
  const raw = String(userId || "").trim();
  if (!raw.toLowerCase().startsWith("user:")) return null;
  const email = raw.slice(5).trim().toLowerCase();
  return email.includes("@") ? email : null;
}

async function accountIdForUserId(db: D1Database, userId: string): Promise<string | null> {
  const email = emailFromUserId(userId);
  if (!email) return null;
  const row = await db
    .prepare("SELECT id FROM license_accounts WHERE lower(trim(email)) = ? LIMIT 1")
    .bind(email)
    .first<{ id: string }>();
  const id = String(row?.id || "").trim();
  return id || null;
}

async function notifyCommunityDonation(
  env: FarmsEnv,
  input: {
    donationId: string;
    donorUserId: string;
    amount: number;
    distributed: number;
    share: number;
    recipients: number;
    remainder: number;
    transactionRows: number;
  },
): Promise<void> {
  const webhook = String(env.DISCORD_ROOT_ECONOMY_WEBHOOK_URL || "").trim();
  if (!webhook || !isDiscordWebhookUrl(webhook)) return;

  const lines = [
    "**ROOTS Community Donation**",
    `**Donor:** ${farmerLabel(input.donorUserId)}`,
    `**Donation:** ${formatRootsAtomicLocale(input.amount)} ROOTS`,
    `**Distributed:** ${formatRootsAtomicLocale(input.distributed)} ROOTS across **${input.recipients}** farmer${input.recipients === 1 ? "" : "s"}`,
    `**Each received:** ${formatRootsAtomicLocale(input.share)} ROOTS`,
    `**Transaction rows:** ${input.transactionRows}`,
    `**Donation ID:** \`${input.donationId}\``,
  ];
  if (input.remainder > 0) lines.push(`**Refunded remainder:** ${formatRootsAtomicLocale(input.remainder)} ROOTS`);
  lines.push("", "Board: https://farms.rootrecord.info/");
  await notifySolanaToolsDiscord(webhook, lines.join("\n"));
}

function randomInt(maxExclusive: number): number {
  const max = Math.max(1, Math.floor(maxExclusive));
  const bytes = new Uint32Array(1);
  crypto.getRandomValues(bytes);
  return bytes[0] % max;
}

function wheelVisualIndexForPrize(prize: number): number {
  let start = 0;
  for (const entry of MARKET_WHEEL_PRIZES) {
    const end = start + entry.visualCount;
    if (entry.prize === prize) return start + randomInt(entry.visualCount);
    start = end;
  }
  return 0;
}

function pickWheelPrize() {
  const totalWeight = MARKET_WHEEL_PRIZES.reduce((sum, entry) => sum + entry.weight, 0);
  let ticket = randomInt(totalWeight);
  for (const entry of MARKET_WHEEL_PRIZES) {
    if (ticket < entry.weight) return entry;
    ticket -= entry.weight;
  }
  return MARKET_WHEEL_PRIZES[0];
}

function rouletteColor(number: number): "red" | "black" | "green" {
  if (number === 0) return "green";
  return ROULETTE_RED_NUMBERS.has(number) ? "red" : "black";
}

function roulettePayoutMultiplier(betKind: string, number: number, straightNumber: number | null): number {
  const kind = String(betKind || "").trim().toLowerCase();
  const color = rouletteColor(number);
  if (kind === "red" || kind === "black") return color === kind ? 2 : 0;
  if (kind === "green") return number === 0 ? 36 : 0;
  if (kind === "odd") return number > 0 && number % 2 === 1 ? 2 : 0;
  if (kind === "even") return number > 0 && number % 2 === 0 ? 2 : 0;
  if (kind === "low") return number >= 1 && number <= 18 ? 2 : 0;
  if (kind === "high") return number >= 19 && number <= 36 ? 2 : 0;
  if (kind === "straight") return straightNumber != null && number === straightNumber ? 36 : 0;
  return 0;
}

function cardLabel(card: number): string {
  if (card === 1) return "A";
  if (card === 11) return "J";
  if (card === 12) return "Q";
  if (card === 13) return "K";
  return String(card);
}

async function debitMarketStake(db: D1Database, userId: string, amount: number, nowIso: string): Promise<boolean> {
  await ensureBalance(db, userId, nowIso);
  const debit = await db
    .prepare("UPDATE rr_earn_balance SET balance = balance - ?, updated_at = ? WHERE user_id = ? AND balance >= ?")
    .bind(amount, nowIso, userId, amount)
    .run();
  return (debit.meta?.changes ?? 0) === 1;
}

function normalizeMarketStake(raw: unknown): number {
  const amount = Math.floor(Number(raw) || 0);
  return Number.isFinite(amount) ? amount : 0;
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
      `SELECT progress_version, last_settled_ms, COALESCE(last_harvest_ms, 0) AS last_harvest_ms,
              lifetime_farms_earned, plots_json, COALESCE(store_json, '{}') AS store_json,
              orchards_json, vegetables_json
       FROM rr_farms_progress WHERE user_id = ?`,
    )
    .bind(userId)
    .first<ProgressRow>();
  if (row) return row;
  const plots = createInitialPlots();
  const orchards = tierPlotsToJson(createInitialOrchards());
  const vegetables = tierPlotsToJson(createInitialVegetables());
  await db
    .prepare(
      `INSERT INTO rr_farms_progress (user_id, progress_version, last_settled_ms, last_harvest_ms, lifetime_farms_earned, plots_json, store_json, orchards_json, vegetables_json, updated_at)
       VALUES (?, 1, ?, 0, 0, ?, '{}', ?, ?, ?)`,
    )
    .bind(userId, nowMs, plotsToJson(plots), orchards, vegetables, nowIso)
    .run();
  return {
    progress_version: 1,
    last_settled_ms: nowMs,
    last_harvest_ms: 0,
    lifetime_farms_earned: 0,
    plots_json: plotsToJson(plots),
    store_json: "{}",
    orchards_json: orchards,
    vegetables_json: vegetables,
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
  let storeJson = progress.store_json;
  const syncedStoreJson = await syncFarmAdvisories(db, userId, plots, storeJson);
  if (syncedStoreJson !== storeJson) {
    storeJson = syncedStoreJson;
    await db
      .prepare(`UPDATE rr_farms_progress SET store_json = ?, updated_at = ? WHERE user_id = ?`)
      .bind(storeJson, new Date().toISOString(), userId)
      .run();
  }
  const store = parseFarmsStore(storeJson);
  const orchards = parseOrchardsProgress(progress.orchards_json);
  const vegetables = parseVegetablesProgress(progress.vegetables_json);
  const grossRuPerSec = grossFarmRuPerSec(plots, orchards, vegetables);
  const orchardAppBonus = await loadOrchardAppBonusStatus(db, userId, orchards);
  const farmhandCheckin = await loadFarmhandCheckinStatus(db, userId);
  const incomeMult = protectionIncomeMultiplier(store);
  const totalIncomeMult = incomeMult * orchardAppBonus.multiplier * rootClusterIncomeMultiplier(store);
  const ruPerSec = grossRuPerSec * totalIncomeMult;
  const varmint_events = await listPendingVarmintEvents(db, userId);
  const nowMs = Date.now();
  const pending_ru = pendingAllRu(plots, orchards, vegetables, progress.last_settled_ms, nowMs, totalIncomeMult);
  const lightning_row = await getLightningRowForClient(db);
  return {
    ok: true,
    balance,
    ledger_balance: balance,
    pending_ru,
    progress_version: progress.progress_version,
    last_settled_ms: progress.last_settled_ms,
    lifetime_farms_earned: progress.lifetime_farms_earned,
    plots,
    orchards,
    vegetables,
    catalog_hash: CATALOG_HASH,
    protections: store.protections,
    store,
    root_level: computeRootLevel(plots, vegetables),
    orchards_unlocked: true,
    vegetables_unlocked: vegetablesUnlocked(plots, vegetables),
    vegetables_protected: farmhandCheckin.active && vegetablesProtected(store),
    farmhand_checkin: farmhandCheckin,
    lightning_row,
    ru_per_sec: ruPerSec,
    ru_per_sec_gross: grossRuPerSec,
    protection_income_reduction_pct: Math.round((1 - incomeMult) * 1000) / 10,
    protection_fee_per_minute: protectionIncomeReductionPerMinute(grossRuPerSec, store),
    orchard_app_bonus: orchardAppBonus,
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
  const orchards0 = parseOrchardsProgress(progress.orchards_json);
  const vegetables0 = parseVegetablesProgress(progress.vegetables_json);
  const fromMs = Math.max(0, Math.floor(Number(progress.last_settled_ms) || clientNowMs));
  const plots0 = mergePlotsForSettle(serverPlots, clientPlots, fromMs, clientNowMs);
  const store = parseFarmsStore(progress.store_json);
  const orchardAppBonus = await loadOrchardAppBonusStatus(db, userId, orchards0, clientNowMs);
  const incomeMult = protectionIncomeMultiplier(store) * orchardAppBonus.multiplier * rootClusterIncomeMultiplier(store);
  const settled = settleAllHarvests(plots0, orchards0, vegetables0, fromMs, clientNowMs, incomeMult);
  const rawGranted = settled.granted;
  const plots1 = settled.plots;
  const orchards1 = settled.orchards;
  const vegetables1 = settled.vegetables;
  const today0 = await getAppDay(db, userId, ymd);
  const dailyLeft = FARMS_DAILY_CAP > 0 ? Math.max(0, FARMS_DAILY_CAP - today0) : rawGranted;
  const balance0 = await getBalance(db, userId);

  if (rawGranted <= 0) {
    const pending_ru = pendingAllRu(plots0, orchards0, vegetables0, progress.last_settled_ms, clientNowMs, incomeMult);
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
        orchards: orchards0,
        vegetables: vegetables0,
        orchard_app_bonus: orchardAppBonus,
        pending_ru,
        daily_remaining: FARMS_DAILY_CAP > 0 ? dailyLeft : null,
        detail: "No new earnings since your last harvest.",
      },
    };
  }

  const granted = FARMS_DAILY_CAP > 0 ? Math.min(rawGranted, dailyLeft) : rawGranted;

  if (granted <= 0 && rawGranted > 0) {
    const pending_ru = pendingAllRu(plots0, orchards0, vegetables0, progress.last_settled_ms, clientNowMs, incomeMult);
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
        orchards: orchards0,
        vegetables: vegetables0,
        orchard_app_bonus: orchardAppBonus,
        pending_ru,
        daily_remaining: 0,
        detail: `Daily farms earning cap reached (${formatRootsAtomicLocale(FARMS_DAILY_CAP)} ROOTS per day).`,
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
        `UPDATE rr_farms_progress SET last_settled_ms = ?, lifetime_farms_earned = ?, plots_json = ?, orchards_json = ?, vegetables_json = ?, progress_version = ?, updated_at = ?
         WHERE user_id = ?`,
      )
      .bind(
        clientNowMs,
        newLifetime,
        plotsToJson(plots1),
        tierPlotsToJson(orchards1),
        tierPlotsToJson(vegetables1),
        newVersion,
        nowIso,
        userId,
      ),
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
      orchards: orchards1,
      vegetables: vegetables1,
      orchard_app_bonus: orchardAppBonus,
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

type PurchaseApplyResult =
  | { plots: PlotProgress[]; orchards: TierPlotProgress[]; vegetables: TierPlotProgress[]; store?: ReturnType<typeof parseFarmsStore> }
  | null;

function purchaseCost(
  kind: string,
  plotId: number,
  plots: PlotProgress[],
  orchards: TierPlotProgress[],
  vegetables: TierPlotProgress[],
  store: ReturnType<typeof parseFarmsStore>,
): number | null {
  if (kind === "buy_lightning_rod") {
    return store.lightning_rod_owned ? null : LIGHTNING_ROD_COST;
  }
  if (kind === "root_cluster") {
    if (store.root_clusters?.[plotId - 1]) return null;
    if (!rootClusterCompleted(plots, plotId)) return null;
    return rootClusterCost(plotId);
  }
  if (kind === "orchard_unlock" || kind === "orchard_row") return null;
  if (kind === "vegetable_unlock") {
    const v = vegetables.find((x) => x.id === plotId);
    if (!v || v.unlocked) return null;
    if (!canUnlockVegetable(plots, plotId, vegetables)) return null;
    return vegetableUnlockCost(plotId);
  }
  if (kind === "vegetable_row") {
    const v = vegetables.find((x) => x.id === plotId);
    if (!v?.unlocked) return null;
    return vegetableRowCost(plotId, v.rowCount);
  }
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

function applyPurchase(
  kind: string,
  plotId: number,
  plots: PlotProgress[],
  orchards: TierPlotProgress[],
  vegetables: TierPlotProgress[],
  store: ReturnType<typeof parseFarmsStore>,
): PurchaseApplyResult {
  if (kind === "buy_lightning_rod") {
    if (store.lightning_rod_owned) return null;
    return { plots, orchards, vegetables, store: { ...store, lightning_rod_owned: true } };
  }
  if (kind === "root_cluster") {
    if (store.root_clusters?.[plotId - 1] || !rootClusterCompleted(plots, plotId)) return null;
    const root_clusters = [...(store.root_clusters ?? [])];
    root_clusters[plotId - 1] = true;
    return { plots, orchards, vegetables, store: { ...store, root_clusters } };
  }
  if (kind === "orchard_unlock" || kind === "orchard_row") return null;
  const vIdx = vegetables.findIndex((x) => x.id === plotId);
  if (kind === "vegetable_unlock" && vIdx >= 0) {
    const v = vegetables[vIdx];
    if (v.unlocked || !canUnlockVegetable(plots, plotId, vegetables)) return null;
    const next = [...vegetables];
    next[vIdx] = { ...v, unlocked: true, rowCount: 1, rowsActive: 1, cycleProgress: 0 };
    return { plots, orchards, vegetables: next };
  }
  if (kind === "vegetable_row" && vIdx >= 0) {
    const v = vegetables[vIdx];
    if (!v.unlocked || v.rowCount >= 10) return null;
    const rowCount = v.rowCount + 1;
    const next = [...vegetables];
    next[vIdx] = { ...v, rowCount, rowsActive: rowCount };
    return { plots, orchards, vegetables: next };
  }
  const idx = plots.findIndex((p) => p.id === plotId);
  if (idx < 0) return null;
  const plot = plots[idx];
  const cat = getPlotCatalog(plotId);
  if (kind === "unlock_plot") {
    if (plot.unlocked || plotId <= 1 || !previousPlotUnlocked(plots, plotId)) return null;
    const next = [...plots];
    next[idx] = { ...plot, unlocked: true, rowCount: 1, rowsActive: 1, cycleProgress: 0 };
    return { plots: next, orchards, vegetables };
  }
  if (kind === "row_slot") {
    if (!plot.unlocked || plot.rowCount >= cat.maxRows) return null;
    const rowCount = plot.rowCount + 1;
    const next = [...plots];
    next[idx] = { ...plot, rowCount, rowsActive: rowCount };
    return { plots: next, orchards, vegetables };
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
    const orchards = parseOrchardsProgress(progress0.orchards_json);
    const vegetables = parseVegetablesProgress(progress0.vegetables_json);
    const store = parseFarmsStore(progress0.store_json);
    const orchardAppBonus = await loadOrchardAppBonusStatus(env.DB, userId, orchards, clientNowMs);
    const incomeMult = protectionIncomeMultiplier(store) * orchardAppBonus.multiplier * rootClusterIncomeMultiplier(store);
    const pending_ru = pendingAllRu(plots, orchards, vegetables, progress0.last_settled_ms, clientNowMs, incomeMult);
    return json(
      {
        detail: `Harvest again in ${retry_after_sec}s.`,
        retry_after_sec,
        harvest_cooldown_sec: retry_after_sec,
        balance,
        pending_ru,
        orchard_app_bonus: orchardAppBonus,
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
  const pendingPlots = Array.isArray(result.body.plots)
    ? (result.body.plots as PlotProgress[])
    : parsePlotsJson(progress0.plots_json);
  const pendingOrchards = Array.isArray(result.body.orchards)
    ? (result.body.orchards as TierPlotProgress[])
    : parseOrchardsProgress(progress0.orchards_json);
  const pendingVegetables = Array.isArray(result.body.vegetables)
    ? (result.body.vegetables as TierPlotProgress[])
    : parseVegetablesProgress(progress0.vegetables_json);
  const pending_ru =
    granted > 0
      ? 0
      : pendingAllRu(
          pendingPlots,
          pendingOrchards,
          pendingVegetables,
          Math.floor(Number(result.body.last_settled_ms) || clientNowMs),
          clientNowMs,
          protectionIncomeMultiplier(parseFarmsStore(progress0.store_json)) *
            Math.max(1, Number((result.body.orchard_app_bonus as OrchardAppBonusStatus | undefined)?.multiplier) || 1) *
            rootClusterIncomeMultiplier(parseFarmsStore(progress0.store_json)),
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

async function farmsRewardedAdBonus(request: Request, env: FarmsEnv): Promise<Response> {
  const u = await requireUser(request, env);
  if (u instanceof Response) return u;
  const userId = u;

  let body: { catalog_hash?: string } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ detail: "Invalid JSON" }, 400);
  }
  if (String(body.catalog_hash || "") !== CATALOG_HASH) {
    return json({ detail: "App catalog outdated. Update Root Farms and try again." }, 400);
  }

  const bonus = await creditAdDoubleBonus(env.DB, userId, INSUFFICIENT_FUNDS_REWARDED_AD_BONUS);
  return json({
    ok: true,
    bonus_granted: bonus.bonusGranted,
    balance: bonus.balance,
    lifetime_farms_earned: bonus.lifetime_farms_earned,
  });
}

function dicePayload(row: DiceRequestRow, userId: string) {
  return {
    id: row.id,
    stake: Math.max(0, Math.floor(Number(row.stake) || 0)),
    status: row.status,
    creator_label: farmerLabel(row.creator_user_id),
    joiner_label: row.joiner_user_id ? farmerLabel(row.joiner_user_id) : null,
    creator_roll: row.creator_roll,
    joiner_roll: row.joiner_roll,
    winner_label: row.winner_user_id ? farmerLabel(row.winner_user_id) : null,
    is_mine: row.creator_user_id === userId || row.joiner_user_id === userId,
    can_join: row.status === "open" && row.creator_user_id !== userId,
    created_at: row.created_at,
    joined_at: row.joined_at,
    resolved_at: row.resolved_at,
  };
}

async function diceMarketPayload(db: D1Database, userId: string) {
  const balance = await getBalance(db, userId);
  const rows = await db
    .prepare(
      `SELECT id, creator_user_id, joiner_user_id, stake, status, creator_roll, joiner_roll, winner_user_id,
              created_at, joined_at, resolved_at
       FROM rr_farms_dice_requests
       ORDER BY CASE WHEN status = 'open' THEN 0 ELSE 1 END, created_at DESC
       LIMIT 40`,
    )
    .all<DiceRequestRow>();
  return {
    ok: true,
    balance,
    requests: (rows.results ?? []).map((row) => dicePayload(row, userId)),
  };
}

async function farmsDiceMarket(request: Request, env: FarmsEnv): Promise<Response> {
  const u = await requireUser(request, env);
  if (u instanceof Response) return u;
  const userId = u;
  if (request.method === "GET") return json(await diceMarketPayload(env.DB, userId));

  let body: { catalog_hash?: string; stake?: number } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ detail: "Invalid JSON" }, 400);
  }
  if (String(body.catalog_hash || "") !== CATALOG_HASH) {
    return json({ detail: "App catalog outdated. Update Root Farms and try again." }, 400);
  }
  const stake = Math.floor(Number(body.stake) || 0);
  if (stake < 100_000) return json({ detail: "Minimum dice request stake is 0.001 ROOTS." }, 400);
  if (stake > 100_000_000) return json({ detail: "Maximum dice request stake is 1 ROOTS." }, 400);

  const nowIso = new Date().toISOString();
  await ensureBalance(env.DB, userId, nowIso);
  const debit = await env.DB
    .prepare("UPDATE rr_earn_balance SET balance = balance - ?, updated_at = ? WHERE user_id = ? AND balance >= ?")
    .bind(stake, nowIso, userId, stake)
    .run();
  if ((debit.meta?.changes ?? 0) !== 1) {
    return json({ ...(await diceMarketPayload(env.DB, userId)), detail: "Insufficient ROOTS for this dice request." }, 409);
  }

  const id = crypto.randomUUID();
  try {
    await env.DB
      .prepare(
        `INSERT INTO rr_farms_dice_requests (id, creator_user_id, stake, status, created_at)
         VALUES (?, ?, ?, 'open', ?)`,
      )
      .bind(id, userId, stake, nowIso)
      .run();
  } catch {
    await creditBalance(env.DB, userId, stake, nowIso).catch(() => {});
    return json({ detail: "Could not create dice request. Try again." }, 500);
  }

  return json(await diceMarketPayload(env.DB, userId));
}

async function farmsDiceJoin(request: Request, env: FarmsEnv, diceId: string): Promise<Response> {
  const u = await requireUser(request, env);
  if (u instanceof Response) return u;
  const userId = u;
  let body: { catalog_hash?: string } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ detail: "Invalid JSON" }, 400);
  }
  if (String(body.catalog_hash || "") !== CATALOG_HASH) {
    return json({ detail: "App catalog outdated. Update Root Farms and try again." }, 400);
  }

  const row = await env.DB
    .prepare(
      `SELECT id, creator_user_id, joiner_user_id, stake, status, creator_roll, joiner_roll, winner_user_id,
              created_at, joined_at, resolved_at
       FROM rr_farms_dice_requests
       WHERE id = ?`,
    )
    .bind(diceId)
    .first<DiceRequestRow>();
  if (!row || row.status !== "open") return json({ ...(await diceMarketPayload(env.DB, userId)), detail: "Dice request is no longer open." }, 409);
  if (row.creator_user_id === userId) return json({ ...(await diceMarketPayload(env.DB, userId)), detail: "You cannot join your own dice request." }, 400);

  const stake = Math.max(0, Math.floor(Number(row.stake) || 0));
  const nowIso = new Date().toISOString();
  await ensureBalance(env.DB, userId, nowIso);
  const debit = await env.DB
    .prepare("UPDATE rr_earn_balance SET balance = balance - ?, updated_at = ? WHERE user_id = ? AND balance >= ?")
    .bind(stake, nowIso, userId, stake)
    .run();
  if ((debit.meta?.changes ?? 0) !== 1) {
    return json({ ...(await diceMarketPayload(env.DB, userId)), detail: "Insufficient ROOTS to join this dice request." }, 409);
  }

  const creatorRoll = Math.floor(Math.random() * 6) + 1;
  const joinerRoll = Math.floor(Math.random() * 6) + 1;
  const winnerUserId = creatorRoll === joinerRoll ? null : creatorRoll > joinerRoll ? row.creator_user_id : userId;
  const status = creatorRoll === joinerRoll ? "tie" : "resolved";
  const update = await env.DB
    .prepare(
      `UPDATE rr_farms_dice_requests
       SET joiner_user_id = ?, status = ?, creator_roll = ?, joiner_roll = ?, winner_user_id = ?, joined_at = ?, resolved_at = ?
       WHERE id = ? AND status = 'open'`,
    )
    .bind(userId, status, creatorRoll, joinerRoll, winnerUserId, nowIso, nowIso, diceId)
    .run();
  if ((update.meta?.changes ?? 0) !== 1) {
    await creditBalance(env.DB, userId, stake, nowIso).catch(() => {});
    return json({ ...(await diceMarketPayload(env.DB, userId)), detail: "Dice request was already joined." }, 409);
  }

  if (winnerUserId) {
    await creditBalance(env.DB, winnerUserId, stake * 2, nowIso);
  } else {
    await creditBalance(env.DB, row.creator_user_id, stake, nowIso);
    await creditBalance(env.DB, userId, stake, nowIso);
  }

  return json(await diceMarketPayload(env.DB, userId));
}

async function farmsMarketDonate(request: Request, env: FarmsEnv): Promise<Response> {
  const u = await requireUser(request, env);
  if (u instanceof Response) return u;
  const userId = u;

  let body: { catalog_hash?: string; amount?: number } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ detail: "Invalid JSON" }, 400);
  }
  if (String(body.catalog_hash || "") !== CATALOG_HASH) {
    return json({ detail: "App catalog outdated. Update Root Farms and try again." }, 400);
  }

  const amount = Math.floor(Number(body.amount) || 0);
  if (amount <= 0) return json({ ...(await diceMarketPayload(env.DB, userId)), detail: "Enter a ROOTS donation amount." }, 400);

  const fromAccountId = await accountIdForUserId(env.DB, userId);
  if (!fromAccountId) {
    return json({ ...(await diceMarketPayload(env.DB, userId)), detail: "Could not locate your account for donation transactions." }, 400);
  }

  const recipients = await env.DB
    .prepare(
      `SELECT p.user_id, la.id AS account_id
       FROM rr_farms_progress p
       JOIN license_accounts la ON p.user_id = ('user:' || lower(trim(la.email)))
       WHERE p.user_id != ? AND p.user_id LIKE 'user:%'
       ORDER BY p.user_id`,
    )
    .bind(userId)
    .all<{ user_id: string; account_id: string }>();
  const recipientMap = new Map<string, string>();
  for (const row of recipients.results ?? []) {
    const recipientUserId = String(row.user_id || "").trim();
    const recipientAccountId = String(row.account_id || "").trim();
    if (recipientUserId && recipientAccountId) recipientMap.set(recipientUserId, recipientAccountId);
  }
  const recipientIds = [...recipientMap.keys()];
  if (recipientIds.length <= 0) {
    return json({ ...(await diceMarketPayload(env.DB, userId)), detail: "No other farmers are available to receive a donation yet." }, 400);
  }

  const share = Math.floor(amount / recipientIds.length);
  if (share <= 0) {
    return json({ ...(await diceMarketPayload(env.DB, userId)), detail: "Donation is too small to split across all farmers." }, 400);
  }
  const distributed = share * recipientIds.length;
  const remainder = amount - distributed;
  const nowIso = new Date().toISOString();
  await ensureBalance(env.DB, userId, nowIso);
  const debit = await env.DB
    .prepare("UPDATE rr_earn_balance SET balance = balance - ?, updated_at = ? WHERE user_id = ? AND balance >= ?")
    .bind(amount, nowIso, userId, amount)
    .run();
  if ((debit.meta?.changes ?? 0) !== 1) {
    return json({ ...(await diceMarketPayload(env.DB, userId)), detail: "Insufficient ROOTS for this Well donation." }, 409);
  }

  const donationId = crypto.randomUUID();
  const transactionRows: string[] = [];
  try {
    const statements = [];
    for (const recipientId of recipientIds) {
      const toAccountId = recipientMap.get(recipientId);
      if (!toAccountId) throw new Error("missing recipient account");
      await ensureBalance(env.DB, recipientId, nowIso);
      const rowId = `${donationId}:${transactionRows.length + 1}`;
      transactionRows.push(rowId);
      statements.push(
        env.DB.prepare("UPDATE rr_earn_balance SET balance = balance + ?, updated_at = ? WHERE user_id = ?").bind(share, nowIso, recipientId),
        env.DB
          .prepare(
            `INSERT INTO rr_earn_internal_transfer (
               id, from_user_id, to_user_id, units, from_account_id, to_account_id, created_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(rowId, userId, recipientId, share, fromAccountId, toAccountId, nowIso),
      );
    }
    if (remainder > 0) {
      statements.push(
        env.DB.prepare("UPDATE rr_earn_balance SET balance = balance + ?, updated_at = ? WHERE user_id = ?").bind(remainder, nowIso, userId),
      );
    }
    if (statements.length > 0) {
      await env.DB.batch(statements);
    }
  } catch {
    await creditBalance(env.DB, userId, amount, nowIso).catch(() => {});
    return json({ ...(await diceMarketPayload(env.DB, userId)), detail: "Donation failed and was refunded." }, 500);
  }

  await notifyCommunityDonation(env, {
    donationId,
    donorUserId: userId,
    amount,
    distributed,
    share,
    recipients: recipientIds.length,
    remainder,
    transactionRows: transactionRows.length,
  }).catch(() => {});

  return json({
    ...(await diceMarketPayload(env.DB, userId)),
    detail: `Donated ${formatRootsAtomicLocale(distributed)} ROOTS across ${recipientIds.length} farmers (${formatRootsAtomicLocale(share)} each).${
      remainder > 0 ? ` Refunded ${formatRootsAtomicLocale(remainder)} ROOTS remainder.` : ""
    }`,
  });
}

async function farmsMarketWheelSpin(request: Request, env: FarmsEnv): Promise<Response> {
  const u = await requireUser(request, env);
  if (u instanceof Response) return u;
  const userId = u;

  let body: { catalog_hash?: string } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ detail: "Invalid JSON" }, 400);
  }
  if (String(body.catalog_hash || "") !== CATALOG_HASH) {
    return json({ detail: "App catalog outdated. Update Root Farms and try again." }, 400);
  }

  const nowIso = new Date().toISOString();
  await ensureBalance(env.DB, userId, nowIso);
  const debit = await env.DB
    .prepare("UPDATE rr_earn_balance SET balance = balance - ?, updated_at = ? WHERE user_id = ? AND balance >= ?")
    .bind(MARKET_WHEEL_SPIN_COST, nowIso, userId, MARKET_WHEEL_SPIN_COST)
    .run();
  if ((debit.meta?.changes ?? 0) !== 1) {
    return json({ ...(await diceMarketPayload(env.DB, userId)), detail: "Insufficient ROOTS to spin The Well wheel." }, 409);
  }

  const prize = pickWheelPrize();
  await creditBalance(env.DB, userId, prize.prize, nowIso);
  const balance = await getBalance(env.DB, userId);
  return json({
    ok: true,
    cost: MARKET_WHEEL_SPIN_COST,
    prize: prize.prize,
    label: prize.label,
    net: prize.prize - MARKET_WHEEL_SPIN_COST,
    visual_index: wheelVisualIndexForPrize(prize.prize),
    balance,
  });
}

async function farmsMarketRouletteSpin(request: Request, env: FarmsEnv): Promise<Response> {
  const u = await requireUser(request, env);
  if (u instanceof Response) return u;
  const userId = u;

  let body: { catalog_hash?: string; amount?: number; bet_kind?: string; number?: number } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ detail: "Invalid JSON" }, 400);
  }
  if (String(body.catalog_hash || "") !== CATALOG_HASH) {
    return json({ detail: "App catalog outdated. Update Root Farms and try again." }, 400);
  }

  const amount = normalizeMarketStake(body.amount);
  if (amount < MARKET_MIN_STAKE || amount > MARKET_MAX_STAKE) {
    return json({ ok: true, balance: await getBalance(env.DB, userId), detail: "Roulette stake must be 0.001 to 1 ROOTS." }, 400);
  }

  const betKind = String(body.bet_kind || "").trim().toLowerCase();
  const validKinds = new Set(["red", "black", "green", "odd", "even", "low", "high", "straight"]);
  if (!validKinds.has(betKind)) {
    return json({ ok: true, balance: await getBalance(env.DB, userId), detail: "Choose a valid roulette bet." }, 400);
  }

  const straightRaw = Number(body.number);
  const straightNumber = betKind === "straight" && Number.isFinite(straightRaw) ? Math.floor(straightRaw) : null;
  if (betKind === "straight" && (straightNumber == null || straightNumber < 0 || straightNumber > 36)) {
    return json({ ok: true, balance: await getBalance(env.DB, userId), detail: "Straight number must be 0-36." }, 400);
  }

  const nowIso = new Date().toISOString();
  const debited = await debitMarketStake(env.DB, userId, amount, nowIso);
  if (!debited) {
    return json({ ok: true, balance: await getBalance(env.DB, userId), detail: "Insufficient ROOTS for roulette." }, 409);
  }

  const number = randomInt(37);
  const color = rouletteColor(number);
  const multiplier = roulettePayoutMultiplier(betKind, number, straightNumber);
  const payout = amount * multiplier;
  if (payout > 0) await creditBalance(env.DB, userId, payout, nowIso);
  const balance = await getBalance(env.DB, userId);

  return json({
    ok: true,
    game: "roulette",
    amount,
    bet_kind: betKind,
    bet_number: straightNumber,
    outcome_number: number,
    outcome_color: color,
    multiplier,
    won: payout > 0,
    payout,
    net: payout - amount,
    balance,
  });
}

async function farmsMarketHiLoPlay(request: Request, env: FarmsEnv): Promise<Response> {
  const u = await requireUser(request, env);
  if (u instanceof Response) return u;
  const userId = u;

  let body: { catalog_hash?: string; amount?: number; guess?: string } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ detail: "Invalid JSON" }, 400);
  }
  if (String(body.catalog_hash || "") !== CATALOG_HASH) {
    return json({ detail: "App catalog outdated. Update Root Farms and try again." }, 400);
  }

  const amount = normalizeMarketStake(body.amount);
  if (amount < MARKET_MIN_STAKE || amount > MARKET_MAX_STAKE) {
    return json({ ok: true, balance: await getBalance(env.DB, userId), detail: "Hi-Lo stake must be 0.001 to 1 ROOTS." }, 400);
  }

  const guess = String(body.guess || "").trim().toLowerCase();
  if (guess !== "high" && guess !== "low") {
    return json({ ok: true, balance: await getBalance(env.DB, userId), detail: "Choose high or low." }, 400);
  }

  const nowIso = new Date().toISOString();
  const debited = await debitMarketStake(env.DB, userId, amount, nowIso);
  if (!debited) {
    return json({ ok: true, balance: await getBalance(env.DB, userId), detail: "Insufficient ROOTS for Hi-Lo." }, 409);
  }

  const firstCard = randomInt(13) + 1;
  const nextCard = randomInt(13) + 1;
  const tie = firstCard === nextCard;
  const won = !tie && (guess === "high" ? nextCard > firstCard : nextCard < firstCard);
  const payout = tie ? amount : won ? Math.floor(amount * 1.95) : 0;
  if (payout > 0) await creditBalance(env.DB, userId, payout, nowIso);
  const balance = await getBalance(env.DB, userId);

  return json({
    ok: true,
    game: "hi_lo",
    amount,
    guess,
    first_card: firstCard,
    next_card: nextCard,
    first_label: cardLabel(firstCard),
    next_label: cardLabel(nextCard),
    tie,
    won,
    payout,
    net: payout - amount,
    balance,
  });
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
  const tierKinds = new Set([
    "unlock_plot",
    "row_slot",
    "root_cluster",
    "buy_lightning_rod",
    "orchard_unlock",
    "orchard_row",
    "vegetable_unlock",
    "vegetable_row",
  ]);
  if (!kind || !tierKinds.has(kind)) return json({ detail: "Invalid purchase kind." }, 400);
  if (kind === "buy_lightning_rod") {
    if (plotId !== 0 && plotId !== 1) return json({ detail: "plot_id not used for lightning rod." }, 400);
  } else if (kind === "root_cluster") {
    if (plotId < 1 || plotId > ROOT_CLUSTER_COUNT) return json({ detail: "Invalid root cluster id." }, 400);
  } else if (kind.startsWith("orchard_")) {
    if (plotId < 1 || plotId > ORCHARD_COUNT) return json({ detail: "Invalid orchard id." }, 400);
  } else if (kind.startsWith("vegetable_")) {
    if (plotId < 1 || plotId > VEGETABLE_COUNT) return json({ detail: "Invalid vegetable id." }, 400);
  } else if (plotId < 1 || plotId > PLOT_COUNT) {
    return json({ detail: "Invalid plot id." }, 400);
  }

  const clientNowMs = Math.floor(Number(body.client_now_ms) || Date.now());
  const expectedVersion = Math.floor(Number(body.progress_version) || 0);
  if (expectedVersion <= 0) return json({ detail: "progress_version required." }, 400);

  const settled = await settleUser(env.DB, userId, clientNowMs, expectedVersion);
  if (!settled.ok) return json(settled.body, settled.status);

  const versionAfterSettle = Math.floor(Number(settled.body.progress_version) || 0);
  const nowIso = new Date().toISOString();
  const progress = await loadOrCreateProgress(env.DB, userId, clientNowMs, nowIso);
  const plots = parsePlotsJson(progress.plots_json);
  const orchards = parseOrchardsProgress(progress.orchards_json);
  const vegetables = parseVegetablesProgress(progress.vegetables_json);
  const store = parseFarmsStore(progress.store_json);
  const cost = purchaseCost(kind, plotId, plots, orchards, vegetables, store);
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

  const applied = applyPurchase(kind, plotId, plots, orchards, vegetables, store);
  if (!applied) {
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
        ...(await statePayload(
          env.DB,
          userId,
          balance,
          progress,
          plots,
          Number(settled.body.daily_remaining) || 0,
        )),
        detail: "Insufficient Root Units for this purchase.",
        balance,
        cost,
      },
      409,
    );
  }

  const versionForUpdate = versionAfterSettle > 0 ? versionAfterSettle : progress.progress_version;
  const nextStore = applied.store ?? store;
  const upd = await env.DB
    .prepare(
      `UPDATE rr_farms_progress SET plots_json = ?, orchards_json = ?, vegetables_json = ?, store_json = ?, progress_version = progress_version + 1, updated_at = ?
       WHERE user_id = ? AND progress_version = ?`,
    )
    .bind(
      plotsToJson(applied.plots),
      tierPlotsToJson(applied.orchards),
      tierPlotsToJson(applied.vegetables),
      farmsStoreToJson(nextStore),
      nowIso,
      userId,
      versionForUpdate,
    )
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

  const storeJsonAfter = farmsStoreToJson(nextStore);
  const advisoryJson = await syncFarmAdvisories(env.DB, userId, applied.plots, storeJsonAfter);
  if (advisoryJson !== storeJsonAfter) {
    await env.DB
      .prepare(`UPDATE rr_farms_progress SET store_json = ? WHERE user_id = ?`)
      .bind(advisoryJson, userId)
      .run();
  }
  const storeOut = parseFarmsStore(advisoryJson);
  const varmint_events = await listPendingVarmintEvents(env.DB, userId, 12);
  const orchard_app_bonus = await loadOrchardAppBonusStatus(env.DB, userId, applied.orchards, clientNowMs);

  return json({
    ok: true,
    kind,
    plot_id: plotId,
    cost,
    balance,
    progress_version: newVersion,
    last_settled_ms: progress.last_settled_ms,
    lifetime_farms_earned: progress.lifetime_farms_earned,
    plots: applied.plots,
    orchards: applied.orchards,
    vegetables: applied.vegetables,
    store: storeOut,
    orchard_app_bonus,
    varmint_events,
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
  const kind = String(body.kind || "").trim();
  const allowed = new Set(["gopher", "mice", "rabbit", "lightning_meteorologist", "cypress_trees"]);
  if (!allowed.has(kind)) {
    return json({ detail: "Invalid store kind." }, 400);
  }
  const enabled = Boolean(body.enabled);
  const expectedVersion = Math.floor(Number(body.progress_version) || 0);
  const nowIso = new Date().toISOString();
  const nowMs = Date.now();
  const progress = await loadOrCreateProgress(env.DB, userId, nowMs, nowIso);
  if (expectedVersion > 0 && progress.progress_version !== expectedVersion) {
    return json({ detail: "Progress version mismatch. Refresh and try again." }, 409);
  }
  const store = parseFarmsStore(progress.store_json);
  if (kind === "gopher" || kind === "mice" || kind === "rabbit") {
    store.protections[kind as ProtectionKind] = enabled;
  } else if (kind === "lightning_meteorologist") {
    store.lightning_meteorologist = enabled;
  } else if (kind === "cypress_trees") {
    store.cypress_trees = enabled;
  }
  const upd = await env.DB.prepare(
    `UPDATE rr_farms_progress SET store_json = ?, progress_version = progress_version + 1, updated_at = ?
     WHERE user_id = ? AND progress_version = ?`,
  )
    .bind(farmsStoreToJson(store), nowIso, userId, progress.progress_version)
    .run();
  if ((upd.meta?.changes ?? 0) !== 1) {
    return json({ detail: "Progress changed. Refresh and try again." }, 409);
  }
  const balance = await getBalance(env.DB, userId);
  const plots = parsePlotsJson(progress.plots_json);
  const nextProgress: ProgressRow = {
    ...progress,
    progress_version: progress.progress_version + 1,
    store_json: farmsStoreToJson(store),
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
  if (sub === "/v1/farms/rewarded-ad-bonus" && method === "POST") return farmsRewardedAdBonus(request, env);
  if (sub === "/v1/farms/market/dice" && (method === "GET" || method === "POST")) return farmsDiceMarket(request, env);
  const diceJoinMatch = sub.match(/^\/v1\/farms\/market\/dice\/([^/]+)\/join$/);
  if (diceJoinMatch && method === "POST") return farmsDiceJoin(request, env, decodeURIComponent(diceJoinMatch[1]));
  if (sub === "/v1/farms/market/donate" && method === "POST") return farmsMarketDonate(request, env);
  if (sub === "/v1/farms/market/wheel/spin" && method === "POST") return farmsMarketWheelSpin(request, env);
  if (sub === "/v1/farms/market/roulette/spin" && method === "POST") return farmsMarketRouletteSpin(request, env);
  if (sub === "/v1/farms/market/hi-lo/play" && method === "POST") return farmsMarketHiLoPlay(request, env);
  if (sub === "/v1/farms/purchase" && method === "POST") return farmsPurchase(request, env);
  if (sub === "/v1/farms/store/toggle" && method === "POST") return farmsStoreToggle(request, env);
  if (sub === "/v1/farms/varmint/ack" && method === "POST") return farmsVarmintAck(request, env);
  return json({ detail: "Not found" }, 404);
}
