import type { D1Database } from "@cloudflare/workers-types";
import { parsePlotsJson, plotsToJson, type PlotProgress } from "./farms-catalog";

export type ProtectionKind = "gopher" | "mice" | "rabbit";

export type FarmsProtections = {
  gopher: boolean;
  mice: boolean;
  rabbit: boolean;
};

const PROTECTION_FEE_RATE: Record<ProtectionKind, number> = {
  gopher: 0.01,
  mice: 0.01,
  rabbit: 0.03,
};

/** Multiplier on farm income (1 = full rate). Each active plan lowers income rate by its fee %. */
export function protectionIncomeMultiplier(protections: FarmsProtections): number {
  let reduction = 0;
  if (protections.gopher) reduction += PROTECTION_FEE_RATE.gopher;
  if (protections.mice) reduction += PROTECTION_FEE_RATE.mice;
  if (protections.rabbit) reduction += PROTECTION_FEE_RATE.rabbit;
  return Math.max(0, 1 - reduction);
}

/** Income rate reduction from protections, in Root Units per minute (not debited from balance). */
export function protectionIncomeReductionPerMinute(grossRuPerSec: number, protections: FarmsProtections): number {
  const grossPerMin = Math.max(0, grossRuPerSec * 60);
  const mult = protectionIncomeMultiplier(protections);
  return Math.floor(grossPerMin * (1 - mult));
}

/** Per-minute attack roll (unprotected accounts with active rows). */
const ATTACK_CHANCE: Record<ProtectionKind, number> = {
  gopher: 1 / 250,
  mice: 1 / 320,
  rabbit: 1 / 1800,
};

const CRON_SAMPLE_SIZE = 40;

export type VarmintEventKind =
  | "gopher_attack"
  | "gopher_blocked"
  | "mice_attack"
  | "mice_blocked"
  | "rabbit_attack"
  | "rabbit_blocked"
  | "protection_disabled";

export function defaultProtections(): FarmsProtections {
  return { gopher: false, mice: false, rabbit: false };
}

export function parseStoreJson(raw: string | null | undefined): FarmsProtections {
  const base = defaultProtections();
  if (!raw) return base;
  try {
    const o = JSON.parse(raw) as { protections?: Record<string, unknown> };
    const p = o?.protections;
    if (!p || typeof p !== "object") return base;
    return {
      gopher: Boolean(p.gopher),
      mice: Boolean(p.mice),
      rabbit: Boolean(p.rabbit),
    };
  } catch {
    return base;
  }
}

export function storeToJson(protections: FarmsProtections): string {
  return JSON.stringify({ protections });
}

function hasActiveRows(plots: PlotProgress[]): boolean {
  return plots.some((p) => p.unlocked && p.rowsActive > 0);
}

function randomInt(max: number): number {
  if (max <= 0) return 0;
  return Math.floor(Math.random() * max);
}

function pickPlotWithRows(plots: PlotProgress[]): PlotProgress | null {
  const eligible = plots.filter((p) => p.unlocked && p.rowsActive > 0);
  if (!eligible.length) return null;
  return eligible[randomInt(eligible.length)]!;
}

function pickPlotWithRowSlots(plots: PlotProgress[]): PlotProgress | null {
  const eligible = plots.filter((p) => p.unlocked && p.rowCount > 0);
  if (!eligible.length) return null;
  return eligible[randomInt(eligible.length)]!;
}

function applyGopherDamage(plots: PlotProgress[], plotId: number): PlotProgress[] {
  return plots.map((p) => {
    if (p.id !== plotId) return p;
    const rowsActive = Math.max(0, p.rowsActive - 1);
    return { ...p, rowsActive };
  });
}

function applyMiceDamage(plots: PlotProgress[], plotId: number): PlotProgress[] {
  return plots.map((p) => {
    if (p.id !== plotId) return p;
    const rowCount = Math.max(0, p.rowCount - 1);
    const rowsActive = Math.min(p.rowsActive, rowCount);
    return { ...p, rowCount, rowsActive };
  });
}

function applyRabbitDamage(plots: PlotProgress[], plotId: number): PlotProgress[] {
  return plots.map((p) => {
    if (p.id !== plotId) return p;
    return { ...p, rowCount: 0, rowsActive: 0, cycleProgress: 0 };
  });
}

function eventMessage(kind: VarmintEventKind, plotId: number): string {
  switch (kind) {
    case "gopher_attack":
      return `A gopher gnawed a row on plot ${plotId}.`;
    case "gopher_blocked":
      return `Gopher protection stopped an attack on plot ${plotId}.`;
    case "mice_attack":
      return `Field mice destroyed a row on plot ${plotId}.`;
    case "mice_blocked":
      return `Field mice protection stopped an attack on plot ${plotId}.`;
    case "rabbit_attack":
      return `A rabbit wiped every row on plot ${plotId}.`;
    case "rabbit_blocked":
      return `Rabbit protection stopped an attack on plot ${plotId}.`;
    case "protection_disabled":
      return "A protection plan was turned off.";
    default:
      return "Varmint activity on your farm.";
  }
}

export async function insertVarmintEvent(
  db: D1Database,
  userId: string,
  eventKind: VarmintEventKind,
  plotId: number | null,
  extra?: Record<string, unknown>,
): Promise<string> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO rr_farms_varmint_events (id, user_id, event_kind, plot_id, payload_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(id, userId, eventKind, plotId, JSON.stringify(extra ?? {}), now)
    .run();
  return id;
}

