/**
 * Kīlauea web → `rootrecord-api-kilauea` only. Same session model as Weather/Business web:
 * HttpOnly `rr_web_session` on `.rootrecord.info` + Bearer in localStorage for API calls.
 */
import { ensureGuestId } from "../guest";

const STORAGE = {
  token: "rrkil.token",
  email: "rrkil.email",
  pro: "rrkil.pro",
  life: "rrkil.life",
} as const;

const WORKERS_DEV = "https://rootrecord-api-kilauea.rootrecord.workers.dev";

function normalizeOrigin(raw: string): string {
  let base = raw.trim().replace(/\/+$/, "");
  if (base.toLowerCase().endsWith("/api")) base = base.slice(0, -4).replace(/\/+$/, "");
  return base;
}

/** API origin without `/api` suffix. Default: shard Worker; set `VITE_ROOTRECORD_API_ORIGIN` when `api-kilauea.rootrecord.info` is routed. */
export function getApiOrigin(): string {
  const env = (import.meta.env.VITE_ROOTRECORD_API_ORIGIN as string | undefined)?.trim();
  if (env) return normalizeOrigin(env);
  return WORKERS_DEV;
}

export function getStoredToken(): string | null {
  try {
    const t = localStorage.getItem(STORAGE.token);
    return t && t.length > 8 ? t : null;
  } catch {
    return null;
  }
}

export function getStoredEmail(): string {
  try {
    return localStorage.getItem(STORAGE.email) || "";
  } catch {
    return "";
  }
}

export function isAuthed(): boolean {
  return Boolean(getStoredToken());
}

export function setSession(token: string, email: string, pro?: boolean, lifeMember?: boolean): void {
  try {
    localStorage.setItem(STORAGE.token, token);
    localStorage.setItem(STORAGE.email, email);
    localStorage.setItem(STORAGE.pro, pro ? "1" : "0");
    localStorage.setItem(STORAGE.life, lifeMember ? "1" : "0");
  } catch {
    /* quota / private mode */
  }
}

export function clearSession(): void {
  try {
    localStorage.removeItem(STORAGE.token);
    localStorage.removeItem(STORAGE.email);
    localStorage.removeItem(STORAGE.pro);
    localStorage.removeItem(STORAGE.life);
  } catch {
    /* ignore */
  }
}

/** `path` must start with `/api/…`. */
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const guest = ensureGuestId();
  const headers = new Headers(init.headers);
  headers.set("X-Guest-Id", guest);
  const t = getStoredToken();
  if (t) headers.set("Authorization", `Bearer ${t}`);
  const url = `${getApiOrigin()}${path.startsWith("/") ? path : `/${path}`}`;
  return fetch(url, { ...init, headers, credentials: "include" });
}

async function apiFetchNoBearer(path: string, init: RequestInit = {}): Promise<Response> {
  const guest = ensureGuestId();
  const headers = new Headers(init.headers);
  headers.set("X-Guest-Id", guest);
  const url = `${getApiOrigin()}${path.startsWith("/") ? path : `/${path}`}`;
  return fetch(url, { ...init, headers, credentials: "include" });
}

async function applyAuthMeResponse(res: Response): Promise<boolean> {
  if (!res.ok) return false;
  const data = (await res.json()) as Record<string, unknown>;
  const tok = String(data.access_token || data.token || "").trim();
  const email = String(data.email || "").trim();
  if (!tok || !email) return false;
  setSession(
    tok,
    email,
    Boolean(data.pro_unlocked || data.proUnlocked),
    Boolean(data.life_member || data.lifeMember),
  );
  return true;
}

/**
 * Hydrate from Bearer (if any) + HttpOnly cookie. If a stale Bearer fails but a valid SSO cookie exists,
 * clears local token and retries once without Authorization.
 */
export async function tryHydrateSessionFromCookie(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  try {
    let res = await apiFetch("/api/auth/me", { method: "POST" });
    if (await applyAuthMeResponse(res)) return true;
    if (res.status === 401 && getStoredToken()) {
      clearSession();
      res = await apiFetchNoBearer("/api/auth/me", { method: "POST" });
      return applyAuthMeResponse(res);
    }
    return false;
  } catch {
    return false;
  }
}

export async function loginRequest(email: string, password: string): Promise<{ ok: true } | { ok: false; detail: string }> {
  const res = await apiFetchNoBearer("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      email: email.trim(),
      password,
      device_id: ensureGuestId(),
    }),
  });
  const text = await res.text();
  let data: Record<string, unknown> = {};
  try {
    data = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    /* ignore */
  }
  if (!res.ok) {
    const detail = typeof data.detail === "string" ? data.detail : text.slice(0, 200) || res.statusText;
    return { ok: false, detail };
  }
  const tok = String(data.access_token || data.token || "").trim();
  const emailOut = String(data.email || email).trim();
  if (!tok || !emailOut) return { ok: false, detail: "Invalid response from server." };
  setSession(
    tok,
    emailOut,
    Boolean(data.pro_unlocked || data.proUnlocked),
    Boolean(data.life_member || data.lifeMember),
  );
  return { ok: true };
}

export async function signupRequest(email: string, password: string, name?: string): Promise<{ ok: true } | { ok: false; detail: string }> {
  const res = await apiFetchNoBearer("/api/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      email: email.trim(),
      password,
      name: name?.trim() || undefined,
      device_id: ensureGuestId(),
    }),
  });
  const text = await res.text();
  let data: Record<string, unknown> = {};
  try {
    data = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    /* ignore */
  }
  if (!res.ok) {
    const detail = typeof data.detail === "string" ? data.detail : text.slice(0, 200) || res.statusText;
    return { ok: false, detail };
  }
  const tok = String(data.access_token || data.token || "").trim();
  const emailOut = String(data.email || email).trim();
  if (!tok || !emailOut) return { ok: false, detail: "Invalid response from server." };
  setSession(
    tok,
    emailOut,
    Boolean(data.pro_unlocked || data.proUnlocked),
    Boolean(data.life_member || data.lifeMember),
  );
  return { ok: true };
}

export async function logoutRequest(): Promise<void> {
  try {
    await apiFetch("/api/auth/logout", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
  } catch {
    /* still clear local */
  }
  clearSession();
}
