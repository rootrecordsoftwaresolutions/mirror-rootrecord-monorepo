/**
 * Register global slash commands for the RootMC Discord bot.
 *
 * Usage (from Web/cloudflare/rootrecord-api-blocknotes/):
 *   node scripts/discord-register-rootmc-commands.mjs
 *
 * credentials.env:
 *   DISCORD_ROOTMC_BOT_TOKEN
 *   DISCORD_ROOTMC_CLIENT_ID  (optional if set in wrangler.toml)
 *
 * Interactions endpoint (RootMC app → General Information):
 *   https://rootrecord-api-blocknotes.rootrecord.workers.dev/v1/discord/rootmc/interactions
 */
import fs from "node:fs";
import path from "node:path";

const API = "https://discord.com/api/v10";

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

function findCredentialsPath() {
  const here = process.cwd();
  for (const p of [
    path.join(here, "credentials.env"),
    path.join(here, "../../../credentials.env"),
    path.join(here, "../../../../credentials.env"),
  ]) {
    if (fs.existsSync(p)) return p;
  }
  return path.join(here, "../../../credentials.env");
}

function readWranglerVar(p, name) {
  if (!fs.existsSync(p)) return "";
  const m = fs.readFileSync(p, "utf8").match(new RegExp(`^${name}\\s*=\\s*"([^"]*)"`, "m"));
  return m ? m[1] : "";
}

const credPath = findCredentialsPath();
const fileEnv = readEnvFile(credPath);
const wranglerPath = path.join(process.cwd(), "wrangler.toml");
const token = String(process.env.DISCORD_ROOTMC_BOT_TOKEN || fileEnv.DISCORD_ROOTMC_BOT_TOKEN || "")
  .replace(/^bot\s+/i, "")
  .trim();
const clientId = String(
  process.env.DISCORD_ROOTMC_CLIENT_ID ||
    fileEnv.DISCORD_ROOTMC_CLIENT_ID ||
    readWranglerVar(wranglerPath, "DISCORD_ROOTMC_CLIENT_ID") ||
    "1511794429986345020",
).trim();

if (token.length < 40 || !clientId) {
  console.error("Need DISCORD_ROOTMC_BOT_TOKEN and DISCORD_ROOTMC_CLIENT_ID.");
  process.exit(1);
}

const commands = [
  { name: "help", description: "RootMC — Realm, Block Notes, and RootRecord SMP", type: 1 },
  { name: "server", description: "RootRecord SMP status, address, and realm links", type: 1 },
];

const url = `${API}/applications/${encodeURIComponent(clientId)}/commands`;
const res = await fetch(url, {
  method: "PUT",
  headers: {
    Authorization: `Bot ${token}`,
    "Content-Type": "application/json; charset=utf-8",
    "User-Agent": "RootRecord/discord-register-rootmc",
  },
  body: JSON.stringify(commands),
});
const text = await res.text();
if (!res.ok) {
  console.error("Register RootMC commands failed", res.status, text.slice(0, 1200));
  process.exit(1);
}

console.log("Registered RootMC commands:", text.slice(0, 400));
console.log("");
console.log("Interactions endpoint:");
console.log("https://rootrecord-api-blocknotes.rootrecord.workers.dev/v1/discord/rootmc/interactions");
console.log("");
console.log(
  `Invite: https://discord.com/api/oauth2/authorize?client_id=${clientId}&permissions=84992&scope=bot%20applications.commands`,
);
