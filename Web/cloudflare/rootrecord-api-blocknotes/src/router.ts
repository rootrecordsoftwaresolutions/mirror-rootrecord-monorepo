import type { D1Database, ExecutionContext } from "@cloudflare/workers-types";

import { handleAppSessionStartRoute } from "../../rootrecord-api-account/src/app-session-notify";
import { scheduleAuthLoginDiscordSessionNotify } from "../../shared/discord-app-session-notify";
import { bindCorsRequest, cors, json } from "./cors";
import { lifeMemberFromLicenseData, readUserAccountAccessFlags, upsertUserAccountFromLicense } from "./accounts";
import {
  authLogin,
  authMe,
  authSignup,
  extractAuthToken,
  type AuthEnv,
} from "./primary-auth";
import { buildSessionCookieHeader, ssoCookieDomainForApiHost } from "./web-sso";
import { buildSessionInsertMeta, handleAuthLogout, handleAuthLogoutAll } from "./me-account-routes";
import { handleBlocknotesFeedbackRoute } from "./feedback-route-blocknotes";
import { handleBlocknotesWorldAi } from "./blocknotes-world-ai";
import { handleBlocknotesRealm } from "./blocknotes-realm";
import { handleBlocknotesSync } from "./blocknotes-sync";
import { handleBlockNotesServer, featuredServerForMobileConfig } from "./blocknotes-server";
import { handleRootStatMinecraft } from "./rootstat-minecraft";
import { handleRootMcDiscordInteractions } from "./discord-rootmc-bot";

export interface Env extends AuthEnv {
  DB: D1Database;
  SITE_URL: string;
  WORKER_SHARD?: string;
  DISCORD_ROOTMC_PUBLIC_KEY?: string;
  DISCORD_ROOTMC_CLIENT_ID?: string;
  DISCORD_FEEDBACK_CHANNEL_ID?: string;
  DISCORD_ROOTMC_BOT_TOKEN?: string;
  DISCORD_ROOTMC_WEBHOOK_URL?: string;
  DISCORD_BLOCKNOTES_AI_ARCHIVE_CHANNEL_ID?: string;
  DISCORD_APP_SESSION_WEBHOOK_URL?: string;
  DISCORD_APP_SESSION_CHANNEL_ID?: string;
  DISCORD_BOT_TOKEN?: string;
  DISCORD_GUILD_ID?: string;
  DISCORD_DEVELOPER_ROLE_ID?: string;
  GROK_API_BEARER_TOKEN?: string;
  GROK_X_BEARER_TOKEN?: string;
  GROK_API_URL?: string;
  GROK_MODEL?: string;
}

function normalizePathname(pathname: string): string {
  return pathname.replace(/\/+/g, "/").replace(/\/+$/, "") || "/";
}

function apiSubpath(pathname: string): string {
  let p = normalizePathname(pathname);
  if (!p.startsWith("/api")) return p;
  while (p.startsWith("/api/") || p === "/api") {
    if (p === "/api") return "/";
    p = normalizePathname(p.slice(4));
  }
  return p;
}

function licenseDeviceId(creds: { device_id?: string }, request: Request): string | null {
  const fromBody = String(creds.device_id || "").trim();
  if (fromBody) return fromBody.slice(0, 128);
  const guest = (request.headers.get("X-Guest-Id") || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64);
  return guest || null;
}

function webSsoSetCookie(request: Request, token: string | undefined | null): string | undefined {
  const t = String(token || "").trim();
  if (!t) return undefined;
  const dom = ssoCookieDomainForApiHost(new URL(request.url).hostname);
  if (!dom) return undefined;
  return buildSessionCookieHeader(t, dom);
}

async function mergedAccessFromAccountMirror(
  env: Env,
  email: string,
  data: Record<string, unknown>,
): Promise<{ pro: boolean; life: boolean }> {
  const flags = await readUserAccountAccessFlags(env.DB, email).catch(() => null);
  const life = lifeMemberFromLicenseData(data) || Boolean(flags?.life_member);
  const pro = life || Boolean(data.proUnlocked || data.pro_unlocked) || Boolean(flags?.pro_unlocked);
  return { pro, life };
}

async function healthJson(env: Env): Promise<Response> {
  let d1Ok = false;
  try {
    const r = await env.DB.prepare("SELECT 1 AS ok").first<{ ok: number }>();
    d1Ok = r?.ok === 1;
  } catch {
    d1Ok = false;
  }
  return json(
    {
      status: d1Ok ? "ok" : "degraded",
      db: d1Ok ? "ok" : "unavailable",
      service: "rootrecord-api-blocknotes",
      site_url: env.SITE_URL,
    },
    200,
  );
}

