/**
 * /solar — power + weather board for HI Pacific Solar Root Server.
 * Discord: text `/solar` in any guild channel Ava can see (+ slash).
 * In-game: Minecraft `/solar` (Root-Ava-Core) hits the same host-site telemetry.
 */
import { ROOTMC_GUILD_ID, DISCORD_API } from "./config.mjs";
import { authHeaders } from "./discordApi.mjs";
import {
  buildHostSiteHourlyBlock,
  formatSolarLines,
  formatWeatherLines,
  loadHostSite,
} from "./hostSite.mjs";
import {
  loadEcoSnapshot,
  refreshEcoFlow,
  summarizeMorningSolar,
  ECO_STALE_MS,
  isEcoSampleLive,
  isEcoRemoved,
} from "./ecoflow.mjs";
import { isAsleep } from "./sleepMode.mjs";
import { isPoweredOff } from "./powerDown.mjs";

export function isSolarCommand(text = "") {
  const t = String(text || "").trim();
  if (!t) return false;
  // Exact utility command — no @ needed
  if (/^\/solar(?:\s|$)/i.test(t)) return true;
  if (/^solar(?:\s+status)?$/i.test(t)) return true;
  return false;
}

function fmtHstClock(ms = Date.now()) {
  const d = new Date(Number(ms) - 10 * 3600_000);
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${hh}:${mm} HST`;
}

/**
 * Compact live board — power + NWS weather. Numbers only from EcoFlow / NWS packs.
 */
export async function buildSolarCommandReply({ refreshPower = true } = {}) {
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

  let block;
  try {
    block = await buildHostSiteHourlyBlock({ refreshPower: false });
  } catch (err) {
    block = { content: null, payload: null, error: err.message };
  }

  // Prefer freshly refreshed snap over block's older load
  const hostOnline = !isAsleep() && !isPoweredOff();
  const ecoAgeMs =
    snap?.updatedAt != null ? Date.now() - Number(snap.updatedAt) : null;
  const ecoStale = ecoAgeMs != null ? ecoAgeMs > ECO_STALE_MS : !snap;
  const liveCount = Object.entries(snap?.perSn || {}).filter(
    ([sn, v]) => !isEcoRemoved(sn) && isEcoSampleLive(v),
  ).length;

  const ecoLabel = !hostOnline
    ? "host off"
    : ecoStale
      ? "EcoFlow **stale** (>3m)"
      : liveCount
        ? "EcoFlow **live**"
        : "EcoFlow **no live packs**";

  const bank =
    snap?.batteryPct != null && liveCount && !ecoStale
      ? ` · bank blend **~${snap.batteryPct}%**`
      : "";

  const ageNote =
    ecoAgeMs != null
      ? ` *(pack ${ecoStale ? "stale" : "fresh"} ~${Math.max(0, Math.round(ecoAgeMs / 60000))}m ago)*`
      : "";

  const lines = [
    `**${site.label || "HI Pacific Solar Root Server"}** — \`/solar\` @ ~${fmtHstClock()}${ageNote}`,
    "",
    `**Power:** host **${hostOnline ? "online" : "off"}** — ${ecoLabel}${bank}`,
    ...formatSolarLines(snap, morning),
    "",
    "**Weather (NWS)**",
    ...formatWeatherLines(block?.payload?.weather || { ok: false }),
    "",
    `_Live rule: device offline or sample >${Math.round(ECO_STALE_MS / 60000)}m → excluded. Dashboard: https://ava.rootmc.net/solar_`,
    "",
    "— Ava",
  ];
  return lines.join("\n");
}

/**
 * Pipeline short-circuit for text `/solar`.
 */
export async function tryHandleSolarCommand({ text = "" } = {}) {
  if (!isSolarCommand(text)) return null;
  const reply = await buildSolarCommandReply({ refreshPower: true });
  return { handled: true, reply };
}

/**
 * Register guild slash `/solar` (works in every channel with Use App Commands).
 */
export async function registerSolarSlashCommand(token, { appId, guildId } = {}) {
  const applicationId = String(appId || "").trim();
  const gid = String(guildId || ROOTMC_GUILD_ID || "").trim();
  if (!token || !applicationId || !gid) {
    return { ok: false, detail: "missing token/appId/guildId" };
  }
  const body = {
    name: "solar",
    description: "HI Pacific Solar Root Server — live power + weather",
    type: 1,
  };
  const base = `${DISCORD_API}/applications/${applicationId}/guilds/${gid}/commands`;
  const headers = {
    ...authHeaders(token),
    "Content-Type": "application/json",
  };

  let existingId = null;
  try {
    const listRes = await fetch(base, { headers: authHeaders(token) });
    const list = await listRes.json().catch(() => []);
    if (Array.isArray(list)) {
      existingId = list.find((c) => String(c?.name || "") === "solar")?.id || null;
    }
  } catch {
    /* create fresh */
  }

  const url = existingId ? `${base}/${existingId}` : base;
  const method = existingId ? "PATCH" : "POST";
  const res = await fetch(url, {
    method,
    headers,
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      detail: json?.message || JSON.stringify(json).slice(0, 200),
    };
  }
  return { ok: true, id: json.id, name: json.name, updated: Boolean(existingId) };
}

/**
 * Handle Discord INTERACTION_CREATE for /solar.
 */
export async function handleSolarInteraction(interaction, { token } = {}) {
  const name = interaction?.data?.name || interaction?.data?.custom_id;
  if (String(name || "").toLowerCase() !== "solar") return false;
  if (Number(interaction?.type) !== 2) return false; // APPLICATION_COMMAND

  const id = interaction.id;
  const itoken = interaction.token;
  if (!id || !itoken || !token) return false;

  // Defer then edit — EcoFlow refresh can take a few seconds
  await fetch(`${DISCORD_API}/interactions/${id}/${itoken}/callback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: 5, // DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE
    }),
  });

  let content;
  try {
    content = await buildSolarCommandReply({ refreshPower: true });
  } catch (err) {
    content = `**/solar** failed: ${err.message || "unknown"}`;
  }

  const appId = interaction.application_id;
  await fetch(
    `${DISCORD_API}/webhooks/${appId}/${itoken}/messages/@original`,
    {
      method: "PATCH",
      headers: {
        ...authHeaders(token),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ content: String(content).slice(0, 2000) }),
    },
  );
  return true;
}
