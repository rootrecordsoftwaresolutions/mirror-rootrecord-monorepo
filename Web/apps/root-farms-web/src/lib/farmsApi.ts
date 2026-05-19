import { CATALOG_HASH } from "../game/catalog";
import type { FarmsProtections, ProtectionKind, VarmintEvent } from "../game/storeCatalog";

import type { GameSave } from "../game/types";

import { apiFetch } from "./api";



export type FarmsStateResponse = {

  ok: boolean;

  balance: number;

  progress_version: number;

  last_settled_ms: number;

  lifetime_farms_earned: number;

  plots?: GameSave["plots"];

  daily_remaining?: number;

  protections?: FarmsProtections;

  ru_per_sec?: number;

  protection_fee_per_minute?: number;

  varmint_events?: VarmintEvent[];

  /** Server-computed unsettled earnings (not yet in rr_earn_balance). */
  pending_ru?: number;

};



export type FarmsPurchaseKind = "unlock_plot" | "row_slot";

function parsePurchaseErrorBody(
  data: Record<string, unknown>,
  progressVersion: number,
): {
  balance: number;
  progress_version: number;
  last_settled_ms: number;
  lifetime_farms_earned: number;
  plots: GameSave["plots"];
  cost: number;
  rejected: true;
  detail?: string;
} | null {
  if (!Array.isArray(data.plots) || data.progress_version == null) return null;
  const detail = typeof data.detail === "string" ? data.detail : undefined;
  return {
    balance: Math.floor(Number(data.balance) || 0),
    progress_version: Math.floor(Number(data.progress_version) || progressVersion),
    last_settled_ms: Math.floor(Number(data.last_settled_ms) || Date.now()),
    lifetime_farms_earned: Math.floor(Number(data.lifetime_farms_earned) || 0),
    plots: data.plots as GameSave["plots"],
    cost: Math.floor(Number(data.cost) || 0),
    rejected: true as const,
    detail,
  };
}

function parseFarmsStateResponse(data: Record<string, unknown>): FarmsStateResponse | null {
  if (data.ok === false) return null;
  const balance = Math.max(0, Math.floor(Number(data.balance ?? data.ledger_balance) || 0));
  const progress_version = Math.floor(Number(data.progress_version) || 1);
  const last_settled_ms = Math.floor(Number(data.last_settled_ms) || Date.now());
  const lifetime_farms_earned = Math.max(0, Math.floor(Number(data.lifetime_farms_earned) || 0));
  const plots = Array.isArray(data.plots) ? (data.plots as GameSave["plots"]) : undefined;
  const protectionsRaw = data.protections as Record<string, unknown> | undefined;
  const protections: FarmsProtections | undefined = protectionsRaw
    ? {
        gopher: Boolean(protectionsRaw.gopher),
        mice: Boolean(protectionsRaw.mice),
        rabbit: Boolean(protectionsRaw.rabbit),
      }
    : undefined;
  const varmint_events = Array.isArray(data.varmint_events)
    ? (data.varmint_events as VarmintEvent[])
    : undefined;
  return {
    ok: true,
    balance,
    progress_version,
    last_settled_ms,
    lifetime_farms_earned,
    plots,
    daily_remaining: data.daily_remaining != null ? Math.floor(Number(data.daily_remaining)) : undefined,
    protections,
    ru_per_sec: data.ru_per_sec != null ? Number(data.ru_per_sec) : undefined,
    protection_fee_per_minute:
      data.protection_fee_per_minute != null ? Math.floor(Number(data.protection_fee_per_minute)) : undefined,
    varmint_events,
    pending_ru: data.pending_ru != null ? Math.max(0, Math.floor(Number(data.pending_ru))) : undefined,
  };
}

export async function postStoreProtectionToggle(
  kind: ProtectionKind,
  enabled: boolean,
  progressVersion: number,
): Promise<FarmsStateResponse | null> {
  try {
    const res = await apiFetch("/api/v1/farms/store/toggle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind,
        enabled,
        progress_version: progressVersion,
        catalog_hash: CATALOG_HASH,
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Record<string, unknown>;
    return parseFarmsStateResponse(data);
  } catch {
    return null;
  }
}

export async function postVarmintAck(eventIds: string[]): Promise<boolean> {
  try {
    const res = await apiFetch("/api/v1/farms/varmint/ack", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event_ids: eventIds }),
    });
    return res.ok;
  } catch {
    return false;
  }
}



export async function fetchFarmsState(): Promise<FarmsStateResponse | null> {

  try {

    const res = await apiFetch("/api/v1/farms/state", { method: "GET" });

    if (res.status === 404 || res.status === 501) return null;

    if (!res.ok) return null;

    const data = (await res.json()) as Record<string, unknown>;
    return parseFarmsStateResponse(data);

  } catch {

    return null;

  }

}



export type FarmsSettleOk = {
  ok: true;
  granted: number;
  raw_granted?: number;
  balance: number;
  last_settled_ms: number;
  progress_version: number;
  lifetime_farms_earned?: number;
  plots?: GameSave["plots"];
  daily_remaining?: number;
  harvest_cooldown_sec?: number;
  pending_ru?: number;
  detail?: string;
  daily_cap_blocked?: boolean;
  ad_bonus_granted?: number;
};