export async function handleRequest(
  request: Request,
  env: Env,
  ctx?: ExecutionContext,
): Promise<Response> {
  bindCorsRequest(request);
  try {
    const url = new URL(request.url);
    const pathname = normalizePathname(url.pathname);
    const method = request.method;

    if (method === "OPTIONS") {
      const h = new Headers();
      for (const [k, v] of Object.entries(cors())) {
        h.set(k, v);
      }
      return new Response(null, { status: 204, headers: h });
    }

    if (!pathname.startsWith("/api")) {
      if (method === "GET" && (pathname === "/" || pathname === "/health")) {
        return healthJson(env);
      }

      if (method === "GET" && pathname === "/v1/discord/rootmc/interactions") {
        return json(
          {
            ok: true,
            post_only: true,
            hint: "RootMC slash commands POST here. Set Interactions Endpoint URL on the RootMC Discord application.",
          },
          200,
        );
      }

      if (method === "POST" && pathname === "/v1/discord/rootmc/interactions") {
        return handleRootMcDiscordInteractions(request, env, ctx);
      }

      if (method === "POST" && pathname === "/v1/auth/login") {
        let creds: { email?: string; password?: string; device_id?: string };
        try {
          creds = (await request.json()) as typeof creds;
        } catch {
          return json({ detail: "Invalid JSON" }, 400);
        }
        if (!licenseDeviceId(creds, request)) {
          return json({ detail: "device_id is required (or send X-Guest-Id)." }, 400);
        }
        const meta = buildSessionInsertMeta(request, licenseDeviceId(creds, request));
        const res = await authLogin(env, { email: creds.email || "", password: creds.password || "" }, meta);
        if (!res.ok) return res;
        const data = (await res.json()) as Record<string, unknown>;
        const email = String(data.email || creds.email || "").trim();
        const access = await mergedAccessFromAccountMirror(env, email, data);
        data.pro_unlocked = access.pro;
        data.proUnlocked = access.pro;
        data.life_member = access.life;
        data.lifeMember = access.life;
        try {
          await upsertUserAccountFromLicense(env.DB, {
            email,
            account_id: String(data.account_id || ""),
            pro_unlocked: access.pro,
            life_member: access.life,
            extra: { source: "login", path: "/v1/auth/login" },
          });
        } catch {
          /* optional */
        }
        scheduleAuthLoginDiscordSessionNotify(
          ctx,
          env,
          request,
          creds as Record<string, unknown>,
          data,
          licenseDeviceId(creds, request),
        );
        const tok = (data.access_token || data.token) as string | undefined;
        return json(data, 200, undefined, webSsoSetCookie(request, tok));
      }

      if (method === "POST" && pathname === "/v1/auth/signup") {
        let creds: { email?: string; password?: string; device_id?: string };
        try {
          creds = (await request.json()) as typeof creds;
        } catch {
          return json({ detail: "Invalid JSON" }, 400);
        }
        if (!licenseDeviceId(creds, request)) {
          return json({ detail: "device_id is required (or send X-Guest-Id)." }, 400);
        }
        const meta = buildSessionInsertMeta(request, licenseDeviceId(creds, request));
        const res = await authSignup(env, { email: creds.email || "", password: creds.password || "" }, meta);
        if (!res.ok) return res;
        const data = (await res.json()) as Record<string, unknown>;
        const email = String(data.email || creds.email || "").trim();
        const access = await mergedAccessFromAccountMirror(env, email, data);
        data.pro_unlocked = access.pro;
        data.proUnlocked = access.pro;
        data.life_member = access.life;
        data.lifeMember = access.life;
        try {
          await upsertUserAccountFromLicense(env.DB, {
            email,
            account_id: String(data.account_id || ""),
            pro_unlocked: access.pro,
            life_member: access.life,
            extra: { source: "signup", path: "/v1/auth/signup" },
          });
        } catch {
          /* optional */
        }
        scheduleAuthLoginDiscordSessionNotify(
          ctx,
          env,
          request,
          creds as Record<string, unknown>,
          data,
          licenseDeviceId(creds, request),
        );
        const tok = (data.access_token || data.token) as string | undefined;
        return json(data, 200, undefined, webSsoSetCookie(request, tok));
      }

      if (method === "GET" && pathname === "/v1/me") {
        const tok = extractAuthToken(request);
        if (!tok) return json({ detail: "Missing token" }, 401);
        return authMe(env, tok, ctx);
      }

      if (method === "POST" && pathname === "/v1/auth/logout") {
        return handleAuthLogout(request, env);
      }

      if (method === "POST" && pathname === "/v1/auth/logout-all") {
        return handleAuthLogoutAll(request, env);
      }

      return json({ ok: false, error: "not_found" }, 404);
    }

    const sub = apiSubpath(pathname);

    if (method === "GET" && sub === "/health") {
      return healthJson(env);
    }

    const appSessionRes = await handleAppSessionStartRoute(request, env, sub, method);
    if (appSessionRes) return appSessionRes;

    if (method === "GET" && sub === "/v1/me") {
      const tok = extractAuthToken(request);
      if (!tok) return json({ detail: "Missing token" }, 401);
      return authMe(env, tok, ctx);
    }

    if (method === "POST" && sub === "/auth/login") {
      let creds: { email?: string; password?: string; device_id?: string };
      try {
        creds = (await request.json()) as typeof creds;
      } catch {
        return json({ detail: "Invalid JSON" }, 400);
      }
      const deviceId = licenseDeviceId(creds, request);
      if (!deviceId) {
        return json({ detail: "device_id is required (or send X-Guest-Id)." }, 400);
      }
      const meta = buildSessionInsertMeta(request, deviceId);
      const res = await authLogin(env, { email: creds.email || "", password: creds.password || "" }, meta);
      if (!res.ok) return res;
      const data = (await res.json()) as Record<string, unknown>;
      const token = (data.access_token || data.token) as string | undefined;
      const emailOut = String(data.email || creds.email || "").trim();
      const access = await mergedAccessFromAccountMirror(env, emailOut, data);
      try {
        await upsertUserAccountFromLicense(env.DB, {
          email: emailOut,
          account_id: String(data.account_id || ""),
          pro_unlocked: access.pro,
          life_member: access.life,
          extra: { source: "login" },
        });
      } catch {
        /* optional */
      }
      scheduleAuthLoginDiscordSessionNotify(
        ctx,
        env,
        request,
        creds as Record<string, unknown>,
        data,
        deviceId,
      );
      return json(
        {
          ok: true,
          token,
          access_token: token,
          email: emailOut,
          account_id: String(data.account_id || ""),
          pro_unlocked: access.pro,
          life_member: access.life,
        },
        200,
        undefined,
        webSsoSetCookie(request, token),
      );
    }

    if (method === "POST" && (sub === "/auth/signup" || sub === "/auth/register")) {
      let creds: { email?: string; password?: string; device_id?: string };
      try {
        creds = (await request.json()) as typeof creds;
      } catch {
        return json({ detail: "Invalid JSON" }, 400);
      }
      const deviceId = licenseDeviceId(creds, request);
      if (!deviceId) {
        return json({ detail: "device_id is required (or send X-Guest-Id)." }, 400);
      }
      const meta = buildSessionInsertMeta(request, deviceId);
      const res = await authSignup(env, { email: creds.email || "", password: creds.password || "" }, meta);
      if (!res.ok) return res;
      const data = (await res.json()) as Record<string, unknown>;
      const token = (data.access_token || data.token) as string | undefined;
      const emailOut = String(data.email || creds.email || "").trim();
      const access = await mergedAccessFromAccountMirror(env, emailOut, data);
      try {
        await upsertUserAccountFromLicense(env.DB, {
          email: emailOut,
          account_id: String(data.account_id || ""),
          pro_unlocked: access.pro,
          life_member: access.life,
          extra: { source: "signup" },
        });
      } catch {
        /* optional */
      }
      scheduleAuthLoginDiscordSessionNotify(
        ctx,
        env,
        request,
        creds as Record<string, unknown>,
        data,
        deviceId,
      );
      return json(
        {
          ok: true,
          token,
          access_token: token,
          email: emailOut,
          account_id: String(data.account_id || ""),
          pro_unlocked: access.pro,
          life_member: access.life,
        },
        200,
        undefined,
        webSsoSetCookie(request, token),
      );
    }

    if ((method === "GET" || method === "POST") && sub === "/auth/me") {
      const token = extractAuthToken(request);
      if (!token) return json({ detail: "Missing token" }, 401);
      return authMe(env, token, ctx);
    }

    if (method === "POST" && sub === "/auth/logout") {
      return handleAuthLogout(request, env);
    }

    if (method === "POST" && sub === "/auth/logout-all") {
      return handleAuthLogoutAll(request, env);
    }

    if (method === "GET" && sub === "/mobile/config") {
      const featuredServer = await featuredServerForMobileConfig(env.DB);
      return json(
        {
          app_id: "rootrecord_blocknotes_android",
          reference_version: "1.21",
          support_discord_channel_id: "1511793476226912407",
          featured_server: featuredServer,
        },
        200,
      );
    }

    const feedbackRes = await handleBlocknotesFeedbackRoute(request, env, sub, method);
    if (feedbackRes) return feedbackRes;

    const worldAiRes = await handleBlocknotesWorldAi(request, env, sub, method, ctx);
    if (worldAiRes) return worldAiRes;

    const realmRes = await handleBlocknotesRealm(request, env, sub, method);
    if (realmRes) return realmRes;

    const syncRes = await handleBlocknotesSync(request, env, sub, method);
    if (syncRes) return syncRes;

    const rootStatRes = await handleRootStatMinecraft(request, env, sub, method);
    if (rootStatRes) return rootStatRes;

    const serverRes = await handleBlockNotesServer(request, env, sub, method);
    if (serverRes) return serverRes;

    return json({ detail: "Not Found" }, 404);
  } finally {
    bindCorsRequest(undefined);
  }
}
