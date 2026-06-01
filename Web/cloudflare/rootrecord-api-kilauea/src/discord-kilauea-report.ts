import type { D1Database } from "@cloudflare/workers-types";
import { getFcmAccessToken, sendFcmNotification } from "./fcm-v1";
import { kilaueaBotToken, postKilaueaDiscordMessage, postKilaueaReportContent } from "./discord-kilauea-bot";

export type KilaueaReportEnv = {
  DB: D1Database;
  GROK_API_BEARER_TOKEN?: string;
  GROK_X_BEARER_TOKEN?: string;
  GROK_API_URL?: string;
  GROK_MODEL?: string;
  DISCORD_KILAUEA_BOT_TOKEN?: string;
  DISCORD_BOT_TOKEN?: string;
  DISCORD_GUILD_ID?: string;
  DISCORD_DEVELOPER_ROLE_ID?: string;
  DISCORD_LIFETIME_MEMBER_ROLE_ID?: string;
  DISCORD_MONTHLY_MEMBER_ROLE_ID?: string;
  DISCORD_KILAUEA_REPORT_CHANNEL_ID?: string;
  DISCORD_KILAUEA_AI_ARCHIVE_CHANNEL_ID?: string;
  DISCORD_KILAUEA_USGS_WEBHOOK_URL?: string;
  FCM_SERVICE_ACCOUNT_JSON?: string;
  FCM_PROJECT_ID?: string;
  FCM_CLIENT_EMAIL?: string;
  FCM_PRIVATE_KEY?: string;
};

const HANS_BASE = "https://volcanoes.usgs.gov/hans-public/api/volcano";
const VNUM_KILAUEA = "332010";
const KILAUEA_SUMMIT_LAT = 19.4205;
const KILAUEA_SUMMIT_LON = -155.287;
const HAWAII_BBOX = {
  minlatitude: 18.8,
  maxlatitude: 22.6,
  minlongitude: -161.0,
  maxlongitude: -154.5,
};
const OFFICIAL_KILAUEA_X_SOURCES = [
  "USGSVolcanoes",
  "USGS_Quakes",
  "NWSHonolulu",
  "NWS_PTWC",
  "Hawaii_EMA",
  "CivilDefenseHI",
];
const KILAUEA_ANDROID_APP_ID = "rootrecord_kilauea_alerts_android";

function memberRoleSet(member: Record<string, unknown> | undefined): Set<string> {
  const roles = Array.isArray(member?.roles) ? (member.roles as unknown[]) : [];
  return new Set(roles.map((r) => String(r)));
}

function interactionResponse(
  type: number,
  data?: { content?: string; flags?: number },
): Response {
  return new Response(JSON.stringify(data ? { type, data } : { type }), {
    status: 200,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

async function hasKilaueaCommandAccess(member: Record<string, unknown> | undefined, env: KilaueaReportEnv): Promise<boolean> {
  if (await hasDeveloperRole(member, env)) return true;
  const roles = memberRoleSet(member);
  const allowed = [
    env.DISCORD_LIFETIME_MEMBER_ROLE_ID,
    env.DISCORD_MONTHLY_MEMBER_ROLE_ID,
  ].map((x) => String(x || "").trim()).filter(Boolean);
  return allowed.some((roleId) => roles.has(roleId));
}

async function markKilaueaReportUsed(
  env: KilaueaReportEnv,
  discordUserId: string,
  interactionId: string,
  channelId: string,
  guildId: string,
  response: Record<string, unknown>,
): Promise<void> {
  const id = crypto.randomUUID();
  const nowIso = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO discord_ai_reports
     (id, command_name, interaction_id, channel_id, guild_id, requested_by_discord_id, prompt_json, response_json, created_at)
     VALUES (?, '/kilauea', ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      interactionId,
      channelId,
      guildId,
      discordUserId,
      jsonForArchive({ requested_by_discord_id: discordUserId }),
      jsonForArchive(response),
      nowIso,
    )
    .run();
}

export async function handleKilaueaCommand(
  body: Record<string, unknown>,
  env: KilaueaReportEnv,
  member: Record<string, unknown> | undefined,
  requesterDiscordId: string,
): Promise<Response> {
  if (!(await hasKilaueaCommandAccess(member, env))) {
    return interactionResponse(4, { content: "You need RootRecord Discord access to use `/kilauea`.", flags: 64 });
  }
  let data: Record<string, unknown>;
  try {
    data = await generateKilaueaManualReport(env, requesterDiscordId, String(body.guild_id || "").trim());
  } catch (e) {
    return interactionResponse(4, {
      content: `Kīlauea report failed: ${e instanceof Error ? e.message : String(e)}`,
      flags: 64,
    });
  }
  await markKilaueaReportUsed(
    env,
    requesterDiscordId,
    String(body.id || ""),
    String(body.channel_id || ""),
    String(body.guild_id || ""),
    data,
  );
  const report = (data.report as Record<string, unknown> | undefined) || {};
  const reportId = String(report.id || "").slice(0, 8);
  const push = (report.push as Record<string, unknown> | undefined) || {};
  const pushTotal = Number(push.total_tokens || 0);
  const pushSuccess = Number(push.success || 0);
  const posted = Boolean(report.discord_posted);
  return interactionResponse(4, {
    content: posted
      ? `Kīlauea AI report requested${reportId ? ` (${reportId})` : ""}. Posted to the Kīlauea channel, archived raw AI data${pushTotal ? `, push ${pushSuccess}/${pushTotal}` : ""}.`
      : `Kīlauea report ${reportId || "saved"} was generated but **could not post to Discord**. Run \`/config set\` to pick an alerts channel and grant the bot **Send Messages** there.`,
    flags: 64,
  });
}
function truncateText(raw: unknown, max: number): string {
  const s = String(raw ?? "").replace(/\s+/g, " ").trim();
  return s.length > max ? `${s.slice(0, Math.max(0, max - 1))}…` : s;
}

function accountAnonId(raw: unknown): string {
  const clean = String(raw || "").replace(/[^a-zA-Z0-9]/g, "");
  return clean ? `acct_${clean.slice(0, 10)}` : "acct_unknown";
}

function emailDomain(raw: unknown): string {
  const email = String(raw || "").trim().toLowerCase();
  const i = email.lastIndexOf("@");
  return i > 0 && i < email.length - 1 ? email.slice(i + 1) : "unknown";
}

function userIdFromEmail(raw: unknown): string {
  const email = String(raw || "").trim().toLowerCase();
  return email.includes("@") ? `user:${email}` : "";
}

function jsonForArchive(value: unknown): string {
  return JSON.stringify(value, (_k, v) => (typeof v === "bigint" ? v.toString() : v), 2);
}

function grokChatBearerToken(env: KilaueaReportEnv): string {
  return String(env.GROK_API_BEARER_TOKEN || "").trim();
}

function grokResponseText(response: Record<string, unknown>): string {
  const message = (response.choices as Array<Record<string, unknown>> | undefined)?.[0]?.message as Record<string, unknown> | undefined;
  const content = message?.content;
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object") {
          const obj = part as Record<string, unknown>;
          return String(obj.text || obj.content || "");
        }
        return "";
      })
      .join("")
      .trim();
  }
  return "";
}

