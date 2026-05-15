/**
 * Register guild slash commands for Root Record (flat `/bal`, `/send`, …).
 *
 * Reads DISCORD_BOT_TOKEN from credentials.env (or env). DISCORD_GUILD_ID and DISCORD_CLIENT_ID
 * from credentials.env, env, or wrangler.toml [vars] in this Worker folder.
 *
 * Usage:
 *   node scripts/discord-register-root-units-commands.mjs
 */
import fs from "node:fs";
import path from "path";

const API = "https://discord.com/api/v10";

function readEnvFile(p) {
  const out = {};
  if (!fs.existsSync(p)) return out;
  for (const raw of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i <= 0) continue;
    const k = line.slice(0, i).trim();
    const v = line.slice(i + 1).trim();
    if (k) out[k] = v;
  }
  return out;
}

function findCredentialsPath() {
  if (process.env.CREDENTIALS_ENV && fs.existsSync(process.env.CREDENTIALS_ENV)) return process.env.CREDENTIALS_ENV;
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

function readWranglerStringVars(p) {
  const out = {};
  if (!fs.existsSync(p)) return out;
  const text = fs.readFileSync(p, "utf8");
  for (const name of ["DISCORD_GUILD_ID", "DISCORD_CLIENT_ID"]) {
    const re = new RegExp(`^${name}\\s*=\\s*"([^"]*)"`, "m");
    const m = text.match(re);
    if (m) out[name] = m[1];
  }
  return out;
}

const credPath = findCredentialsPath();
const fileEnv = readEnvFile(credPath);
const wranglerPathFs = path.join(process.cwd(), "wrangler.toml");
const wranglerVars = readWranglerStringVars(wranglerPathFs);
const token = String(process.env.DISCORD_BOT_TOKEN || fileEnv.DISCORD_BOT_TOKEN || "").trim();
const guildId = String(
  process.env.DISCORD_GUILD_ID || fileEnv.DISCORD_GUILD_ID || wranglerVars.DISCORD_GUILD_ID || "",
).trim();
const appId = String(
  process.env.DISCORD_CLIENT_ID || fileEnv.DISCORD_CLIENT_ID || wranglerVars.DISCORD_CLIENT_ID || "",
).trim();

if (!token || !guildId || !appId) {
  console.error(
    "Need DISCORD_BOT_TOKEN (credentials.env), and DISCORD_GUILD_ID + DISCORD_CLIENT_ID (credentials.env, env, or wrangler.toml [vars]).",
  );
  process.exit(1);
}

const assetOption = {
  type: 3,
  name: "asset",
  description: "RUNIT = Root Units (in-bot). RRTT = on-chain token (/send user only).",
  required: true,
  choices: [
    { name: "RUNIT (Root Units)", value: "RUNIT" },
    { name: "RRTT", value: "RRTT" },
  ],
};

const sendOptions = [
  {
    type: 1,
    name: "user",
    description: "One linked recipient — RUNIT or RRTT",
    options: [
      assetOption,
      { type: 6, name: "member", description: "Linked user", required: true },
      {
        type: 4,
        name: "amount",
        description: "Whole units: Root Units if RUNIT, whole RRTT if RRTT",
        required: true,
        min_value: 1,
        max_value: 10_000_000,
      },
    ],
  },
  {
    type: 1,
    name: "everyone",
    description: "Split all other linked members (RUNIT)",
    options: [
      assetOption,
      {
        type: 4,
        name: "amount",
        description: "Total Root Units to split (pick RUNIT)",
        required: true,
        min_value: 1,
        max_value: 10_000_000,
      },
    ],
  },
  {
    type: 1,
    name: "active",
    description: "Linked + recent discord_user_activity (RUNIT)",
    options: [
      assetOption,
      {
        type: 4,
        name: "amount",
        description: "Total Root Units (pick RUNIT); window from DISCORD_ACTIVE_LOOKBACK_DAYS",
        required: true,
        min_value: 1,
        max_value: 10_000_000,
      },
    ],
  },
  {
    type: 1,
    name: "role",
    description: "Split linked members who have this role (RUNIT)",
    options: [
      assetOption,
      { type: 8, name: "role", description: "Server role", required: true },
      {
        type: 4,
        name: "amount",
        description: "Total Root Units to split (pick RUNIT)",
        required: true,
        min_value: 1,
        max_value: 10_000_000,
      },
    ],
  },
];

const commands = [
  {
    name: "bal",
    description: "Root Units + custodial SOL/SPL balances (linked account).",
    type: 1,
  },
  {
    name: "send",
    description: "Send RUNIT (Root Units) or RRTT: user / everyone / active / role",
    type: 1,
    options: sendOptions,
  },
  {
    name: "wallet",
    description: "Custodial Solana address + QR (SOL/SPL deposit)",
    type: 1,
  },
  {
    name: "deposit",
    description: "Same as /wallet — address + QR",
    type: 1,
  },
  {
    name: "menu",
    description: "Quick picker (balance, wallet, faucet claim, help)",
    type: 1,
  },
  {
    name: "faucet",
    description: "Random RU from pool (12h) or deposit into pool",
    type: 1,
    options: [
      { type: 1, name: "claim", description: "Random amount if pool has balance" },
      {
        type: 1,
        name: "deposit",
        description: "Add your Root Units to the pool",
        options: [
          {
            type: 4,
            name: "amount",
            description: "Whole Root Units",
            required: true,
            min_value: 1,
            max_value: 10_000_000,
          },
        ],
      },
    ],
  },
  {
    name: "withdraw",
    description: "Withdraw SPL (coming soon)",
    type: 1,
    options: [
      { type: 1, name: "token", description: "One SPL mint (soon)" },
      { type: 1, name: "all", description: "All tokens (soon)" },
    ],
  },
  {
    name: "airdrop",
    description: "Airdrops (coming soon)",
    type: 1,
    options: [
      { type: 1, name: "claim", description: "Claim an airdrop (soon)" },
      { type: 1, name: "create", description: "Create an airdrop (soon)" },
    ],
  },
  {
    name: "dice",
    description: "Wager Root Units vs another user (accept button)",
    type: 1,
    options: [
      { type: 6, name: "opponent", description: "User you challenge", required: true },
      {
        type: 4,
        name: "amount",
        description: "Root Units each (winner takes 2x)",
        required: true,
        min_value: 1,
        max_value: 10_000_000,
      },
    ],
  },
];

const meRes = await fetch(`${API}/oauth2/applications/@me`, {
  headers: { Authorization: `Bot ${token}`, "User-Agent": "RootRecord/discord-register-root-units" },
});
const meText = await meRes.text();
if (!meRes.ok) {
  console.error("GET /oauth2/applications/@me", meRes.status, meText.slice(0, 400));
  process.exit(1);
}
const me = JSON.parse(meText);
const verifyKey = typeof me.verify_key === "string" ? me.verify_key.trim() : "";
console.log("--- If you rotate the app, update wrangler.toml [vars] DISCORD_PUBLIC_KEY in rootrecord-api-account ---");
console.log(`DISCORD_PUBLIC_KEY=${verifyKey}`);
console.log(
  "--- REQUIRED: Developer Portal → YOUR APPLICATION → General Information → Interactions Endpoint URL ---",
);
console.log("https://rootrecord-api-account.rootrecord.workers.dev/v1/discord/interactions");
console.log(
  "Do NOT rely on Settings → Webhooks / Events “Endpoint URL” alone — that is a different product; slash commands need the General Information field (or your bot must handle Gateway INTERACTION_CREATE).",
);

const putRes = await fetch(`${API}/applications/${encodeURIComponent(appId)}/guilds/${encodeURIComponent(guildId)}/commands`, {
  method: "PUT",
  headers: {
    Authorization: `Bot ${token}`,
    "Content-Type": "application/json; charset=utf-8",
    "User-Agent": "RootRecord/discord-register-root-units",
  },
  body: JSON.stringify(commands),
});
const putText = await putRes.text();
if (!putRes.ok) {
  console.error("PUT guild commands", putRes.status, putText.slice(0, 1200));
  process.exit(1);
}
console.log("ok PUT guild commands", putRes.status, putText.slice(0, 200));
