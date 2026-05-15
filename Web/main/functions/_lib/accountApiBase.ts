/** Default account API (no trailing slash). */
export const DEFAULT_ROOTRECORD_API_ACCOUNT_BASE = "https://rootrecord-api-account.rootrecord.workers.dev";

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