export type FarmsSettleErr = {
  ok: false;
  status: number;
  detail?: string;
  retry_after_sec?: number;
  balance?: number;
  pending_ru?: number;
  progress_version?: number;
  last_settled_ms?: number;
  lifetime_farms_earned?: number;
  plots?: GameSave["plots"];
};

export type FarmsSettleResult = FarmsSettleOk | FarmsSettleErr | null;

function parseFarmsSettleBody(
  data: Record<string, unknown>,
  progressVersion: number,
  clientNowMs: number,
): Omit<FarmsSettleOk, "ok"> {
  return {
    granted: Math.floor(Number(data.granted) || 0),
    raw_granted: data.raw_granted != null ? Math.floor(Number(data.raw_granted)) : undefined,
    balance: Math.floor(Number(data.balance) || 0),
    last_settled_ms: Math.floor(Number(data.last_settled_ms) || clientNowMs),
    progress_version: Math.floor(Number(data.progress_version) || progressVersion),
    lifetime_farms_earned:
      data.lifetime_farms_earned != null ? Math.floor(Number(data.lifetime_farms_earned)) : undefined,
    plots: Array.isArray(data.plots) ? (data.plots as GameSave["plots"]) : undefined,
    daily_remaining: data.daily_remaining != null ? Math.floor(Number(data.daily_remaining)) : undefined,
    harvest_cooldown_sec:
      data.harvest_cooldown_sec != null ? Math.floor(Number(data.harvest_cooldown_sec) || 60) : undefined,
    pending_ru: data.pending_ru != null ? Math.max(0, Math.floor(Number(data.pending_ru))) : undefined,
    detail: typeof data.detail === "string" ? data.detail : undefined,
    daily_cap_blocked: data.daily_cap_blocked === true,
    ad_bonus_granted:
      data.ad_bonus_granted != null ? Math.max(0, Math.floor(Number(data.ad_bonus_granted))) : undefined,
  };
}

export async function postFarmsSettle(
  clientNowMs: number,
  progressVersion: number,
  plots?: GameSave["plots"],
  opts?: { rewardedDouble?: boolean },
): Promise<FarmsSettleResult> {
  try {
    const res = await apiFetch("/api/v1/farms/settle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_now_ms: clientNowMs,
        progress_version: progressVersion,
        catalog_hash: CATALOG_HASH,
        plots,
        rewarded_double: opts?.rewardedDouble === true,
      }),
    });

    if (res.status === 404 || res.status === 501) return null;

    const data = (await res.json()) as Record<string, unknown>;

    if (res.status === 429) {
      return {
        ok: false,
        status: 429,
        detail: typeof data.detail === "string" ? data.detail : undefined,
        retry_after_sec: Math.max(1, Math.floor(Number(data.retry_after_sec) || 60)),
        balance: data.balance != null ? Math.floor(Number(data.balance)) : undefined,
        pending_ru: data.pending_ru != null ? Math.max(0, Math.floor(Number(data.pending_ru))) : undefined,
        progress_version: data.progress_version != null ? Math.floor(Number(data.progress_version)) : undefined,
        last_settled_ms: data.last_settled_ms != null ? Math.floor(Number(data.last_settled_ms)) : undefined,
      };
    }

    if (res.status === 409) {
      return {
        ok: false,
        status: 409,
        detail: typeof data.detail === "string" ? data.detail : undefined,
        ...parseFarmsSettleBody(data, progressVersion, clientNowMs),
      };
    }

    if (!res.ok) return null;

    return { ok: true, ...parseFarmsSettleBody(data, progressVersion, clientNowMs) };
  } catch {
    return null;
  }
}



export async function postFarmsPurchase(

  kind: FarmsPurchaseKind,

  plotId: number,

  progressVersion: number,

): Promise<{

  balance: number;

  progress_version: number;

  last_settled_ms: number;

  lifetime_farms_earned: number;

  plots: GameSave["plots"];

  cost: number;

  rejected?: true;
  detail?: string;

} | null> {

  try {

    const res = await apiFetch("/api/v1/farms/purchase", {

      method: "POST",

      headers: { "Content-Type": "application/json" },

      body: JSON.stringify({

        kind,

        plot_id: plotId,

        progress_version: progressVersion,

        catalog_hash: CATALOG_HASH,

        client_now_ms: Date.now(),

      }),

    });

    if (res.status === 404 || res.status === 501) return null;

    const data = (await res.json()) as Record<string, unknown>;

    if (!res.ok) {
      const parsed = parsePurchaseErrorBody(data, progressVersion);
      if (parsed) return parsed;
      return null;
    }

    if (!Array.isArray(data.plots)) return null;

    return {

      balance: Math.floor(Number(data.balance) || 0),

      progress_version: Math.floor(Number(data.progress_version) || progressVersion),

      last_settled_ms: Math.floor(Number(data.last_settled_ms) || Date.now()),

      lifetime_farms_earned: Math.floor(Number(data.lifetime_farms_earned) || 0),

      plots: data.plots as GameSave["plots"],

      cost: Math.floor(Number(data.cost) || 0),

    };

  } catch {

    return null;

  }

}


