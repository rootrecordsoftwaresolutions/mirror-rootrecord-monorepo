/**
 * Fern Forest Hawaii — Telegram group profile (gardening + solar-aware helpers).
 * Vault-isolated to chat -1003868178598 only. Never invent grow hardware or kWh.
 */
import fs from "node:fs";
import path from "node:path";
import { groupVaultId, isTelegramGroupChannel } from "./telegramGroupVault.mjs";
import { telegramChatIdFromChannel, isTelegramChannelId } from "./telegramApi.mjs";
import { gatherEcoBrief } from "./ecoflow.mjs";
import { storePaths } from "./store.mjs";

export const FERN_FOREST_CHAT_ID = "-1003868178598";
export const FERN_FOREST_PROFILE_ID = "fern-forest-hawaii-v1";

const DEFAULT_PROFILE = {
  id: FERN_FOREST_PROFILE_ID,
  title: "Fern Forest Hawaii",
  chatId: FERN_FOREST_CHAT_ID,
  community: "Fern Forest Hawaii / Fern Forest Operations — gardening + grow crew (Hawaiʻi)",
  voice: {
    warmth: "high",
    tone: "warm plant-care lead-dev — Hawaiʻi grow vibe, still Ava Ivy; self-hosted pace OK",
    traits: [
      "self-determined for THIS group: read what the room is about, stay resourceful, surface topics if the chat goes quiet",
      "no tag required — plain 'Ava' is enough; don't wait on @ava_ivy_bot",
      "curious about soil, beds, water, shade, ferns, tropicals, and what actually grows in Hawaiʻi",
      "practical helpers over lecture — short tips, checklists, next steps; help when seeds get wet / need planting now",
      "solar for growers: day-cycle crumbs (→ sunrise / → sunset / soft time-off after 9 before midnight HST) + dashboard — never invent panels or SOC",
      "Minecraft lore / digs / mining metaphors OK here when the crew goes there — keep it light",
      "Alex active here = prioritize his bar for quality ('everything that's best') without bleeding other rooms",
      "protective of this group's private vault — no Discord/Slack/other-group bleed, ever",
      "Gold (G) only if RootMC economy comes up; no dollar framing for player economy",
    ],
  },
  solar: {
    publicDashboard: "https://ava.rootmc.net/solar",
    use: "grow-relevant day cycle: → sunset, → sunrise, soft time-off (after 9 / before midnight HST), bank SOC crumbs — link dashboard; no fake Fern Forest hardware",
    countdownHints: [
      "→ sunset (time till sundown)",
      "→ sunrise (next dawn)",
      "→ time off (soft bedtime band after 9 before midnight HST)",
      "→ wake when soft-sleep is scheduled",
    ],
  },
  gardening: {
    focus: [
      "Hawaiʻi outdoor beds + ferns / tropicals",
      "shade vs sun + rain / humidity",
      "water cadence + wet-seed rescue",
      "starts & transplants",
      "pest/gentle IPM (slugs/snails in wet HI gardens)",
    ],
    store: "notes/gardening.jsonl + notes/FERN-FOREST-HAWAII.md inside this group vault only",
  },
  digs: {
    queueLines: 3,
    note: "Alex: Fern Forest may keep 3 dig-queue lines; digs stay in this vault only",
  },
  install: {
    needsInGroupGo: true,
    note: "Ask Alex inside this group before full install functions; privacy mode may hide untagged history",
  },
  updatedAt: null,
};

function vaultDir(chatIdOrChannel = FERN_FOREST_CHAT_ID) {
  const id = groupVaultId(chatIdOrChannel);
  const dir = path.join(storePaths().dir, "telegram", "groups", id);
  fs.mkdirSync(path.join(dir, "notes"), { recursive: true });
  return dir;
}

function profilePath(chatIdOrChannel = FERN_FOREST_CHAT_ID) {
  return path.join(vaultDir(chatIdOrChannel), "profile.json");
}

function gardeningNotesPath(chatIdOrChannel = FERN_FOREST_CHAT_ID) {
  return path.join(vaultDir(chatIdOrChannel), "notes", "gardening.jsonl");
}

export function isFernForestGroup(chatIdOrChannel, chatType = null) {
  if (!chatIdOrChannel) return false;
  if (!isTelegramGroupChannel(chatIdOrChannel, chatType) && !isTelegramChannelId(chatIdOrChannel)) {
    // bare numeric / negative chat id still ok
    const bare = String(chatIdOrChannel);
    if (bare === FERN_FOREST_CHAT_ID) return true;
  }
  try {
    const id = isTelegramChannelId(chatIdOrChannel)
      ? String(telegramChatIdFromChannel(chatIdOrChannel))
      : groupVaultId(chatIdOrChannel);
    return id === FERN_FOREST_CHAT_ID;
  } catch {
    return String(chatIdOrChannel) === FERN_FOREST_CHAT_ID;
  }
}

export function loadFernForestProfile(chatIdOrChannel = FERN_FOREST_CHAT_ID) {
  try {
    const p = profilePath(chatIdOrChannel);
    if (!fs.existsSync(p)) return { ...DEFAULT_PROFILE };
    return { ...DEFAULT_PROFILE, ...JSON.parse(fs.readFileSync(p, "utf8")) };
  } catch {
    return { ...DEFAULT_PROFILE };
  }
}