function grokErrorText(response: Record<string, unknown>, status: number): string {
  const error = response.error as Record<string, unknown> | string | undefined;
  if (typeof error === "string" && error.trim()) return `HTTP ${status}: ${error.trim()}`;
  if (error && typeof error === "object") {
    const message = String(error.message || error.detail || error.code || "").trim();
    if (message) return `HTTP ${status}: ${message}`;
  }
  const detail = String(response.detail || response.message || "").trim();
  return detail ? `HTTP ${status}: ${detail}` : `HTTP ${status}: empty Grok response`;
}

async function callGrokAnalysis(
  env: KilaueaReportEnv,
  title: string,
  instruction: string,
  data: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const token = grokChatBearerToken(env);
  const apiUrl = String(env.GROK_API_URL || "https://api.x.ai/v1/chat/completions").trim();
  const model = String(env.GROK_MODEL || "grok-3-latest").trim();
  const body = {
    model,
    messages: [
      {
        role: "system",
        content:
          `${instruction} Use only provided data. Be precise, mention unavailable/failed sources, and keep under 1200 characters. ` +
          "Do not reveal secrets, raw credentials, provider names, model names, API configuration, archive/debug status, or provider errors.",
      },
      { role: "user", content: jsonForArchive(data) },
    ],
    temperature: 0.25,
  };
  if (!token) {
    return { ok: false, title, detail: "Grok bearer token is not configured.", content: `${title}: AI unavailable; data archived.`, request: body };
  }
  try {
    const res = await fetch(apiUrl, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const response = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    const content = grokResponseText(response);
    const detail = content ? "" : grokErrorText(response, res.status);
    return {
      ok: res.ok && Boolean(content),
      title,
      status: res.status,
      detail,
      content: content || `${title}: ${detail}`,
      request: body,
      response,
    };
  } catch (e) {
    return { ok: false, title, detail: e instanceof Error ? e.message : String(e), content: `${title}: AI request failed.`, request: body };
  }
}

function decodeHtmlEntities(raw: unknown): string {
  return String(raw ?? "")
    .replace(/&mdash;/g, "—")
    .replace(/&ndash;/g, "–")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}
async function developerRoleIds(env: KilaueaReportEnv): Promise<Set<string>> {
  const configured = String(env.DISCORD_DEVELOPER_ROLE_ID || "").trim();
  if (configured) return new Set([configured]);

  const bot = kilaueaBotToken(env);
  const guildId = String(env.DISCORD_GUILD_ID || "").trim();
  if (!bot || !guildId) return new Set();

  try {
    const res = await fetch(`https://discord.com/api/v10/guilds/${encodeURIComponent(guildId)}/roles`, {
      headers: { Authorization: `Bot ${bot}`, "User-Agent": "RootRecord/discord-screenshot" },
    });
    if (!res.ok) return new Set();
    const roles = (await res.json()) as Array<Record<string, unknown>>;
    const match = roles.find((r) => String(r.name || "").trim().toLowerCase() === "developer");
    const id = String(match?.id || "").trim();
    return id ? new Set([id]) : new Set();
  } catch {
    return new Set();
  }
}

async function hasDeveloperRole(member: Record<string, unknown> | undefined, env: KilaueaReportEnv): Promise<boolean> {
  const memberRoles = Array.isArray(member?.roles) ? member!.roles.map((r) => String(r)) : [];
  if (!memberRoles.length) return false;
  const allowed = await developerRoleIds(env);
  if (!allowed.size) return false;
  return memberRoles.some((r) => allowed.has(r));
}
function reportTimestamp(raw: unknown): string {
  const ms = Date.parse(String(raw || ""));
  if (!Number.isFinite(ms)) return String(raw || "");
  return `<t:${Math.floor(ms / 1000)}:f>`;
}
async function kilaueaFetchJson(url: string): Promise<Record<string, unknown>> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "RootRecordKilaueaDiscord/1.0 (root@rootrecord.info)" },
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { ok: res.ok, status: res.status, data };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

