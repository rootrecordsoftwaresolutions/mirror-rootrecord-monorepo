import { json } from "./cors";
import {
  validateDevWorkstationAuth,
  type DevWorkstationEnv,
} from "./rootmc-dev-workstation";
import type { D1Database } from "@cloudflare/workers-types";

export type HostSiteEnv = DevWorkstationEnv & {
  ROOTMC_INTERNAL_API_KEY?: string;
};

const NWS_UA = "RootMC Hourly (api.rootmc.net; host-site)";
const DEFAULT_LAT = 19.5558;
const DEFAULT_LON = -155.1069;

function str(v: unknown): string {
  return String(v ?? "").trim();
}

async function ensureTable(db: D1Database): Promise<void> {
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS rootmc_host_site_telemetry (
         host_key TEXT PRIMARY KEY,
         payload_json TEXT NOT NULL,
         updated_at TEXT NOT NULL
       )`,
    )
    .run();
}

export async function readHostSiteTelemetry(
  db: D1Database,
  hostKey = "primary",
): Promise<Record<string, unknown> | null> {
  try {
    await ensureTable(db);
    const row = await db
      .prepare(
        `SELECT payload_json, updated_at FROM rootmc_host_site_telemetry WHERE host_key = ? LIMIT 1`,
      )
      .bind(hostKey)
      .first<{ payload_json: string; updated_at: string }>();
    if (!row?.payload_json) return null;
    const payload = JSON.parse(row.payload_json) as Record<string, unknown>;
    return { ...payload, _updated_at: row.updated_at };
  } catch {
    return null;
  }
}

async function nwsJson(url: string): Promise<any> {
  const res = await fetch(url, {
    headers: { Accept: "application/geo+json,application/json", "User-Agent": NWS_UA },
  });
  if (!res.ok) throw new Error(`nws ${res.status}`);
  return res.json();
}

/** Live NWS forecast + alerts for host-site coords (city/state never published). */
export async function fetchNwsHostWeather(lat = DEFAULT_LAT, lon = DEFAULT_LON) {
  const points = await nwsJson(
    `https://api.weather.gov/points/${lat.toFixed(4)},${lon.toFixed(4)}`,
  );
  const forecastUrl = points?.properties?.forecast as string | undefined;
  const city = null;
  const state = null;
  let period: any = null;
  if (forecastUrl) {
    const forecast = await nwsJson(forecastUrl);
    period = forecast?.properties?.periods?.[0] || null;
  }
  let alerts: Array<{ event: string; severity: string; headline: string }> = [];
  try {
    const alertData = await nwsJson(
      `https://api.weather.gov/alerts/active?point=${lat.toFixed(4)},${lon.toFixed(4)}`,
    );
    alerts = (alertData?.features || [])
      .map((f: any) => ({
        event: String(f?.properties?.event || "Alert"),
        severity: String(f?.properties?.severity || ""),
        headline: String(f?.properties?.headline || "").slice(0, 140),
      }))
      .slice(0, 5);
  } catch {
    alerts = [];
  }
  return {
    ok: true,
    source: "NWS",
    city,
    state,
    period: period
      ? {
          name: String(period.name || ""),
          temp: period.temperature,
          unit: String(period.temperatureUnit || "F"),
          wind: String(period.windSpeed || ""),
          short: String(period.shortForecast || ""),
        }
      : null,
    alerts,
  };
}

