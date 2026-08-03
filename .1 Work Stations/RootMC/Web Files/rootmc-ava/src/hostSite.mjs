/**
 * Root Server host site — solar + localized NWS weather/hazards.
 * Used in hourly snapshot enrichment and ops power talk.
 * Public copy never names the host city/state — coords stay private for NWS only.
 * Weather: api.weather.gov (NWS) — same storm/hazard rail RootRecord Weather Manager uses.
 */
import fs from "node:fs";
import path from "node:path";
import { storePaths } from "./store.mjs";
import {
  refreshEcoFlow,
  loadEcoSnapshot,
  summarizeMorningSolar,
  isEcoOffCircuit,
  isEcoRemoved,
  isEcoSampleLive,
  ECO_STALE_MS,
} from "./ecoflow.mjs";
import { loadSolarProfile } from "./solarProfile.mjs";
import { isAsleep } from "./sleepMode.mjs";
import { isPoweredOff } from "./powerDown.mjs";

const NWS_UA = "RootMC Ava (rootmc.net; host-site hourly)";
const DEFAULT_SITE = {
  id: "host-site-primary-v1",
  label: "HI Pacific Solar Root Server",
  locale: "HI Pacific",
  lat: 19.5558,
  lon: -155.1069,
  tz_offset_hours: -10,
};

function sitePath() {
  return path.join(storePaths().dir, "host-site.json");
}

function telemetryPath() {
  return path.join(storePaths().dir, "host-site-telemetry.json");
}

export function loadHostSite() {
  try {
    if (!fs.existsSync(sitePath())) return { ...DEFAULT_SITE };
    return { ...DEFAULT_SITE, ...JSON.parse(fs.readFileSync(sitePath(), "utf8")) };
  } catch {
    return { ...DEFAULT_SITE };
  }
}

