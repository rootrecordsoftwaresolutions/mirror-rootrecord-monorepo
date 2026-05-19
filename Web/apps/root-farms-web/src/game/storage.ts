import { createInitialSave } from "./sim";

import type { GameSave } from "./types";



function storageKey(scope: string): string {

  return `rrfarms.save.${scope}`;

}

function pendingKey(scope: string): string {
  return `rrfarms.pending.${scope}`;
}

function lastHarvestKey(scope: string): string {
  return `rrfarms.lastHarvest.${scope}`;
}

function lastForegroundKey(scope: string): string {
  return `rrfarms.lastForeground.${scope}`;
}

/** Last time the app went to background (for welcome-back away time). */
export function loadLastForegroundMs(scope: string): number {
  try {
    const raw = localStorage.getItem(lastForegroundKey(scope));
    if (!raw) return 0;
    const parsed = JSON.parse(raw) as { at?: number };
    return Math.max(0, Math.floor(Number(parsed?.at) || 0));
  } catch {
    return 0;
  }
}

export function persistLastForegroundMs(scope: string, atMs: number): void {
  try {
    localStorage.setItem(lastForegroundKey(scope), JSON.stringify({ at: Math.floor(atMs) }));
  } catch {
    /* */
  }
}

const HARVEST_COOLDOWN_MS = 60_000;

export function loadLastHarvestMs(scope: string): number {
  try {
    const raw = localStorage.getItem(lastHarvestKey(scope));
    if (!raw) return 0;
    const parsed = JSON.parse(raw) as { at?: number };
    return Math.max(0, Math.floor(Number(parsed?.at) || 0));
  } catch {
    return 0;
  }
}

export function persistLastHarvestMs(scope: string, atMs: number): void {
  try {
    localStorage.setItem(lastHarvestKey(scope), JSON.stringify({ at: Math.floor(atMs) }));
  } catch {
    /* */
  }
}

export function harvestCooldownSecRemaining(scope: string, nowMs = Date.now()): number {
  const last = loadLastHarvestMs(scope);
  if (last <= 0) return 0;
  return Math.max(0, Math.ceil((HARVEST_COOLDOWN_MS - (nowMs - last)) / 1000));
}

export function loadPendingRu(scope: string): number {
  try {
    const raw = localStorage.getItem(pendingKey(scope));
    if (!raw) return 0;
    const parsed = JSON.parse(raw) as { ru?: number };
    return Math.max(0, Math.floor(Number(parsed?.ru) || 0));
  } catch {
    return 0;
  }
}

export function persistPendingRu(scope: string, ru: number): void {
  try {
    const n = Math.max(0, Math.floor(ru));
    if (n <= 0) {
      localStorage.removeItem(pendingKey(scope));
      return;
    }
    localStorage.setItem(pendingKey(scope), JSON.stringify({ ru: n, at: Date.now() }));
  } catch {
    /* */
  }
}



function sanitizeSave(save: GameSave): GameSave {
  return { ...save, version: 2, localBalance: 0 };
}

export function loadSave(scope: string): GameSave {

  try {

    const raw = localStorage.getItem(storageKey(scope));

    if (!raw) return createInitialSave();

    const parsed = JSON.parse(raw) as GameSave;

    if (!Array.isArray(parsed?.plots)) return createInitialSave();

    if (parsed.version !== 1 && parsed.version !== 2) return createInitialSave();

    return sanitizeSave({ ...parsed, version: 2 });

  } catch {

    return createInitialSave();

  }

}



export function persistSave(scope: string, save: GameSave): void {

  try {

    localStorage.setItem(storageKey(scope), JSON.stringify(save));

  } catch {

    /* quota */

  }

}



export function clearSave(scope: string): void {

  try {

    localStorage.removeItem(storageKey(scope));

  } catch {

    /* ignore */

  }

}


