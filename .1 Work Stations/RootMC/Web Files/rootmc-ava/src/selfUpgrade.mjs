import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AVA_HANDOFF } from "./config.mjs";
import { markShutdown, loadWatermark, pushStatusEvent, storePaths } from "./store.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AVA_ROOT = path.resolve(__dirname, "..");

let scheduled = false;

function restartStatePath() {
  return path.join(storePaths().dir, "restart-request.json");
}

export function loadRestartRequest() {
  try {
    const p = restartStatePath();
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

export function clearRestartRequest() {
  try {
    const p = restartStatePath();
    if (fs.existsSync(p)) fs.unlinkSync(p);
  } catch {
    /* ignore */
  }
}

/**
 * Schedule a silent self-restart (manual upgrade push).
 * Spawns a detached PowerShell that waits, kills this Ava tree, then `npm start`.
 * No Discord announce — status event only.
 */
export function scheduleSelfRestart({
  reason = "manual upgrade",
  delayMs = 1500,
  requestedBy = "local",
  silent = true,
} = {}) {
  if (scheduled) {
    return { ok: false, reason: "already_scheduled" };
  }
  scheduled = true;

  const payload = {
    at: Date.now(),
    reason: String(reason).slice(0, 200),
    requestedBy: String(requestedBy).slice(0, 80),
    silent: Boolean(silent),
    delayMs,
    pid: process.pid,
  };
  try {
    fs.writeFileSync(restartStatePath(), JSON.stringify(payload, null, 2), "utf8");
  } catch {
    /* still try restart */
  }

  try {
    markShutdown(loadWatermark().channels || {});
  } catch {
    /* ignore */
  }

  pushStatusEvent(
    silent
      ? `silent restart scheduled · ${payload.reason}`
      : `restart scheduled · ${payload.reason}`,
  );

  const waitSec = Math.max(1, Math.ceil(Number(delayMs) / 1000));
  const rootEsc = AVA_ROOT.replace(/'/g, "''");
  const handoffEsc = String(AVA_HANDOFF || "").replace(/'/g, "''");

  // Detached supervisor: sleep → kill rootmc-ava node → npm start (no status window)
  const ps = `
$ErrorActionPreference = 'SilentlyContinue'
Start-Sleep -Seconds ${waitSec}
Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object {
  $_.CommandLine -match 'rootmc-ava' -or $_.CommandLine -match 'ava\\\\src\\\\(index|server|poller)'
} | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Start-Sleep -Seconds 1
$env:AVA_NO_STATUS_WINDOW = '1'
if ('${handoffEsc}') { $env:AVA_HANDOFF = '${handoffEsc}' }
Set-Location '${rootEsc}'
Start-Process -FilePath 'npm.cmd' -ArgumentList 'start' -WorkingDirectory '${rootEsc}' -WindowStyle Hidden
`;

  try {
    const child = spawn(
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", ps],
      {
        cwd: AVA_ROOT,
        detached: true,
        stdio: "ignore",
        windowsHide: true,
        env: { ...process.env, AVA_NO_STATUS_WINDOW: "1" },
      },
    );
    child.unref();
  } catch (err) {
    scheduled = false;
    pushStatusEvent(`restart spawn failed · ${err.message}`);
    return { ok: false, reason: err.message };
  }

  // Supervisor kills this tree after delayMs — keep HTTP/poller alive until then.
  return { ok: true, ...payload };
}

export function isRestartCommand(content) {
  const q = String(content || "")
    .toLowerCase()
    .replace(/<@!?\d+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return (
    /^(hey\s+|hi\s+|ok\s+|okay\s+)?ava[,:]?\s+(restart|reboot|upgrade|reload)[.!?]*$/.test(q) ||
    /^(restart|reboot|upgrade|reload)[,.]?\s+ava[.!?]*$/.test(q) ||
    /^(restart|reboot|upgrade|self-?upgrade)[.!?]*$/.test(q)
  );
}
