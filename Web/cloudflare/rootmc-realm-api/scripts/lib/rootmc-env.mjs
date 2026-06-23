/**
 * Load RootMC Desktop .env + MonoRepo credentials.env for Discord post scripts.
 */
import fs from "node:fs";
import path from "node:path";

export const ROOTMC_URLS = {
  site: "https://rootmc.net",
  api: "https://api.rootmc.net",
  map: "https://map.rootmc.net/",
  play: "play.rootmc.net",
  verify: "https://rootmc.net/verify",
  wiki: "https://rootmc.net/wiki/player/",
  wikiEconomy: "https://rootmc.net/wiki/player/#economy",
  wikiCommands: "https://rootmc.net/wiki/player/#commands",
  shops: "https://rootmc.net/shops/",
  market: "https://rootmc.net/market",
  player: "https://rootmc.net/player",
  discordInvite: "https://discord.gg/rFFQYrNaqS",
};

function readEnvFile(p) {
  const out = {};
  if (!fs.existsSync(p)) return out;
  for (const raw of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i <= 0) continue;
    out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return out;
}

export function loadRootMcEnv() {
  const paths = [
    process.env.ROOTMC_ENV_FILE,
    "C:\\Users\\rrdeveloper\\Desktop\\RootMC - Current\\.env",
    "C:\\Users\\rrdeveloper\\Desktop\\RootMC - Current\\_local\\.env",
    "C:\\Users\\rrdeveloper\\Desktop\\RootMC\\.env",
    path.join(process.cwd(), "../../../../Desktop/RootMC - Current/.env"),
    path.join(process.cwd(), "../../../../Desktop/RootMC/.env"),
    path.join(process.cwd(), "../../../credentials.env"),
    path.join(process.cwd(), "../../../../credentials.env"),
  ].filter(Boolean);

  const merged = {};
  for (const p of paths) {
    try {
      Object.assign(merged, readEnvFile(p));
    } catch {
      /* skip */
    }
  }
  return merged;
}

export function rootMcBotToken(env = loadRootMcEnv()) {
  return String(process.env.DISCORD_ROOTMC_BOT_TOKEN || env.DISCORD_ROOTMC_BOT_TOKEN || "")
    .replace(/^bot\s+/i, "")
    .trim();
}

export function resolveChannelId(env, key, fallback) {
  return String(process.env[key] || env[key] || fallback || "").trim();
}