async function nwsJson(url) {
  const res = await fetch(url, {
    headers: { Accept: "application/geo+json,application/json", "User-Agent": NWS_UA },
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    throw new Error(`nws ${res.status}: ${text.slice(0, 120)}`);
  }
  return data;
}

/**
 * Localized forecast + active alerts for host site (NWS).
 */
export async function fetchHostSiteWeather(site = loadHostSite()) {
  const lat = Number(site.lat);
  const lon = Number(site.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return { ok: false, detail: "bad_coords" };
  }
  const points = await nwsJson(
    `https://api.weather.gov/points/${lat.toFixed(4)},${lon.toFixed(4)}`,
  );
  const forecastUrl = points?.properties?.forecast;
  // Keep city/state off public payloads — NWS needs coords only.
  const city = null;
  const state = null;

  let period = null;
  let outlook = [];
  if (forecastUrl) {
    const forecast = await nwsJson(forecastUrl);
    const periods = Array.isArray(forecast?.properties?.periods)
      ? forecast.properties.periods
      : [];
    period = periods[0] || null;
    // Next 1–2 periods = outlook (Tonight / Tomorrow / etc.)
    outlook = periods.slice(1, 3).map((p) => ({
      name: p.name,
      temp: p.temperature,
      unit: p.temperatureUnit || "F",
      wind: p.windSpeed,
      short: p.shortForecast,
    }));
  }

  let alerts = [];
  try {
    const alertData = await nwsJson(
      `https://api.weather.gov/alerts/active?point=${lat.toFixed(4)},${lon.toFixed(4)}`,
    );
    alerts = (alertData?.features || [])
      .map((f) => ({
        event: f?.properties?.event || "Alert",
        severity: f?.properties?.severity || "",
        headline: String(f?.properties?.headline || "").slice(0, 160),
      }))
      .slice(0, 5);
  } catch {
    alerts = [];
  }

  const astro = points?.properties?.astronomicalData || null;
  const sun =
    astro && typeof astro === "object"
      ? {
          sunrise: astro.sunrise || null,
          sunset: astro.sunset || null,
          transit: astro.transit || null,
          civilTwilightBegin: astro.civilTwilightBegin || null,
          civilTwilightEnd: astro.civilTwilightEnd || null,
        }
      : null;

  return {
    ok: true,
    source: "NWS",
    city,
    state,
    period: period
      ? {
          name: period.name,
          temp: period.temperature,
          unit: period.temperatureUnit || "F",
          wind: period.windSpeed,
          short: period.shortForecast,
        }
      : null,
    outlook,
    sun,
    alerts,
    fetchedAt: new Date().toISOString(),
  };
}

function snLabel(sn) {
  const map = {
    R331ZAB5SG6S2858: "Delta 2",
    R621ZA16XH6K1155: "River 2 Pro",
  };
  return map[sn] || sn.slice(-6);
}

/**
 * Live last-pull line — SOC + in/out only.
 * Do not print solarW here: when panels feed the pack, solar ≈ in and the 3rd watt is redundant.
 * Full solar totals / averages / deltas stay in minute buckets for when asked.
 */
export function formatLivePullBits(v) {
  if (!v) return [];
  const bits = [];
  if (v.soc != null) bits.push(`SOC ${v.soc}%`);
  const inW = v.inW != null ? Math.round(Number(v.inW)) : null;
  const outW = v.outW != null ? Math.round(Number(v.outW)) : null;
  if (inW != null || outW != null) {
    const pull = [
      inW != null ? `${inW}W in` : null,
      outW != null ? `${outW}W out` : null,
    ]
      .filter(Boolean)
      .join(" / ");
    bits.push(`last pull ${pull}`);
  }
  return bits;
}

export function formatSolarLines(snap, morning = null, { detail = false } = {}) {
  const lines = [];
  const per = snap?.perSn || {};
  let solarTotal = 0;
  for (const [sn, v] of Object.entries(per)) {
    if (isEcoRemoved(sn)) continue;
    if (!isEcoSampleLive(v)) {
      lines.push(`- **${snLabel(sn)}**: offline`);
      continue;
    }
    const off = v?.offCircuit || isEcoOffCircuit(sn);
    if (!off && v.solarW != null) solarTotal += Number(v.solarW) || 0;
    const bits = [
      ...formatLivePullBits(v),
      off ? "off-circuit" : null,
    ].filter(Boolean);
    lines.push(`- **${snLabel(sn)}**: ${bits.join(" · ") || "ok"}`);
  }
  if (snap?.batteryPct != null) {
    lines.unshift(`- **Bank:** ${snap.batteryPct}%`);
  }
  // Totals / averages only when detail asked — not on every /solar live board.
  if (detail) {
    if (solarTotal > 0) {
      lines.push(`- **Site solar in now:** ~${Math.round(solarTotal)}W`);
    }
    if (morning?.siteAvgW != null) {
      lines.push(
        `- **Morning solar avg (sampled):** ~${Math.round(morning.siteAvgW)}W` +
          (morning.note && morning.note !== "ok" ? ` (${morning.note})` : ""),
      );
    }
    const solar = loadSolarProfile();
    lines.push(
      `- **Array:** ${solar?.panels?.count ?? 10} panels / ${solar?.panels?.circuits ?? 2} circuits / ${solar?.batteries?.count ?? 3} batteries`,
    );
  }
  return lines;
}

export function formatWeatherLines(weather) {
  if (!weather?.ok) {
    return ["- Weather unavailable right now"];
  }
  const lines = [];
  const p = weather.period;
  if (p) {
    lines.push(
      `- **Now (${p.name}):** ${p.temp}${p.unit} - ${p.short}` +
        (p.wind ? ` - wind ${p.wind}` : ""),
    );
  }
  const outlook = Array.isArray(weather.outlook) ? weather.outlook : [];
  for (const o of outlook.slice(0, 2)) {
    if (!o) continue;
    lines.push(
      `- **Outlook (${o.name}):** ${o.temp}${o.unit} - ${o.short}` +
        (o.wind ? ` - wind ${o.wind}` : ""),
    );
  }
  if (weather.alerts?.length) {
    for (const a of weather.alerts) {
      lines.push(
        `- **HAZARD:** ${a.event}${a.severity ? ` (${a.severity})` : ""}${a.headline ? ` - ${a.headline}` : ""}`,
      );
    }
  } else {
    lines.push("- **Hazards:** none active (NWS)");
  }
  return lines;
}

/**
 * Full host-site block for Discord (ASCII-safe punctuation).
 */
export async function buildHostSiteHourlyBlock({ refreshPower = true } = {}) {
  const site = loadHostSite();
  let snap = loadEcoSnapshot();
  if (refreshPower) {
    try {
      snap = await refreshEcoFlow();
    } catch {
      snap = loadEcoSnapshot();
    }
  }
  const morning = summarizeMorningSolar({
    tzOffsetHours: site.tz_offset_hours ?? -10,
  });
  let weather;
  try {
    weather = await fetchHostSiteWeather(site);
  } catch (err) {
    weather = { ok: false, detail: err.message };
  }

  const publicSite = {
    ...site,
    id: site.id || DEFAULT_SITE.id,
    label: site.label || DEFAULT_SITE.label,
    locale: "HI Pacific",
  };
  const publicWeather =
    weather && typeof weather === "object"
      ? { ...weather, city: null, state: null }
      : weather;

  // Host PC / Root Server off (sleep or power-down) → Gold mine normal 1.0×
  const hostOnline = !isAsleep() && !isPoweredOff();
  const ecoReallyOffline =
    !snap ||
    snap.status === "unconfigured" ||
    snap.status === "needs_sn" ||
    (!Object.keys(snap?.perSn || {}).length && snap.status !== "live");

  const payload = {
    site: publicSite,
    hostOnline,
    solar: {
      batteryPct: snap?.batteryPct ?? null,
      perSn: snap?.perSn || {},
      morningAvgW: morning.siteAvgW ?? null,
      morningNote: morning.note || null,
      // Mining mult consumers (API / plugin) — never invent; flags from live Eco snapshot.
      hostOnline,
      ecoStatus: hostOnline ? snap?.status || null : "host_off",
      ecoUpdatedAt: snap?.updatedAt ?? null,
      // host_off also sets ecoOffline so currently deployed Workers flip to 1.0× immediately
      ecoOffline: !hostOnline || ecoReallyOffline,
      ecoStale:
        snap?.updatedAt != null
          ? Date.now() - Number(snap.updatedAt) > ECO_STALE_MS
          : !snap,
    },
    weather: publicWeather,
    updatedAt: new Date().toISOString(),
  };
  try {
    fs.mkdirSync(storePaths().dir, { recursive: true });
    fs.writeFileSync(telemetryPath(), JSON.stringify(payload, null, 2), "utf8");
  } catch {
    /* ignore */
  }

  const lines = [
    `**Host site** - ${publicSite.label}`,
    "",
    "**Solar / EcoFlow**",
    ...formatSolarLines(snap, morning),
    "",
    "**Local weather (NWS)**",
    ...formatWeatherLines(publicWeather),
  ];
  return {
    content: lines.join("\n"),
    payload,
  };
}

export function loadHostSiteTelemetry() {
  try {
    if (!fs.existsSync(telemetryPath())) return null;
    return JSON.parse(fs.readFileSync(telemetryPath(), "utf8"));
  } catch {
    return null;
  }
}

/**
 * Push telemetry to api.rootmc.net when workstation key present (Worker hourly reads it).
 */
export async function pushHostSiteTelemetry(env = {}, payload = null) {
  const key = String(
    env.ROOTMC_DEV_WORKSTATION_KEY ||
      process.env.ROOTMC_DEV_WORKSTATION_KEY ||
      process.env.ROOTMC_INTERNAL_API_KEY ||
      "",
  ).trim();
  if (!key) return { ok: false, detail: "no_workstation_key" };
  const body = payload || loadHostSiteTelemetry();
  if (!body) return { ok: false, detail: "no_payload" };
  const base = String(
    process.env.AVA_API_BASE || process.env.ROOTMC_API_BASE || "https://api.rootmc.net",
  ).replace(/\/$/, "");
  try {
    const res = await fetch(`${base}/api/rootmc/host-site/telemetry`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "User-Agent": "AvaIvyRootMC/0.5",
        "X-RootMC-Dev-Key": key,
      },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { raw: text.slice(0, 200) };
    }
    if (!res.ok) {
      return { ok: false, status: res.status, detail: data?.detail || text.slice(0, 160) };
    }
    return { ok: true, data };
  } catch (err) {
    return { ok: false, detail: err.message };
  }
}
