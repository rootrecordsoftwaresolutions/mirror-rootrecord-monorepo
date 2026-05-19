import { isAuthed } from "./api";

const KEYS = {
  pro: "rrfarms.pro",
  life: "rrfarms.life_member",
} as const;

export function setEntitlementFromAuthPayload(data: Record<string, unknown>): void {
  const pro = Boolean(data.pro_unlocked || data.proUnlocked);
  const life = Boolean(data.life_member || data.lifeMember);
  try {
    localStorage.setItem(KEYS.pro, pro ? "1" : "0");
    localStorage.setItem(KEYS.life, life ? "1" : "0");
  } catch {
    /* */
  }
  notifyNativeAdsSync();
}

export function clearEntitlement(): void {
  try {
    localStorage.removeItem(KEYS.pro);
    localStorage.removeItem(KEYS.life);
  } catch {
    /* */
  }
  notifyNativeAdsSync();
}

export function hasProAccess(): boolean {
  if (!isAuthed()) return false;
  try {
    return localStorage.getItem(KEYS.pro) === "1" || localStorage.getItem(KEYS.life) === "1";
  } catch {
    return false;
  }
}

/** Pro or lifetime members — no banner or rewarded ads on mobile. */
export function hasAdFreeAccess(): boolean {
  return hasProAccess();
}

function notifyNativeAdsSync(): void {
  try {
    if (typeof window !== "undefined" && window.RootRecordAds?.sync) {
      window.RootRecordAds.sync();
    }
  } catch {
    /* */
  }
}
