/**
 * Trigger all RootMC daily reports (summary + every category) via rootmc Worker.
 *
 * Usage (from Web/cloudflare/rootmc-realm-api/):
 *   node scripts/post-rootmc-trigger-all-reports.mjs
 */
import fs from "node:fs";
import path from "node:path";

const ROOTMC_API =
  process.env.ROOTMC_API_URL || "https://api.rootmc.net";

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
  for (const p of [
    path.join(process.cwd(), "credentials.env"),
    path.join(process.cwd(), "../../../credentials.env"),
    path.join(process.cwd(), "../../../../credentials.env"),
  ]) {
    if (fs.existsSync(p)) return p;
  }
  return path.join(process.cwd(), "../../../credentials.env");
}

function readCloudYml() {
  const candidates = [
    process.env.ROOTMC_CLOUD_YML,
    "C:/Users/rrdeveloper/Desktop/RootMC - Current/plugins/RootRecord/cloud.yml",
    "C:/Users/rrdeveloper/Desktop/RootMC/plugins/RootRecord/cloud.yml",
    path.join(process.cwd(), "../../../../Minecraft/server/plugins/RootRecord/cloud.yml"),
  ].filter(Boolean);
  for (const p of candidates) {
    if (!fs.existsSync(p)) continue;
    const text = fs.readFileSync(p, "utf8");
    const serverId = text.match(/server-id:\s*([0-9a-f-]{36})/i)?.[1] || "";
    const serverSecret = text.match(/server-secret:\s*([0-9a-f]{64})/i)?.[1] || "";
    if (serverId && serverSecret) return { serverId, serverSecret };
  }
  return null;
}

const fileEnv = readEnvFile(findCredentialsPath());
const cloud = readCloudYml();
const serverId = String(
  process.env.ROOTSTAT_SERVER_ID || fileEnv.ROOTSTAT_SERVER_ID || cloud?.serverId || "",
).trim();
const serverSecret = String(
  process.env.ROOTSTAT_SERVER_SECRET || fileEnv.ROOTSTAT_SERVER_SECRET || cloud?.serverSecret || "",
).trim();

if (!serverId || !serverSecret) {
  console.error("Need server-id + server-secret (cloud.yml or ROOTSTAT_* in credentials.env).");
  process.exit(1);
}

console.log("Triggering all RootMC daily reports (summary + categories)…");
const res = await fetch(`${ROOTMC_API.replace(/\/$/, "")}/api/rootmc/daily-report/trigger-all`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-RootStat-Server-Id": serverId,
    "X-RootStat-Server-Secret": serverSecret,
  },
  body: "{}",
});
const data = await res.json().catch(() => ({}));
if (!res.ok || data.ok !== true) {
  console.error("failed", res.status, JSON.stringify(data).slice(0, 800));
  process.exit(1);
}
console.log("ok", data.dayKey, "server", data.server_id);
