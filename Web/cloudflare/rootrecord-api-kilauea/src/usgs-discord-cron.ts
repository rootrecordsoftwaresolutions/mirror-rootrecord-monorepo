import type { D1Database } from "@cloudflare/workers-types";

// USGS earthquakes (Big Island, ~150km of Kilauea summit, M2.0+) → Discord #kilauea-alerts.
// Runs from `rootrecord-api-kilauea` on the every-10-minutes cron (see wrangler.toml + index.ts).
// (Block comment converted to // because the cron literal contains `*` `/` which closes /** */.)
// Dedupes via `discord_posted_quakes` (migration 0033) so cron retries / overlapping windows
// never double-post. Webhook URL comes from `env.DISCORD_KILAUEA_USGS_WEBHOOK_URL` (Worker secret).

// Kilauea summit caldera. Matches the radius math used in weather.ts (HVO_BUNDLE_RADIUS_MILES).
const KILAUEA_SUMMIT_LAT = 19.4205;
const KILAUEA_SUMMIT_LON = -155.287;

// Tight scope per ops decision: Big Island only.
const MAX_RADIUS_KM = 150;
const MIN_MAGNITUDE = 2.0;

// USGS data has ~minute lag; cron is 10min. Pull a 2h lookback window for safety; dedupe handles overlap.
const LOOKBACK_HOURS = 2;

// How many embeds to put in a single Discord webhook POST (Discord caps at 10).
const EMBEDS_PER_REQUEST = 10;

// Prune rows older than this so the dedupe table stays small.
const PRUNE_OLDER_THAN_DAYS = 30;

const USGS_USER_AGENT = "RootRecord Kilauea Alerts (rootrecord.info)";
const DISCORD_USERNAME = "RootRecord USGS";
const DISCORD_AVATAR_URL = "https://rootrecord.info/favicon.png";

type UsgsFeature = {
  id?: string;
  properties?: {
    mag?: number | null;
    place?: string | null;
    time?: number | null;
    url?: string | null;
    title?: string | null;
  };
  geometry?: { coordinates?: [number, number, number] };
};

type UsgsFeatureCollection = { features?: UsgsFeature[] };

type DiscordEmbed = {
  title: string;
  url?: string;
  description?: string;
  color?: number;
  fields?: Array<{ name: string; value: string; inline?: boolean }>;
  timestamp?: string;
  footer?: { text: string };
};

function magnitudeColor(mag: number): number {
  // Discord embed color = 24-bit RGB int. Bands match the Kilauea web dashboard convention.
  if (mag >= 5.0) return 0xc81e1e; // deep red
  if (mag >= 4.0) return 0xdf1739; // red
  if (mag >= 3.0) return 0xf17a13; // orange
  if (mag >= 2.5) return 0xe4b51d; // amber
  return 0x8ac926;                  // green (M2.0–2.5)
}

function kmToMiles(km: number): number {
  return km * 0.621371;
}

/** Rewrite USGS "28 km E of …" → "17 mi E of …" so Discord readers see imperial like the web UI. */
function imperialPlace(raw: string): string {
  if (!raw) return raw;
  return raw.replace(/(\d+(?:\.\d+)?)\s*km(\b)/i, (_m, num) => {
    const mi = kmToMiles(Number(num));
    return `${mi.toFixed(mi >= 10 ? 0 : 1)} mi`;
  });
}

function buildEmbed(feat: UsgsFeature): DiscordEmbed | null {
  const props = feat?.properties || {};
  const id = String(feat?.id || "").trim();
  if (!id) return null;
  const magNum = Number(props.mag);
  if (!Number.isFinite(magNum) || magNum < MIN_MAGNITUDE) return null;
  const place = imperialPlace(String(props.place || "").trim()) || "Unknown location";
  const tMs = Number(props.time);
  const url = typeof props.url === "string" && props.url.startsWith("http") ? props.url : `https://earthquake.usgs.gov/earthquakes/eventpage/${encodeURIComponent(id)}`;
  const depthKm = Array.isArray(feat?.geometry?.coordinates) ? Number(feat.geometry.coordinates[2]) : NaN;
  const depthMi = Number.isFinite(depthKm) ? kmToMiles(depthKm) : NaN;
  const fields: Array<{ name: string; value: string; inline?: boolean }> = [
    { name: "Magnitude", value: magNum.toFixed(1), inline: true },
  ];
  if (Number.isFinite(depthMi)) {
    fields.push({ name: "Depth", value: `${depthMi.toFixed(depthMi >= 10 ? 0 : 1)} mi`, inline: true });
  }
  if (Number.isFinite(tMs) && tMs > 0) {
    // Discord renders <t:1715450000:R> as "5 minutes ago" client-side, localized.
    fields.push({ name: "Time", value: `<t:${Math.floor(tMs / 1000)}:R>`, inline: true });
  }
  return {
    title: `M ${magNum.toFixed(1)} — ${place}`.slice(0, 256),
    url,
    color: magnitudeColor(magNum),
    fields,
    timestamp: Number.isFinite(tMs) && tMs > 0 ? new Date(tMs).toISOString() : undefined,
    footer: { text: "USGS earthquake feed" },
  };
}

