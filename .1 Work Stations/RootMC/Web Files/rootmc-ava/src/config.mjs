import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Reuse RootMC realm-api env loader without publishing a package. */
export async function loadEnv() {
  const loaderPath = path.resolve(
    __dirname,
    "../../rootmc-realm-api/scripts/lib/rootmc-env.mjs",
  );
  if (!fs.existsSync(loaderPath)) {
    throw new Error(`Missing env loader at ${loaderPath}`);
  }
  const m = await import(pathToFileURL(loaderPath).href);
  const env = m.loadRootMcEnv();
  // Mirror into process.env so modules (EcoFlow, etc.) can read without a pass-through.
  for (const [k, v] of Object.entries(env || {})) {
    if (v == null || v === "") continue;
    if (process.env[k] == null || process.env[k] === "") {
      process.env[k] = String(v);
    }
  }
  return env;
}

function firstEnv(env, keys) {
  for (const key of keys) {
    const v = String(process.env[key] || env[key] || "").trim();
    if (v) return v;
  }
  return "";
}

export function botToken(env) {
  // Prefer Ava_* ; legacy SEXI_* still accepted.
  return firstEnv(env, [
    "AVA_DISCORD_BOT_TOKEN",
    "SEXI_DISCORD_BOT_TOKEN",
    "DISCORD_ROOTMC_BOT_TOKEN",
    "DISCORD_BOT_TOKEN",
  ]).replace(/^bot\s+/i, "");
}

/** Discord application / bot user id for Ava (mentions + self-skip). */
export function avaBotAppId(env = {}) {
  return (
    firstEnv(env, [
      "AVA_DISCORD_APPLICATION_ID",
      "AVA_DISCORD_CLIENT_ID",
      "SEXI_DISCORD_APPLICATION_ID",
      "SEXI_DISCORD_CLIENT_ID",
    ]) || AVA_BOT_APP_ID
  );
}

/** @deprecated use avaBotAppId */
export const sexiBotAppId = avaBotAppId;

/** @deprecated Grok unplugged — do not use in recommend path. */
export function grokToken(_env) {
  return "";
}

/** Cursor user / service-account API key (Dashboard → Integrations). */
export function cursorApiKey(env) {
  return firstEnv(env, ["CURSOR_API_KEY", "CURSOR_SDK_API_KEY"]);
}

export const AVA_MODEL = String(
  process.env.AVA_MODEL || process.env.SEXI_MODEL || "composer-2.5",
).trim();
/** @deprecated */
export const SEXI_MODEL = AVA_MODEL;

export const AVA_GROK_MODEL = String(
  process.env.AVA_GROK_MODEL || process.env.SEXI_GROK_MODEL || "grok-3-mini",
).trim();
/** @deprecated */
export const SEXI_GROK_MODEL = AVA_GROK_MODEL;

/** Default brain is Cursor — Grok unplugged. */
export const AVA_BRAIN_DEFAULT = "cursor";
/** @deprecated */
export const SEXI_BRAIN_DEFAULT = AVA_BRAIN_DEFAULT;

/** Override workspace cwd for the local Cursor agent (defaults to RootMC root). */
export const AVA_WORKSPACE = String(
  process.env.AVA_WORKSPACE || process.env.SEXI_WORKSPACE || "",
).trim();
/** @deprecated */
export const SEXI_WORKSPACE = AVA_WORKSPACE;

/** Ava Ivy handoff folder — lead-dev notes + future agent assets. */
export const AVA_HANDOFF = String(
  process.env.AVA_HANDOFF ||
    process.env.SEXI_HANDOFF ||
    "D:\\.1 Work Stations\\RootMC\\Server Handoffs\\Ava Ivy",
).trim();

/** Discord user IDs Ava must never @mention. */
export const NEVER_MENTION = new Set([
  "788153722198294618", // ZuppaFredda — opted out of pings (lead-dev notes / build plan)
]);

export const DISCORD_API = "https://discord.com/api/v10";
export const ROOTMC_GUILD_ID = "1516108585740800042";
/** Legacy RootMC bot — not used for Ava replies when AVA_DISCORD_* is set. */
export const ROOTMC_BOT_APP_ID = "1511794429986345020";
/** Dedicated Ava Discord application / bot user id. */
export const AVA_BOT_APP_ID = "1532751879875072070";
/** @deprecated */
export const SEXI_BOT_APP_ID = AVA_BOT_APP_ID;

/** Default watch list — proposals, admins, general, governance, voting, constitution, memes. */
export const DEFAULT_WATCH_CHANNELS = [
  "1526664180491358419", // proposals
  "1516121832493678612", // admins
  "1516108586307158088", // #general
  "1522406451413385317", // governance
  "1522413185364398090", // voting
  "1522406019152478210", // constitution
  "1516389376198840421", // #memes-and-media
  "1532903049499246636", // #ava-ivy
  "1532929974154166522", // #development (staff)
];

/** Named channel fallbacks (aligned with rootmc-discord-channels). */
export const AVA_CHANNELS = {
  general: "1516108586307158088",
  admins: "1516121832493678612",
  proposals: "1526664180491358419",
  governance: "1522406451413385317",
  voting: "1522413185364398090",
  constitution: "1522406019152478210",
  development: "1532929974154166522",
  memesMedia: "1516389376198840421",
  updates: "1520665313631408251",
  /** Prefer env; else admins for audit posts */
  audit:
    String(process.env.AVA_AUDIT_CHANNEL_ID || "").trim() || "1516121832493678612",
  /** Changelog / notable ship notes */
  changelog:
    String(process.env.AVA_CHANGELOG_CHANNEL_ID || "").trim() ||
    "1520665313631408251",
  avaHome:
    String(process.env.AVA_HOME_CHANNEL_ID || "").trim() || "1532903049499246636",
};

/** Transport: gateway (preferred) | poller | both */
export const AVA_TRANSPORT = String(
  process.env.AVA_TRANSPORT || "both",
)
  .trim()
  .toLowerCase();

/** Resolve watch channels from env + defaults. */
export function watchChannels(env = {}) {
  const fromEnv = String(
    process.env.AVA_WATCH_CHANNELS ||
      env.AVA_WATCH_CHANNELS ||
      process.env.SEXI_WATCH_CHANNELS ||
      env.SEXI_WATCH_CHANNELS ||
      "",
  )
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const extras = [
    env.DISCORD_ROOTMC_GENERAL_CHAT_CHANNEL_ID,
    process.env.DISCORD_ROOTMC_GENERAL_CHAT_CHANNEL_ID,
  ]
    .map((s) => String(s || "").trim())
    .filter(Boolean);
  return [...new Set([...DEFAULT_WATCH_CHANNELS, ...fromEnv, ...extras])];
}

export const AVA_PORT = Number(process.env.AVA_PORT || process.env.SEXI_PORT || 8787);
/** @deprecated */
export const SEXI_PORT = AVA_PORT;