export function ensureFernForestProfile(chatIdOrChannel = FERN_FOREST_CHAT_ID) {
  const p = profilePath(chatIdOrChannel);
  const existing = fs.existsSync(p) ? loadFernForestProfile(chatIdOrChannel) : null;
  const next = {
    ...(existing || DEFAULT_PROFILE),
    ...DEFAULT_PROFILE,
    voice: {
      ...DEFAULT_PROFILE.voice,
      ...(existing?.voice || {}),
      traits: DEFAULT_PROFILE.voice.traits,
      tone: DEFAULT_PROFILE.voice.tone,
      warmth: DEFAULT_PROFILE.voice.warmth,
    },
    solar: { ...DEFAULT_PROFILE.solar, ...(existing?.solar || {}), ...DEFAULT_PROFILE.solar },
    gardening: {
      ...DEFAULT_PROFILE.gardening,
      ...(existing?.gardening || {}),
      focus: DEFAULT_PROFILE.gardening.focus,
    },
    digs: DEFAULT_PROFILE.digs,
    install: DEFAULT_PROFILE.install,
    id: FERN_FOREST_PROFILE_ID,
    chatId: FERN_FOREST_CHAT_ID,
    title: "Fern Forest Hawaii",
    community: DEFAULT_PROFILE.community,
    updatedAt: Date.now(),
  };
  fs.writeFileSync(p, JSON.stringify(next, null, 2), "utf8");
  return next;
}

/** Append a group-private gardening note (never global training). */
export function appendGardeningNote(
  chatIdOrChannel,
  { text, kind = "note", by = null, tags = [] } = {},
) {
  if (!text) return null;
  const row = {
    at: Date.now(),
    kind: String(kind).slice(0, 40),
    by: by ? String(by) : null,
    tags: Array.isArray(tags) ? tags.slice(0, 12).map(String) : [],
    text: String(text).slice(0, 4000),
  };
  fs.appendFileSync(gardeningNotesPath(chatIdOrChannel), `${JSON.stringify(row)}\n`, "utf8");
  return row;
}

export function recentGardeningNotes(chatIdOrChannel = FERN_FOREST_CHAT_ID, { limit = 8 } = {}) {
  const file = gardeningNotesPath(chatIdOrChannel);
  if (!fs.existsSync(file)) return [];
  return fs
    .readFileSync(file, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .slice(-limit)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

/** Grower-safe solar crumb — public dashboard + coarse SOC; no SN dumps. */
export function fernForestSolarCrumb() {
  const dash = DEFAULT_PROFILE.solar.publicDashboard;
  try {
    const eco = gatherEcoBrief();
    const pct = eco?.snapshot?.batteryPct;
    const status = eco?.snapshot?.status;
    const bits = [
      status ? `power ${status}` : null,
      pct != null ? `on-circuit bank ~${pct}% SOC` : null,
    ].filter(Boolean);
    const grow =
      "Grow framing: → sunset / → sunrise / soft time-off (after 9–before midnight HST) on the board — useful for watering windows + grow-light timing.";
    return bits.length
      ? `Solar for growers: ${bits.join(" · ")}. ${grow} Live: ${dash} — never invent Fern Forest panels/lights.`
      : `Solar for growers: ${grow} Live day cycle / SOC → ${dash} (no invented hardware).`;
  } catch {
    return `Solar for growers: → sunrise/sunset + soft time-off band on ${dash} (no invented hardware).`;
  }
}

/**
 * Pipeline cue when Ava chats in Fern Forest Operations.
 * Keeps Ava identity; overlays Hawaiʻi gardening warmth + vault isolation.
 */
export function fernForestContextBrief({
  chatIdOrChannel = FERN_FOREST_CHAT_ID,
  question = "",
} = {}) {
  if (!isFernForestGroup(chatIdOrChannel)) return "";
  const profile = loadFernForestProfile(chatIdOrChannel);
  const traits = (profile.voice?.traits || DEFAULT_PROFILE.voice.traits)
    .map((t) => `- ${t}`)
    .join("\n");
  const notes = recentGardeningNotes(chatIdOrChannel, { limit: 8 });
  const noteBlock = notes.length
    ? "Recent THIS-group gardening notes:\n" +
      notes.map((n) => `• ${n.kind}: ${String(n.text).slice(0, 240)}`).join("\n")
    : "Gardening notes store is empty — grow it with helpers as the crew shares tips.";
  const q = String(question || "").toLowerCase();
  const gardenAsk =
    /\b(garden|plant|soil|seed|grow|compost|bed|shade|water|harvest|pest|fern|hawai|tropic|wet)\b/i.test(
      q,
    );
  const solarAsk = /\b(solar|soc|battery|grow\s*light|daylight|sunrise|sun|sunset|sundown)\b/i.test(
    q,
  );
  const loreAsk = /\b(minecraft|lore|dig|mine|queue)\b/i.test(q);
  const hot = [
    gardenAsk ? "Lean into practical Hawaiʻi grow help; short + useful; label uncertain tips." : null,
    solarAsk
      ? "Offer grow-relevant day-cycle crumbs (sunrise/sunset/time-off) + dashboard; never invent Fern Forest gear."
      : null,
    loreAsk ? "Minecraft lore / dig metaphors OK — keep vault-local; dig queue preference = 3 lines." : null,
    "Self-determine for THIS gardening room; no other-group bleed; plain Ava address is enough.",
  ]
    .filter(Boolean)
    .join(" ");

  return `### Fern Forest Hawaii profile (THIS Telegram group only)
Community: ${profile.community || DEFAULT_PROFILE.community}
Voice: ${profile.voice?.tone || DEFAULT_PROFILE.voice.tone}
You are still **Ava Ivy** (lead-dev) — warmer plant-care / local Hawaiʻi grow vibe here. Not a different bot.
Dig queue preference: ${profile.digs?.queueLines || 3} lines (this vault only).
Install: still needs Alex in-group "install go" before full group install functions.
Traits:
${traits}
${fernForestSolarCrumb()}
${noteBlock}
Vault: private to chat ${FERN_FOREST_CHAT_ID}. Never cite Discord/Slack/other Telegram groups.
${hot}`.trim();
}
