/**
 * Cloudflare Tunnel for https://ava.rootmc.net → local Ava status (:8787).
 * Starts with Ava when AVA_PUBLIC_TUNNEL is not "0" (default on).
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AVA_PORT } from "./config.mjs";
import { pushStatusEvent } from "./store.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE = path.resolve(__dirname, "../../..");
const DEFAULT_CFG = path.join(
  WORKSPACE,
  "scripts",
  "local-edge",
  "cloudflared",
  "config.yml",
);

let child = null;

export function publicAvaUrl() {
  return String(process.env.AVA_PUBLIC_URL || "https://ava.rootmc.net").replace(
    /\/$/,
    "",
  );
}

function tunnelEnabled() {
  const v = String(process.env.AVA_PUBLIC_TUNNEL || "1").trim().toLowerCase();
  return v !== "0" && v !== "false" && v !== "off";
}

function findCloudflared() {
  const fromEnv = String(process.env.CLOUDFLARED_PATH || "").trim();
  if (fromEnv && fs.existsSync(fromEnv)) return fromEnv;
  const candidates =
    process.platform === "win32"
      ? [
          "C:\\Program Files (x86)\\cloudflared\\cloudflared.exe",
          "C:\\Program Files\\cloudflared\\cloudflared.exe",
          path.join(process.env.LOCALAPPDATA || "", "cloudflared", "cloudflared.exe"),
        ]
      : ["/usr/local/bin/cloudflared", "/usr/bin/cloudflared"];
  for (const p of candidates) {
    if (p && fs.existsSync(p)) return p;
  }
  return "cloudflared";
}

function configPath() {
  return String(process.env.AVA_TUNNEL_CONFIG || DEFAULT_CFG).trim();
}

export function startAvaPublicTunnel() {
  if (!tunnelEnabled()) {
    console.log("Ava public tunnel disabled (AVA_PUBLIC_TUNNEL=0)");
    return null;
  }
  if (child && !child.killed) return child;

  const cfg = configPath();
  if (!fs.existsSync(cfg)) {
    console.warn("Ava tunnel config missing:", cfg);
    pushStatusEvent("tunnel config missing");
    return null;
  }

  const bin = findCloudflared();
  try {
    child = spawn(bin, ["tunnel", "--config", cfg, "run"], {
      cwd: path.dirname(cfg),
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
      detached: false,
    });
  } catch (err) {
    console.warn("cloudflared spawn failed:", err.message);
    pushStatusEvent(`tunnel spawn failed · ${err.message}`);
    return null;
  }

  child.stdout?.on("data", (buf) => {
    const line = String(buf).trim();
    if (line) console.log("[tunnel]", line.slice(0, 240));
  });
  child.stderr?.on("data", (buf) => {
    const line = String(buf).trim();
    if (line) console.warn("[tunnel]", line.slice(0, 240));
  });
  child.on("exit", (code) => {
    console.warn(`cloudflared exited code=${code}`);
    pushStatusEvent(`tunnel exited · ${code}`);
    child = null;
  });

  console.log(
    `Ava public tunnel → ${publicAvaUrl()} (local :${AVA_PORT}) via ${cfg}`,
  );
  pushStatusEvent(`tunnel up · ${publicAvaUrl()}`);
  return child;
}

export function stopAvaPublicTunnel() {
  if (!child) return;
  try {
    child.kill();
  } catch {
    /* ignore */
  }
  child = null;
}