export async function buildHostSiteHourlySection(
  env: HostSiteEnv,
): Promise<{ content: string; detail: string }> {
  const telem = await readHostSiteTelemetry(env.DB, "primary");
  const site = (telem?.site as Record<string, unknown>) || {};
  const lat = Number(site.lat ?? DEFAULT_LAT);
  const lon = Number(site.lon ?? DEFAULT_LON);

  let weather: any = telem?.weather;
  try {
    // Prefer fresh NWS each hour (storm/hazard rail)
    weather = await fetchNwsHostWeather(lat, lon);
  } catch (e) {
    if (!weather?.ok) {
      weather = { ok: false, detail: e instanceof Error ? e.message : String(e) };
    }
  }

  const solar = (telem?.solar as Record<string, unknown>) || {};
  const perSn = (solar.perSn as Record<string, any>) || {};
  const solarLines: string[] = [];
  if (solar.batteryPct != null) {
    solarLines.push(`\u2022 **Bank:** ${solar.batteryPct}%`);
  }
  let solarTotal = 0;
  for (const [sn, v] of Object.entries(perSn)) {
    if (!v || typeof v !== "object" || !v.ok) continue;
    if (v.solarW != null) solarTotal += Number(v.solarW) || 0;
    const label = sn.slice(-6);
    const bits = [
      v.soc != null ? `SOC ${v.soc}%` : null,
      v.solarW != null ? `solar ${Math.round(Number(v.solarW))}W` : null,
    ].filter(Boolean);
    solarLines.push(`\u2022 **${label}:** ${bits.join(" / ")}`);
  }
  if (solarTotal > 0) {
    solarLines.push(`\u2022 **Site solar in:** ~${Math.round(solarTotal)}W`);
  }
  if (solar.morningAvgW != null) {
    solarLines.push(`\u2022 **Morning avg:** ~${Math.round(Number(solar.morningAvgW))}W`);
  }
  if (!solarLines.length) {
    solarLines.push(`\u2022 _Solar telemetry pending (Ava sync)_`);
  }

  const wxLines: string[] = [];
  if (weather?.period) {
    const p = weather.period;
    wxLines.push(
      `\u2022 **${p.name}:** ${p.temp}${p.unit} - ${p.short}` +
        (p.wind ? ` - wind ${p.wind}` : ""),
    );
  }
  wxLines.push(`\u2022 **Source:** ${weather?.source || "NWS"} (local point)`);
  if (Array.isArray(weather?.alerts) && weather.alerts.length) {
    for (const a of weather.alerts.slice(0, 4)) {
      wxLines.push(
        `\u2022 **HAZARD:** ${a.event}${a.severity ? ` (${a.severity})` : ""}`,
      );
    }
  } else {
    wxLines.push(`\u2022 **Hazards:** none active (NWS)`);
  }

  const siteLabel =
    str((site as Record<string, unknown>).label) ||
    "Root Server host (Starlink / solar)";
  const content = [
    `**Host site** - ${siteLabel}`,
    `**Solar / EcoFlow**`,
    ...solarLines,
    `**Local weather**`,
    ...wxLines,
  ].join("\n");

  return {
    content,
    detail: `host-site solar=${solarLines.length} wx=${weather?.ok ? "ok" : "fail"} alerts=${weather?.alerts?.length || 0}`,
  };
}

export async function handleHostSiteRoutes(
  req: Request,
  env: HostSiteEnv,
  subpath: string,
): Promise<Response | null> {
  if (!subpath.startsWith("/rootmc/host-site")) return null;
  const rest = subpath.slice("/rootmc/host-site".length) || "/";

  if (req.method === "GET" && (rest === "/telemetry" || rest === "/")) {
    const telem = await readHostSiteTelemetry(env.DB);
    return json({ ok: true, telemetry: telem });
  }

  if (req.method === "POST" && rest === "/telemetry") {
    if (!validateDevWorkstationAuth(req, env)) {
      return json({ ok: false, detail: "unauthorized" }, 401);
    }
    let body: any;
    try {
      body = await req.json();
    } catch {
      return json({ ok: false, detail: "invalid_json" }, 400);
    }
    await ensureTable(env.DB);
    const now = new Date().toISOString();
    await env.DB.prepare(
      `INSERT INTO rootmc_host_site_telemetry (host_key, payload_json, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(host_key) DO UPDATE SET
         payload_json = excluded.payload_json,
         updated_at = excluded.updated_at`,
    )
      .bind("primary", JSON.stringify(body), now)
      .run();
    return json({ ok: true, updated_at: now });
  }

  return null;
}
