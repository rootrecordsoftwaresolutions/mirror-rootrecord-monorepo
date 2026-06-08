/** Default account API (no trailing slash). */
export const DEFAULT_ROOTRECORD_API_ACCOUNT_BASE = "https://rootrecord-api-account.rootrecord.workers.dev";

/** Default blocknotes API (Realm social + RootStat Minecraft). */
export const DEFAULT_ROOTRECORD_API_BLOCKNOTES_BASE =
  "https://rootrecord-api-blocknotes.rootrecord.workers.dev";

/** Pages `/api/*` tails that must hit the account Worker (not legacy primary). */
export function isAccountShardApiTail(tail: string): boolean {
  const t = tail.replace(/^\/+/, "");
  if (t === "auth" || t.startsWith("auth/")) return true;
  if (t === "earn" || t.startsWith("earn/")) return true;
  if (t === "v1/farms" || t.startsWith("v1/farms/")) return true;
  if (t === "app-session" || t.startsWith("app-session/")) return true;
  if (t === "partnership" || t.startsWith("partnership/")) return true;
  if (t === "visiting-hawaii" || t.startsWith("visiting-hawaii/")) return true;
  return false;
}

/** Pages `/api/*` tails that must hit the blocknotes Worker (Realm Minecraft / RootStat). */
export function isBlocknotesShardApiTail(tail: string): boolean {
  const t = tail.replace(/^\/+/, "");
  if (t === "realm/minecraft" || t.startsWith("realm/minecraft/")) return true;
  if (t === "blocknotes/server" || t.startsWith("blocknotes/server/")) return true;
  return false;
}

export function blocknotesApiBaseFromEnv(env: {
  ROOTRECORD_API_BLOCKNOTES_BASE?: string;
}): string {
  let b = String(env.ROOTRECORD_API_BLOCKNOTES_BASE || "")
    .trim()
    .replace(/\/+$/, "");
  if (!b) return DEFAULT_ROOTRECORD_API_BLOCKNOTES_BASE;
  if (!/^https?:\/\//i.test(b)) {
    b = `https://${b}`;
  }
  try {
    const u = new URL(b);
    if (u.protocol !== "http:" && u.protocol !== "https:") return DEFAULT_ROOTRECORD_API_BLOCKNOTES_BASE;
    return u.origin;
  } catch {
    return DEFAULT_ROOTRECORD_API_BLOCKNOTES_BASE;
  }
}

/** Pages `/v1/*` tails that must hit the account Worker (Discord link, portal `/v1/me`, etc.). */
export function isAccountShardV1Tail(tail: string): boolean {
  const t = tail.replace(/^\/+/, "");
  if (t === "auth" || t.startsWith("auth/")) return true;
  if (t === "discord" || t.startsWith("discord/")) return true;
  if (t === "app-session" || t.startsWith("app-session/")) return true;
  if (t === "me" || t.startsWith("me/")) return true;
  if (t === "billing" || t.startsWith("billing/")) return true;
  if (t === "economy" || t.startsWith("economy/")) return true;
  return false;
}

/**
 * Pages env `ROOTRECORD_API_ACCOUNT_BASE` may be set in the dashboard without a scheme;
 * `new URL(base + path)` then throws → Cloudflare error 1101 on the Function.
 */
export function accountApiBaseFromEnv(env: { ROOTRECORD_API_ACCOUNT_BASE?: string }): string {
  let a = String(env.ROOTRECORD_API_ACCOUNT_BASE || "")
    .trim()
    .replace(/\/+$/, "");
  if (!a) return DEFAULT_ROOTRECORD_API_ACCOUNT_BASE;
  if (!/^https?:\/\//i.test(a)) {
    a = `https://${a}`;
  }
  try {
    const u = new URL(a);
    if (u.protocol !== "http:" && u.protocol !== "https:") return DEFAULT_ROOTRECORD_API_ACCOUNT_BASE;
    return u.origin;
  } catch {
    return DEFAULT_ROOTRECORD_API_ACCOUNT_BASE;
  }
}
