/**
 * Operator power-down — disconnect Discord + stop background work + exit process tree.
 * Does NOT auto-restart (unlike silent upgrade). Human `npm start` powers back on.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  markShutdown,
  loadWatermark,
  pushStatusEvent,
  storePaths,
  writeHeartbeat,
} from "./store.mjs";
import { appendAction } from "./fullLog.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AVA_ROOT = path.resolve(__dirname, "..");

let scheduled = false;
/** @type {null | (() => void | Promise<void>)} */
let prepareHook = null;

function powerOffPath() {
  return path.join(storePaths().dir, "power-off.json");
}

export function isPoweredOff() {
  try {
    if (!fs.existsSync(powerOffPath())) return false;
    const j = JSON.parse(fs.readFileSync(powerOffPath(), "utf8"));
    return Boolean(j?.off);
  } catch {
    return false;
  }
}

export function clearPoweredOff() {
  try {
    const p = powerOffPath();
    if (fs.existsSync(p)) fs.unlinkSync(p);
  } catch {
    /* ignore */
  }
}

export function setPowerDownPrepare(fn) {
  prepareHook = typeof fn === "function" ? fn : null;
}

/**
 * Alex / Melee: "power down", "ava power off", "shut down ava", "go offline"
 * Accepts natural prefixes (yes/please/ok) — not roleplay chat about power.
 */
export function isPowerDownCommand(content) {
  const q = String(content || "")
    .toLowerCase()
    .replace(/<@!?\d+>/g, " ")
    .replace(/[“”"']/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!q) return false;
  // Must actually ask to power down / go offline — not "don't power down"
  if (/\b(don'?t|do not|never|stop)\b.*\b(power\s*(down|off)|go\s+offline|shut\s*down)\b/.test(q)) {
    return false;
  }
  return (
    /\b(power\s*(down|off)|shut\s*down(\s+ava)?|go\s+offline)\b/.test(q) &&
    (
      /^(hey\s+|hi\s+|ok\s+|okay\s+|yes\s+|yeah\s+|yep\s+|pls\s+|please\s+)*ava[,:]?\s+/.test(q) ||
      /\bava\b/.test(q) ||
      /^(hey\s+|hi\s+|ok\s+|okay\s+|yes\s+|yeah\s+|yep\s+|pls\s+|please\s+)*(power\s*(down|off)|shut\s*down|go\s+offline)\b/.test(
        q,
      )
    )
  );
}

/**
 * Disconnect Discord, stop timers/background, kill entire Ava node tree — no npm start.
 */
export function schedulePowerDown({
  reason = "operator power down",
  delayMs = 2000,
  requestedBy = "operator",
} = {}) {
  if (scheduled) {
    return { ok: false, reason: "already_scheduled" };
  }
  scheduled = true;

  const payload = {
    off: true,
    at: Date.now(),
    reason: String(reason).slice(0, 200),
    requestedBy: String(requestedBy).slice(0, 80),
    delayMs,
    pid: process.pid,
  };

  try {
    fs.mkdirSync(storePaths().dir, { recursive: true });
    fs.writeFileSync(powerOffPath(), JSON.stringify(payload, null, 2), "utf8");
  } catch {
    /* still try */
  }

  try {
    markShutdown(loadWatermark().channels || {});
  } catch {
    /* ignore */
  }

  writeHeartbeat({
    live: false,
    mode: "off",
    poweredOff: true,
    asleep: false,
  });
  pushStatusEvent(`power down · ${payload.reason}`);
  appendAction("power.down", {
    reason: payload.reason,
    by: payload.by || null,
    channelId: payload.channelId || null,
  });

  const runPrepare = async () => {
    try {
      if (prepareHook) await prepareHook();
    } catch (err) {
      console.warn("power-down prepare:", err.message);
    }
  };

  // Start prepare immediately (gateway disconnect, timers)
  void runPrepare();

  const waitSec = Math.max(1, Math.ceil(Number(delayMs) / 1000));

  // Detached: wait → kill all Ava node processes. NO npm start.
  try {
    let child;
    if (process.platform === "win32") {
      const ps = `
$ErrorActionPreference = 'SilentlyContinue'
Start-Sleep -Seconds ${waitSec}
Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object {
  $_.CommandLine -match 'rootmc-ava' -or $_.CommandLine -match 'ava\\\\src\\\\(index|server|poller)' -or $_.CommandLine -match 'src/index\\.mjs'
} | ForEach-Object {
  if ($_.CommandLine -match 'rootmc-ava|ava\\\\src\\\\|Web Files\\\\rootmc-ava|src/index\\.mjs') {
    Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
  }
}
`;
      child = spawn(
        "powershell.exe",
        ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", ps],
        {
          cwd: AVA_ROOT,
          detached: true,
          stdio: "ignore",
          windowsHide: true,
          env: process.env,
        },
      );
    } else {
      const sh = `
sleep ${waitSec}
pkill -f 'rootmc-ava/src/(index|server|poller)\\.mjs' 2>/dev/null || true
pkill -f 'Web Files/rootmc-ava/src/(index|server|poller)\\.mjs' 2>/dev/null || true
`;
      child = spawn("bash", ["-lc", sh], {
        cwd: AVA_ROOT,
        detached: true,
        stdio: "ignore",
        env: process.env,
      });
    }
    child.unref();
  } catch (err) {
    scheduled = false;
    pushStatusEvent(`power down spawn failed · ${err.message}`);
    return { ok: false, reason: err.message };
  }

  return { ok: true, ...payload };
}