async function fetchKilaueaQuakes(): Promise<UsgsFeature[]> {
  const startIso = new Date(Date.now() - LOOKBACK_HOURS * 3600 * 1000).toISOString();
  const u = new URL("https://earthquake.usgs.gov/fdsnws/event/1/query");
  u.searchParams.set("format", "geojson");
  u.searchParams.set("latitude", String(KILAUEA_SUMMIT_LAT));
  u.searchParams.set("longitude", String(KILAUEA_SUMMIT_LON));
  u.searchParams.set("maxradiuskm", String(MAX_RADIUS_KM));
  u.searchParams.set("minmagnitude", String(MIN_MAGNITUDE));
  u.searchParams.set("starttime", startIso);
  u.searchParams.set("orderby", "time-asc");
  const r = await fetch(u.toString(), { headers: { "User-Agent": USGS_USER_AGENT, Accept: "application/geo+json" } });
  if (!r.ok) {
    console.warn(`usgs_kilauea_discord: USGS fetch failed ${r.status}`);
    return [];
  }
  const data = (await r.json()) as UsgsFeatureCollection;
  return Array.isArray(data?.features) ? data.features : [];
}

async function alreadyPosted(db: D1Database, eventIds: string[]): Promise<Set<string>> {
  if (!eventIds.length) return new Set();
  // D1 has a parameter cap; for the volumes here (≤ ~50 events/2h) one batched IN clause is fine.
  const placeholders = eventIds.map(() => "?").join(",");
  const { results } = await db
    .prepare(`SELECT event_id FROM discord_posted_quakes WHERE event_id IN (${placeholders})`)
    .bind(...eventIds)
    .all<{ event_id: string }>();
  return new Set((results || []).map((r) => String(r.event_id)));
}

async function markPosted(
  db: D1Database,
  records: Array<{ id: string; mag: number; place: string }>,
  nowIso: string,
): Promise<void> {
  if (!records.length) return;
  // One statement per row keeps SQL simple; row count per cron run is small.
  for (const rec of records) {
    try {
      await db
        .prepare(
          `INSERT INTO discord_posted_quakes (event_id, posted_at, source, magnitude, place)
           VALUES (?, ?, 'usgs', ?, ?)
           ON CONFLICT(event_id) DO NOTHING`,
        )
        .bind(rec.id, nowIso, rec.mag, rec.place.slice(0, 200))
        .run();
    } catch (e) {
      console.warn(`usgs_kilauea_discord: markPosted failed for ${rec.id}: ${String(e)}`);
    }
  }
}

async function pruneOldPosts(db: D1Database): Promise<void> {
  const cutoff = new Date(Date.now() - PRUNE_OLDER_THAN_DAYS * 86400 * 1000).toISOString();
  try {
    await db.prepare(`DELETE FROM discord_posted_quakes WHERE posted_at < ?`).bind(cutoff).run();
  } catch (e) {
    console.warn(`usgs_kilauea_discord: prune failed ${String(e)}`);
  }
}

async function postEmbedsBatch(webhookUrl: string, embeds: DiscordEmbed[]): Promise<boolean> {
  if (!embeds.length) return true;
  const payload = {
    username: DISCORD_USERNAME,
    avatar_url: DISCORD_AVATAR_URL,
    embeds,
  };
  const r = await fetch(webhookUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!r.ok) {
    const detail = (await r.text().catch(() => "")).slice(0, 200);
    console.warn(`usgs_kilauea_discord: webhook POST ${r.status} ${detail}`);
    return false;
  }
  return true;
}

export async function runUsgsKilaueaDiscordCron(env: {
  DB: D1Database;
  DISCORD_KILAUEA_USGS_WEBHOOK_URL?: string;
}): Promise<void> {
  const webhookUrl = String(env.DISCORD_KILAUEA_USGS_WEBHOOK_URL || "").trim();
  if (!/^https:\/\/discord(?:app)?\.com\/api\/webhooks\//.test(webhookUrl)) {
    // Silently no-op when the webhook isn't configured (e.g. local dev). Avoids spamming logs.
    return;
  }

  const features = await fetchKilaueaQuakes();
  if (!features.length) {
    // Best-effort prune on quiet runs so the table doesn't grow unboundedly.
    await pruneOldPosts(env.DB);
    return;
  }

  const eligible = features.filter((f) => Number.isFinite(Number(f?.properties?.mag)) && Number(f.properties!.mag) >= MIN_MAGNITUDE && String(f?.id || "").trim());
  const ids = eligible.map((f) => String(f.id));
  const posted = await alreadyPosted(env.DB, ids);
  const fresh = eligible.filter((f) => !posted.has(String(f.id)));
  if (!fresh.length) return;

  // Build embeds; drop any that fail the per-embed sanity check.
  const embeds: DiscordEmbed[] = [];
  const records: Array<{ id: string; mag: number; place: string }> = [];
  for (const feat of fresh) {
    const embed = buildEmbed(feat);
    if (!embed) continue;
    embeds.push(embed);
    records.push({
      id: String(feat.id),
      mag: Number(feat.properties?.mag),
      place: String(feat.properties?.place || ""),
    });
  }
  if (!embeds.length) return;

  const nowIso = new Date().toISOString();
  for (let i = 0; i < embeds.length; i += EMBEDS_PER_REQUEST) {
    const batchEmbeds = embeds.slice(i, i + EMBEDS_PER_REQUEST);
    const batchRecords = records.slice(i, i + EMBEDS_PER_REQUEST);
    const ok = await postEmbedsBatch(webhookUrl, batchEmbeds);
    if (ok) await markPosted(env.DB, batchRecords, nowIso);
  }

  // 1-in-N prune to keep the table small without doing it every run.
  if (Math.random() < 0.1) await pruneOldPosts(env.DB);
}