export async function listPendingVarmintEvents(db: D1Database, userId: string, limit = 20) {
  const rows = await db
    .prepare(
      `SELECT id, event_kind, plot_id, payload_json, created_at
       FROM rr_farms_varmint_events
       WHERE user_id = ? AND acked_at IS NULL
       ORDER BY created_at ASC
       LIMIT ?`,
    )
    .bind(userId, limit)
    .all<{
      id: string;
      event_kind: string;
      plot_id: number | null;
      payload_json: string;
      created_at: string;
    }>();
  return (rows.results || []).map((r) => ({
    id: r.id,
    kind: r.event_kind,
    plot_id: r.plot_id != null ? Math.floor(Number(r.plot_id)) : null,
    message: eventMessage(r.event_kind as VarmintEventKind, Math.floor(Number(r.plot_id) || 0)),
    created_at: r.created_at,
    payload: (() => {
      try {
        return JSON.parse(r.payload_json || "{}") as Record<string, unknown>;
      } catch {
        return {};
      }
    })(),
  }));
}

export async function ackVarmintEvents(db: D1Database, userId: string, ids: string[]): Promise<void> {
  const clean = ids.map((x) => String(x).trim()).filter((x) => x.length > 8).slice(0, 50);
  if (!clean.length) return;
  const now = new Date().toISOString();
  for (const id of clean) {
    await db
      .prepare(
        `UPDATE rr_farms_varmint_events SET acked_at = ? WHERE user_id = ? AND id = ? AND acked_at IS NULL`,
      )
      .bind(now, userId, id)
      .run();
  }
}

function rollAttack(kind: ProtectionKind): boolean {
  return Math.random() < ATTACK_CHANCE[kind];
}

async function processVarmintForUser(
  db: D1Database,
  userId: string,
  plotsJson: string,
  storeJson: string,
  progressVersion: number,
): Promise<void> {
  let plots = parsePlotsJson(plotsJson);
  if (!hasActiveRows(plots)) return;

  const protections = parseStoreJson(storeJson);

  let plotsChanged = false;
  const kinds: ProtectionKind[] = ["gopher", "mice", "rabbit"];

  for (const kind of kinds) {
    if (!rollAttack(kind)) continue;

    const protectedOn = protections[kind];
    if (kind === "rabbit") {
      const target = pickPlotWithRowSlots(plots);
      if (!target) continue;
      if (protectedOn) {
        await insertVarmintEvent(db, userId, "rabbit_blocked", target.id, { plot_id: target.id });
        continue;
      }
      plots = applyRabbitDamage(plots, target.id);
      plotsChanged = true;
      await insertVarmintEvent(db, userId, "rabbit_attack", target.id, { plot_id: target.id });
      continue;
    }

    if (kind === "mice") {
      const target = pickPlotWithRowSlots(plots);
      if (!target) continue;
      if (protectedOn) {
        await insertVarmintEvent(db, userId, "mice_blocked", target.id, { plot_id: target.id });
        continue;
      }
      plots = applyMiceDamage(plots, target.id);
      plotsChanged = true;
      await insertVarmintEvent(db, userId, "mice_attack", target.id, { plot_id: target.id });
      continue;
    }

    const target = pickPlotWithRows(plots);
    if (!target) continue;
    if (protectedOn) {
      await insertVarmintEvent(db, userId, "gopher_blocked", target.id, { plot_id: target.id });
      continue;
    }
    plots = applyGopherDamage(plots, target.id);
    plotsChanged = true;
    await insertVarmintEvent(db, userId, "gopher_attack", target.id, { plot_id: target.id });
  }

  const storeChanged =
    JSON.stringify(protections) !== JSON.stringify(parseStoreJson(storeJson));
  if (!plotsChanged && !storeChanged) return;

  const nowIso = new Date().toISOString();
  await db
    .prepare(
      `UPDATE rr_farms_progress
       SET plots_json = ?, store_json = ?, progress_version = progress_version + 1, updated_at = ?
       WHERE user_id = ? AND progress_version = ?`,
    )
    .bind(plotsToJson(plots), storeToJson(protections), nowIso, userId, progressVersion)
    .run();
}

/** Called from account Worker `* * * * *` cron — random global varmint tick. */
export async function runFarmsVarmintCron(db: D1Database): Promise<{ sampled: number; processed: number }> {
  const rows = await db
    .prepare(
      `SELECT user_id, plots_json, COALESCE(store_json, '{}') AS store_json, progress_version
       FROM rr_farms_progress
       ORDER BY RANDOM()
       LIMIT ?`,
    )
    .bind(CRON_SAMPLE_SIZE)
    .all<{
      user_id: string;
      plots_json: string;
      store_json: string;
      progress_version: number;
    }>();

  const list = rows.results || [];
  let processed = 0;
  for (const r of list) {
    try {
      await processVarmintForUser(db, r.user_id, r.plots_json, r.store_json, r.progress_version);
      processed += 1;
    } catch (e) {
      console.error("farms_varmint_user_err", r.user_id, e instanceof Error ? e.message : String(e));
    }
  }
  return { sampled: list.length, processed };
}

/** @deprecated Use protectionIncomeReductionPerMinute — kept for API field name compatibility. */
export function protectionFeePerMinute(ruPerSec: number, protections: FarmsProtections): number {
  return protectionIncomeReductionPerMinute(ruPerSec, protections);
}