async function collectOfficialKilaueaXUpdates(env: KilaueaReportEnv): Promise<Record<string, unknown>> {
  const bearer = String(env.GROK_X_BEARER_TOKEN || "").trim();
  const accounts = OFFICIAL_KILAUEA_X_SOURCES;
  if (!bearer) {
    return {
      configured: false,
      source: "X.com official-source recent search",
      accounts,
      posts: [],
      note: "GROK_X_BEARER_TOKEN is not configured; official X updates were not scanned.",
    };
  }

  const query =
    `(${accounts.map((name) => `from:${name}`).join(" OR ")}) ` +
    `(Kilauea OR Kīlauea OR Hawaii OR Hawaiʻi OR "Big Island" OR volcano OR lava OR earthquake OR tsunami OR advisory OR warning OR watch) -is:retweet`;
  const url = new URL("https://api.twitter.com/2/tweets/search/recent");
  url.searchParams.set("query", query);
  url.searchParams.set("max_results", "20");
  url.searchParams.set("tweet.fields", "created_at,public_metrics,lang");
  url.searchParams.set("expansions", "author_id");
  url.searchParams.set("user.fields", "name,username,verified");

  try {
    const res = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${bearer}`,
        "User-Agent": "RootRecordKilaueaDiscord/1.0 (official X scan)",
      },
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    const includes = data.includes as Record<string, unknown> | undefined;
    const rawUsers = Array.isArray(includes?.users) ? includes.users as Array<Record<string, unknown>> : [];
    const users = new Map<string, Record<string, unknown>>();
    for (const user of rawUsers) users.set(String(user.id || ""), user);
    const tweets = Array.isArray(data.data) ? data.data as Array<Record<string, unknown>> : [];
    return {
      configured: true,
      ok: res.ok,
      status: res.status,
      source: "X.com official-source recent search",
      accounts,
      query,
      posts: tweets.map((tweet) => {
        const author = users.get(String(tweet.author_id || "")) || {};
        const username = String(author.username || "");
        const id = String(tweet.id || "");
        return {
          id,
          account: username ? `@${username}` : tweet.author_id || null,
          name: author.name || null,
          created_at: tweet.created_at || null,
          text: truncateText(tweet.text, 500),
          url: username && id ? `https://x.com/${username}/status/${id}` : null,
          metrics: tweet.public_metrics || null,
        };
      }),
      error: res.ok ? null : data,
    };
  } catch (e) {
    return {
      configured: true,
      ok: false,
      source: "X.com official-source recent search",
      accounts,
      query,
      posts: [],
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

async function collectNwsKilaueaWeather(): Promise<Record<string, unknown>> {
  const points = await kilaueaFetchJson(`https://api.weather.gov/points/${KILAUEA_SUMMIT_LAT.toFixed(4)},${KILAUEA_SUMMIT_LON.toFixed(4)}`);
  const props = (points.data as Record<string, unknown> | undefined)?.properties as Record<string, unknown> | undefined;
  const forecastUrl = String(props?.forecast || "");
  const hourlyUrl = String(props?.forecastHourly || "");
  const stationsUrl = String(props?.observationStations || "");
  const [forecast, hourly, stations] = await Promise.all([
    forecastUrl ? kilaueaFetchJson(forecastUrl) : Promise.resolve({ ok: false, reason: "missing forecast URL" } as Record<string, unknown>),
    hourlyUrl ? kilaueaFetchJson(hourlyUrl) : Promise.resolve({ ok: false, reason: "missing hourly forecast URL" } as Record<string, unknown>),
    stationsUrl ? kilaueaFetchJson(stationsUrl) : Promise.resolve({ ok: false, reason: "missing observation stations URL" } as Record<string, unknown>),
  ]);
  const stationFeatures = Array.isArray((stations.data as Record<string, unknown> | undefined)?.features)
    ? ((stations.data as Record<string, unknown>).features as Array<Record<string, unknown>>)
    : [];
  const firstStation = stationFeatures[0];
  const stationId =
    String(firstStation?.id || "").split("/").pop() ||
    String(((firstStation?.properties as Record<string, unknown> | undefined) || {}).stationIdentifier || "");
  const observation = stationId
    ? await kilaueaFetchJson(`https://api.weather.gov/stations/${encodeURIComponent(stationId)}/observations/latest`)
    : { ok: false, reason: "no observation station" };
  const forecastPeriods = Array.isArray(((forecast.data as Record<string, unknown> | undefined)?.properties as Record<string, unknown> | undefined)?.periods)
    ? ((((forecast.data as Record<string, unknown>).properties as Record<string, unknown>).periods as Array<Record<string, unknown>>).slice(0, 4))
    : [];
  const hourlyPeriods = Array.isArray(((hourly.data as Record<string, unknown> | undefined)?.properties as Record<string, unknown> | undefined)?.periods)
    ? ((((hourly.data as Record<string, unknown>).properties as Record<string, unknown>).periods as Array<Record<string, unknown>>).slice(0, 6))
    : [];
  return {
    source: "NWS api.weather.gov",
    point: { lat: KILAUEA_SUMMIT_LAT, lon: KILAUEA_SUMMIT_LON },
    grid: {
      office: props?.gridId || null,
      x: props?.gridX || null,
      y: props?.gridY || null,
      forecast_url: forecastUrl,
      hourly_url: hourlyUrl,
      station: stationId || null,
    },
    observation,
    forecast_periods: forecastPeriods,
    hourly_periods: hourlyPeriods,
  };
}

async function collectKilaueaManualContext(env: KilaueaReportEnv, requesterDiscordId: string): Promise<Record<string, unknown>> {
  const eqUrl = new URL("https://earthquake.usgs.gov/fdsnws/event/1/query");
  eqUrl.searchParams.set("format", "geojson");
  eqUrl.searchParams.set("orderby", "time");
  eqUrl.searchParams.set("limit", "80");
  eqUrl.searchParams.set("minmagnitude", "2.5");
  eqUrl.searchParams.set("starttime", new Date(Date.now() - 14 * 86400 * 1000).toISOString());
  for (const [k, v] of Object.entries(HAWAII_BBOX)) eqUrl.searchParams.set(k, String(v));

  const [volcano, newest, newestNotice, recent, nws, earthquakes, tsunami, weather, officialX] = await Promise.all([
    kilaueaFetchJson(`${HANS_BASE}/getVolcano/${VNUM_KILAUEA}`),
    kilaueaFetchJson(`${HANS_BASE}/getNewestVona/${VNUM_KILAUEA}`),
    kilaueaFetchJson(`${HANS_BASE}/newestForVolcano/${VNUM_KILAUEA}`),
    kilaueaFetchJson(`${HANS_BASE}/getRecentNotices/${VNUM_KILAUEA}`),
    kilaueaFetchJson("https://api.weather.gov/alerts/active?area=HI&status=actual"),
    kilaueaFetchJson(eqUrl.toString()),
    kilaueaFetchJson("https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/significant_week.geojson"),
    collectNwsKilaueaWeather().catch((e) => ({ ok: false, error: e instanceof Error ? e.message : String(e) })),
    collectOfficialKilaueaXUpdates(env),
  ]);

  const nwsFeatures = Array.isArray((nws.data as Record<string, unknown> | undefined)?.features)
    ? (((nws.data as Record<string, unknown>).features as Array<Record<string, unknown>>).slice(0, 20))
    : [];
  const eqFeatures = Array.isArray((earthquakes.data as Record<string, unknown> | undefined)?.features)
    ? (((earthquakes.data as Record<string, unknown>).features as Array<Record<string, unknown>>).slice(0, 30))
    : [];
  const tsunamiFeatures = Array.isArray((tsunami.data as Record<string, unknown> | undefined)?.features)
    ? (((tsunami.data as Record<string, unknown>).features as Array<Record<string, unknown>>).filter((f) => {
        const p = (f.properties as Record<string, unknown> | undefined) || {};
        return Boolean(p.tsunami);
      }).slice(0, 12))
    : [];

  return {
    generated_at: new Date().toISOString(),
    requested_by_discord_id: requesterDiscordId,
    trigger: {
      source_type: "manual",
      source_id: `manual:${requesterDiscordId}:${crypto.randomUUID()}`,
      source_time: new Date().toISOString(),
      event: "Manual /kilauea report",
      headline: "Manual Kīlauea AI analysis",
    },
    volcano: { volcano, newest_vona: newest, newest_notice: newestNotice, recent_notices: recent },
    official_x_updates: officialX,
    weather,
    earthquake_source: {
      ok: Boolean(earthquakes.ok),
      status: earthquakes.status || null,
      url: eqUrl.toString(),
      title: ((earthquakes.data as Record<string, unknown> | undefined)?.metadata as Record<string, unknown> | undefined)?.title || null,
      count: eqFeatures.length,
    },
    active_warning_advisories: nwsFeatures.map((f) => {
      const p = (f.properties as Record<string, unknown> | undefined) || {};
      return {
        id: f.id || p.id,
        event: p.event,
        severity: p.severity,
        headline: p.headline || p.event,
        effective: p.effective,
        expires: p.expires,
        areaDesc: p.areaDesc,
        url: p.uri || f.id,
      };
    }),
    hawaii_earthquakes: eqFeatures.map((f) => {
      const p = (f.properties as Record<string, unknown> | undefined) || {};
      const coords = ((f.geometry as Record<string, unknown> | undefined)?.coordinates as unknown[]) || [];
      return {
        id: f.id,
        title: p.title,
        place: p.place,
        magnitude: p.mag,
        time: p.time,
        url: p.url,
        tsunami: p.tsunami,
        lon: coords[0],
        lat: coords[1],
        depth_km: coords[2],
      };
    }),
    pacific_tsunami_bulletins: {
      available: true,
      bulletins: tsunamiFeatures.map((f) => {
        const p = (f.properties as Record<string, unknown> | undefined) || {};
        return {
          id: f.id,
          title: p.title,
          place: p.place,
          magnitude: p.mag,
          time: p.time,
          url: p.url,
          alert: p.alert,
        };
      }),
    },
  };
}

function splitKilaueaReportText(content: string): { freeText: string; proText: string } {
  const clean =
    content
      .replace(/\bGrok\b/gi, "AI")
      .replace(/\bxAI\b/g, "AI")
      .trim() || "Kīlauea AI report generated, but no summary text was returned.";
  const midpoint = Math.max(1, Math.floor(clean.length / 2));
  const splitAt = clean.indexOf("\n", midpoint);
  const idx = splitAt > midpoint && splitAt < clean.length - 40 ? splitAt : midpoint;
  return {
    freeText: clean.slice(0, idx).trim(),
    proText: clean.slice(idx).trim() || "Full follow-up details unavailable.",
  };
}

function recordArray(raw: unknown): Array<Record<string, unknown>> {
  return Array.isArray(raw) ? raw.filter((x): x is Record<string, unknown> => Boolean(x && typeof x === "object" && !Array.isArray(x))) : [];
}

function msDate(raw: unknown): string {
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return "";
  return new Date(value).toISOString().replace("T", " ").replace(/\.\d{3}Z$/, " UTC");
}

function cleanDisplayText(raw: unknown, max = 420): string {
  const s = decodeHtmlEntities(raw)
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/p>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return s.length > max ? `${s.slice(0, Math.max(0, max - 1)).trim()}…` : s;
}

function compactLines(lines: string[], maxChars = 1800): string {
  const out: string[] = [];
  let total = 0;
  for (const line of lines) {
    const clean = line.trim();
    if (!clean) continue;
    if (total + clean.length + 1 > maxChars) break;
    out.push(clean);
    total += clean.length + 1;
  }
  return out.join("\n");
}

function findStringByKey(raw: unknown, keys: string[], depth = 0): string {
  if (!raw || depth > 6) return "";
  if (Array.isArray(raw)) {
    for (const item of raw) {
      const found = findStringByKey(item, keys, depth + 1);
      if (found) return found;
    }
    return "";
  }
  if (typeof raw !== "object") return "";
  const obj = raw as Record<string, unknown>;
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "string" && value.trim()) return cleanDisplayText(value, 420);
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  for (const value of Object.values(obj)) {
    const found = findStringByKey(value, keys, depth + 1);
    if (found) return found;
  }
  return "";
}

function collectMatchingSentences(raw: unknown, pattern: RegExp, max = 3, out: string[] = [], depth = 0): string[] {
  if (!raw || out.length >= max || depth > 6) return out;
  if (typeof raw === "string") {
    const clean = cleanDisplayText(raw, 2000);
    for (const sentence of clean.split(/(?<=[.!?])\s+/)) {
      const item = sentence.trim();
      if (item && pattern.test(item) && !out.includes(item)) out.push(truncateText(item, 220));
      if (out.length >= max) break;
    }
    return out;
  }
  if (Array.isArray(raw)) {
    for (const item of raw) collectMatchingSentences(item, pattern, max, out, depth + 1);
    return out;
  }
  if (typeof raw === "object") {
    for (const value of Object.values(raw as Record<string, unknown>)) collectMatchingSentences(value, pattern, max, out, depth + 1);
  }
  return out;
}

function cToF(raw: unknown): string {
  const c = Number(raw);
  if (!Number.isFinite(c)) return "";
  return `${Math.round((c * 9) / 5 + 32)}Â°F`;
}

function msToMph(raw: unknown): string {
  const ms = Number(raw);
  if (!Number.isFinite(ms)) return "";
  return `${Math.round(ms * 2.23694)} mph`;
}

function formatNwsWeather(weather: Record<string, unknown>): { current: string; forecast: string; correlation: string } {
  const obsProps = (((weather.observation as Record<string, unknown> | undefined)?.data as Record<string, unknown> | undefined)?.properties as Record<string, unknown> | undefined) || {};
  const temp = cToF((obsProps.temperature as Record<string, unknown> | undefined)?.value);
  const wind = msToMph((obsProps.windSpeed as Record<string, unknown> | undefined)?.value);
  const windDir = obsProps.windDirection && typeof obsProps.windDirection === "object" ? String((obsProps.windDirection as Record<string, unknown>).value || "") : "";
  const desc = String(obsProps.textDescription || "").trim();
  const timestamp = String(obsProps.timestamp || "").replace("T", " ").replace(/\.\d{3}Z$/, " UTC");
  const currentParts = [desc, temp, wind ? `wind ${wind}${windDir ? ` @ ${windDir}Â°` : ""}` : "", timestamp ? `obs ${timestamp}` : ""].filter(Boolean);
  const forecastPeriods = recordArray(weather.forecast_periods);
  const hourlyPeriods = recordArray(weather.hourly_periods);
  const period = forecastPeriods[0] || hourlyPeriods[0] || {};
  const forecast = [
    String(period.name || "Next period"),
    period.temperature != null ? `${period.temperature}Â°${String(period.temperatureUnit || "")}` : "",
    String(period.shortForecast || ""),
    period.windSpeed ? `wind ${String(period.windSpeed)} ${String(period.windDirection || "")}`.trim() : "",
  ].filter(Boolean).join(": ");
  const windText = wind ? "Wind/visibility matter for vog, ash, aviation, and field observations; " : "";
  const rainText = /rain|showers|fog|cloud|mist/i.test(`${desc} ${forecast}`)
    ? "cloud/rain/fog can limit webcam/visual confirmation and affect road/visitor conditions."
    : "weather is not currently adding an obvious alert-level signal in the fetched NWS data.";
  return {
    current: currentParts.length ? currentParts.join("; ") : "latest summit-area observation unavailable",
    forecast: forecast || "forecast period unavailable",
    correlation: `${windText}${rainText}`,
  };
}

function buildOfficialKilaueaReport(context: Record<string, unknown>, ai: Record<string, unknown>): string {
  const generated = String(context.generated_at || new Date().toISOString());
  const warnings = recordArray(context.active_warning_advisories);
  const earthquakes = recordArray(context.hawaii_earthquakes);
  const earthquakeSource = (context.earthquake_source as Record<string, unknown> | undefined) || {};
  const earthquakeFeedOk = earthquakeSource.ok !== false;
  const tsunami = (context.pacific_tsunami_bulletins as Record<string, unknown> | undefined) || {};
  const bulletins = recordArray(tsunami.bulletins);
  const volcano = (context.volcano as Record<string, unknown> | undefined) || {};
  const newestNotice = (volcano.newest_notice as Record<string, unknown> | undefined) || {};
  const latestVona = (volcano.newest_vona as Record<string, unknown> | undefined) || {};
  const recentNotices = (volcano.recent_notices as Record<string, unknown> | undefined) || {};
  const weather = (context.weather as Record<string, unknown> | undefined) || {};
  const weatherText = formatNwsWeather(weather);
  const officialX = (context.official_x_updates as Record<string, unknown> | undefined) || {};
  const xPosts = recordArray(officialX.posts).slice(0, 4);
  const prior = (context.previous_report as Record<string, unknown> | undefined) || null;
  const officialSources = [
    "USGS/HVO Kīlauea volcano notices",
    "NWS Hawaiʻi active alerts",
    "NWS summit-area weather",
    "USGS Hawaiʻi earthquake feed",
    "USGS significant earthquake tsunami flags",
    "official X.com posts from agency accounts",
  ].join(", ");

  const notableQuakes = earthquakes
    .map((q): Record<string, unknown> & { mag: number } => ({ ...q, mag: Number(q.magnitude) }))
    .filter((q) => Number.isFinite(q.mag))
    .sort((a, b) => b.mag - a.mag)
    .slice(0, 4);
  const topQuake = notableQuakes[0];
  const warningLines = warnings.slice(0, 4).map((w) => {
    const event = String(w.event || "NWS alert");
    const severity = String(w.severity || "unknown severity");
    const area = String(w.areaDesc || "Hawaiʻi");
    return `- ${event} (${severity}) for ${area}`;
  });
  const quakeLines = notableQuakes.map((q) => {
    const place = String(q.place || q.title || "Hawaiʻi region");
    const when = msDate(q.time);
    return `- M${Number(q.mag).toFixed(1)} ${place}${when ? ` at ${when}` : ""}`;
  });
  const tsunamiLines = bulletins.slice(0, 3).map((b) => {
    const mag = Number(b.magnitude);
    const magText = Number.isFinite(mag) ? `M${mag.toFixed(1)} ` : "";
    return `- ${magText}${String(b.place || b.title || "Pacific event")}`;
  });
  const xLines = xPosts.map((post) => {
    const account = String(post.account || "Official X");
    const text = cleanDisplayText(post.text, 180);
    const when = String(post.created_at || "").replace("T", " ").replace(/\.\d{3}Z$/, " UTC");
    return `- ${account}${when ? ` (${when})` : ""}: ${text}`;
  });
  const vonaOk = Boolean(latestVona.ok);
  const noticesOk = Boolean(recentNotices.ok);
  const status = findStringByKey(volcano, ["alertLevel", "noticeHighestAlertLevel", "volcanoAlertLevel", "currentAlertLevel", "aviationColorCode", "noticeHighestColorCode"]);
  const headline = findStringByKey(newestNotice, ["noticeTitle", "title", "headline", "noticeSubject", "subject"]) ||
    findStringByKey(latestVona, ["noticeTitle", "title", "headline", "noticeSubject", "subject"]);
  const activity = findStringByKey(newestNotice, ["noticeSynopsis", "synopsis", "summary", "description", "activitySummary", "body", "text"]) ||
    findStringByKey(latestVona, ["noticeSynopsis", "synopsis", "summary", "description", "activitySummary", "body", "text"]);
  const episodeDetails = collectMatchingSentences(
    [activity, newestNotice],
    /\b(episode|episodic|pause|paused|resume|resumed|fountain|lava|summit|eruption|vent|inflation|deflation)\b/i,
    3,
  );
  const concern =
    !earthquakeFeedOk
      ? "Verification issue: the USGS earthquake feed did not return a usable result, so earthquake status should be treated as incomplete."
      :
    warnings.length > 0 || (topQuake && Number(topQuake.mag) >= 4) || bulletins.length > 0
      ? "Elevated monitoring: one or more official hazard feeds returned active items worth reviewing."
      : "Routine monitoring: no active NWS warning/advisory, M4.0+ Big Island earthquake, or tsunami-flagged significant event was found in the pulled data.";
  const correlation = [
    !earthquakeFeedOk ? "earthquake correlation is incomplete because the USGS query failed" : topQuake && Number(topQuake.mag) >= 3.5 ? "earthquake activity is high enough to compare against HVO activity notes" : "earthquake feed does not show a major Big Island seismic trigger in this pull",
    warnings.length ? "NWS hazards may compound access/visibility/response conditions" : "NWS hazards are not currently compounding the volcano picture",
    bulletins.length ? "tsunami-flagged significant earthquake data should be treated as separate Pacific-basin context" : "no tsunami-flagged significant event is adding coastal hazard context",
    weatherText.correlation,
  ].join("; ");

  return compactLines([
    `**Kīlauea AI-Assisted Hazards Summary**`,
    `_Generated ${reportTimestamp(generated)} from official-source data. Not an official USGS, HVO, or NWS release._`,
    `**Overall read:** ${concern}`,
    `**Volcano status:** USGS/HVO context ${vonaOk || noticesOk ? "was reachable" : "did not return a usable notice payload"}${status ? `; status/color field: ${status}` : ""}${headline ? `; latest notice: ${headline}` : ""}.`,
    activity ? `**HVO activity note:** ${activity}` : "",
    episodeDetails.length ? `**Episodes / pending changes:** ${episodeDetails.map((x) => `• ${x}`).join(" ")}` : "**Episodes / pending changes:** No explicit episode/pause/resume language was extracted from the latest HVO payload.",
    `**Weather near summit:** ${weatherText.current}. Forecast: ${weatherText.forecast}.`,
    `**NWS Hawaiʻi:** ${warnings.length ? `${warnings.length} active alert item(s) returned.` : "No active Hawaiʻi warning/advisory item was returned by the NWS active-alert feed."}`,
    ...warningLines,
    `**Earthquakes:** ${!earthquakeFeedOk ? `USGS feed did not return usable data (HTTP ${String(earthquakeSource.status || "unknown")}); do not interpret this as no earthquakes.` : earthquakes.length ? `${earthquakes.length} Hawaiʻi-region event(s) M2.5+ returned for the last 14 days.` : "No Hawaiʻi-region M2.5+ events were returned for the last 14 days."}`,
    ...quakeLines,
    `**Tsunami context:** ${bulletins.length ? `${bulletins.length} tsunami-flagged significant earthquake item(s) returned.` : "No tsunami-flagged significant earthquake item was returned by the USGS significant-week feed."}`,
    ...tsunamiLines,
    `**Official X updates:** ${xPosts.length ? `${xPosts.length} recent official post(s) matched the Kīlauea/Big Island query.` : officialX.configured === false ? "X scan not configured; no social update context was included." : "No recent official posts matched the Kīlauea/Big Island query."}`,
    ...xLines,
    `**Correlation:** ${correlation}.`,
    prior ? `**Compared with last report:** Previous app report ${String(prior.id || "").slice(0, 8)} was generated ${String(prior.created_at || "at an unknown time")}. This manual report refreshes the same official-source categories for the current state.` : "",
    `**Official sources used:** ${officialSources}.`,
  ], 1900);
}

async function insertKilaueaManualAnalysis(
  env: KilaueaReportEnv,
  context: Record<string, unknown>,
  ai: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const id = crypto.randomUUID();
  const nowIso = new Date().toISOString();
  const trigger = (context.trigger as Record<string, unknown> | undefined) || {};
  const prior = await env.DB.prepare(`SELECT id FROM kilauea_ai_analyses ORDER BY created_at DESC LIMIT 1`).first<{ id: string }>().catch(() => null);
  const { freeText, proText } = splitKilaueaReportText(String(ai.content || ""));
  await env.DB.prepare(
    `INSERT INTO kilauea_ai_analyses
     (id, source_type, source_id, source_time, severity, event, magnitude, headline, url, free_text, pro_text, model, prompt_json, response_json, prior_report_id, discord_posted_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)`,
  )
    .bind(
      id,
      String(trigger.source_type || "manual"),
      String(trigger.source_id || `manual:${id}`),
      String(trigger.source_time || nowIso),
      null,
      String(trigger.event || "Manual /kilauea report"),
      null,
      String(trigger.headline || "Manual Kīlauea AI analysis"),
      null,
      freeText,
      proText,
      String(env.GROK_MODEL || "grok-3-latest"),
      jsonForArchive(context),
      jsonForArchive(ai),
      prior?.id || null,
      nowIso,
    )
    .run();
  return { id, created_at: nowIso, headline: trigger.headline || "Manual Kīlauea AI analysis", free_text: freeText, pro_text: proText };
}

// postKilaueaBotMessage removed — use postKilaueaDiscordMessage

function resolveFcmCredentials(env: KilaueaReportEnv): { projectId: string; clientEmail: string; privateKey: string } | null {
  const raw = String(env.FCM_SERVICE_ACCOUNT_JSON || "").trim();
  if (raw) {
    try {
      const j = JSON.parse(raw) as { project_id?: string; client_email?: string; private_key?: string };
      const projectId = String(j.project_id || "").trim();
      const clientEmail = String(j.client_email || "").trim();
      const privateKey = String(j.private_key || "").trim();
      if (projectId && clientEmail && privateKey) return { projectId, clientEmail, privateKey };
    } catch {
      return null;
    }
    return null;
  }
  const projectId = String(env.FCM_PROJECT_ID || "").trim();
  const clientEmail = String(env.FCM_CLIENT_EMAIL || "").trim();
  const privateKey = String(env.FCM_PRIVATE_KEY || "").trim();
  if (projectId && clientEmail && privateKey) return { projectId, clientEmail, privateKey };
  return null;
}

function kilaueaPushStatusText(context: Record<string, unknown>): string {
  const volcano = (context.volcano as Record<string, unknown> | undefined) || {};
  const newestNotice = (volcano.newest_notice as Record<string, unknown> | undefined) || {};
  const latestVona = (volcano.newest_vona as Record<string, unknown> | undefined) || {};
  const status = findStringByKey(volcano, ["alertLevel", "noticeHighestAlertLevel", "volcanoAlertLevel", "currentAlertLevel", "aviationColorCode", "noticeHighestColorCode"]);
  const headline = findStringByKey(newestNotice, ["noticeTitle", "title", "headline", "noticeSubject", "subject"]) ||
    findStringByKey(latestVona, ["noticeTitle", "title", "headline", "noticeSubject", "subject"]);
  const combined = [status, headline].filter(Boolean).join(" - ");
  return `Active status: ${cleanDisplayText(combined || "Updated summary available.", 220)}`;
}

async function sendKilaueaSummaryPush(
  env: KilaueaReportEnv,
  context: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const creds = resolveFcmCredentials(env);
  if (!creds) return { ok: false, reason: "fcm_not_configured", success: 0, failure: 0, total_tokens: 0 };

  const rows = await env.DB.prepare(
    "SELECT token FROM rrwm_push_tokens WHERE app_id = ? AND LENGTH(token) >= 20",
  ).bind(KILAUEA_ANDROID_APP_ID).all<{ token: string }>().catch((e) => {
    console.error("kilauea_push_token_query", e instanceof Error ? e.message : String(e));
    return { results: [] as { token: string }[] };
  });
  const seen = new Set<string>();
  const tokens = (rows.results || [])
    .map((row) => String(row.token || "").trim())
    .filter((token) => token.length >= 20 && !seen.has(token) && (seen.add(token), true));
  if (!tokens.length) return { ok: true, success: 0, failure: 0, total_tokens: 0 };

  let accessToken = "";
  try {
    accessToken = await getFcmAccessToken({ clientEmail: creds.clientEmail, privateKey: creds.privateKey });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("kilauea_push_oauth", msg);
    return { ok: false, reason: "fcm_oauth_failed", detail: msg, success: 0, failure: 0, total_tokens: tokens.length };
  }

  let success = 0;
  let failure = 0;
  const errors: string[] = [];
  const title = "Kilauea Current Known Summary was refreshed";
  const body = kilaueaPushStatusText(context);
  for (let i = 0; i < tokens.length; i += 24) {
    const chunk = tokens.slice(i, i + 24);
    const part = await Promise.all(chunk.map((token) => sendFcmNotification(creds.projectId, accessToken, token, title, body)));
    for (let j = 0; j < part.length; j++) {
      const r = part[j]!;
      if (r.ok) success += 1;
      else {
        failure += 1;
        if (errors.length < 8) errors.push(`${chunk[j]!.slice(0, 32)}...: ${r.error}`);
      }
    }
  }
  return { ok: true, success, failure, total_tokens: tokens.length, errors };
}

async function archiveKilaueaRawToDiscord(env: KilaueaReportEnv, id: string, record: Record<string, unknown>): Promise<void> {
  const token = kilaueaBotToken(env);
  const channelId = String(env.DISCORD_KILAUEA_AI_ARCHIVE_CHANNEL_ID || "1507597139465867364").trim();
  if (!token || !channelId) return;
  const form = new FormData();
  form.set("payload_json", JSON.stringify({ content: `Kīlauea AI raw archive ${id}`, username: "Root Record AI" }));
  form.set("files[0]", new Blob([jsonForArchive(record)], { type: "application/json" }), `kilauea-ai-${id}.json`);
  const res = await fetch(`https://discord.com/api/v10/channels/${encodeURIComponent(channelId)}/messages`, {
    method: "POST",
    headers: { Authorization: `Bot ${token}`, "User-Agent": "RootRecord/discord-kilauea-archive" },
    body: form,
  });
  if (!res.ok) console.error("kilauea_discord_archive", res.status, (await res.text().catch(() => "")).slice(0, 300));
}

export async function generateKilaueaManualReport(
  env: KilaueaReportEnv,
  requesterDiscordId: string,
  guildId = "",
): Promise<Record<string, unknown>> {
  const context = await collectKilaueaManualContext(env, requesterDiscordId);
  const previous = await env.DB.prepare(
    `SELECT id, created_at, headline, free_text, pro_text
     FROM kilauea_ai_analyses
     ORDER BY created_at DESC
     LIMIT 1`,
  ).first<Record<string, unknown>>().catch(() => null);
  if (previous) context.previous_report = previous;
  const ai = await callGrokAnalysis(
    env,
    "Kīlauea Hazards AI Report",
    "Generate a careful Kīlauea and Hawaiʻi hazards report for Discord and the Kīlauea app. Use volcano notices, VONA context, active NWS warnings/advisories, Big Island earthquakes, tsunami flags, official X.com posts from named agency accounts, and the previous report when present. Treat official X posts as supplemental public updates; agency pages and feeds remain the source of authority. Include what changed, current concern level, watch items, and what official source to follow. Do not invent measurements.",
    context,
  );
  if (!ai.ok || !String(ai.content || "").trim()) {
    ai.content = buildOfficialKilaueaReport(context, ai);
    ai.fallback_report = true;
  }
  const row = await insertKilaueaManualAnalysis(env, context, ai);
  const reportId = String(row.id || "");
  const content = compactLines([String(row.free_text || ""), String(row.pro_text || "")], 1900) || "Kīlauea AI report generated.";
  const posted = await postKilaueaReportContent(env, content, guildId ? { guildId } : undefined);
  if (posted) {
    await env.DB.prepare(`UPDATE kilauea_ai_analyses SET discord_posted_at = ? WHERE id = ?`)
      .bind(new Date().toISOString(), reportId)
      .run()
      .catch(() => {});
  }
  await archiveKilaueaRawToDiscord(env, reportId, { id: reportId, prompt: context, response: ai });
  const push = await sendKilaueaSummaryPush(env, context).catch((e) => {
    console.error("kilauea_summary_push", e instanceof Error ? e.message : String(e));
    return { ok: false, reason: "push_exception", success: 0, failure: 0, total_tokens: 0 };
  });
  return { ok: true, report: { id: reportId, headline: row.headline, created_at: row.created_at, discord_posted: posted, push } };
}
