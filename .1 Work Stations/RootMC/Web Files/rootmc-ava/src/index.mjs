import { spawn, execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AVA_PORT, AVA_HANDOFF, isHeadlessHost } from "./config.mjs";
import { startDesktopRichPresence } from "./richPresence.mjs";
import { clearRestartRequest, loadRestartRequest } from "./selfUpgrade.mjs";
import { clearPoweredOff, isPoweredOff } from "./powerDown.mjs";
import { pushStatusEvent, storePaths } from "./store.mjs";
import { writeLiveness } from "./liveness.mjs";
import {
  startAvaPublicTunnel,
  stopAvaPublicTunnel,
  publicAvaUrl,
} from "./publicTunnel.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const statusUrl = `http://127.0.0.1:${AVA_PORT}/`;

storePaths();

/** One parent tree only — second index.mjs exits so we never double-post. */
function parentLockPath() {
  return path.join(storePaths().dir, "ava-parent.lock");
}

function pidAlive(pid) {
  if (!pid || !Number.isFinite(Number(pid))) return false;
  try {
    process.kill(Number(pid), 0);
    return true;
  } catch {
    return false;
  }
}

function acquireParentLock() {
  const lockPath = parentLockPath();
  try {
    if (fs.existsSync(lockPath)) {
      const prev = JSON.parse(fs.readFileSync(lockPath, "utf8"));
      const other = Number(prev?.pid);
      if (other && other !== process.pid && pidAlive(other)) {
        console.error(
          `Ava already running (parent pid ${other}) — refusing second tree to stop double-posts.`,
        );
        process.exit(0);
      }
    }
  } catch {
    /* stale / unreadable — take over */
  }
  fs.writeFileSync(
    lockPath,
    JSON.stringify({ pid: process.pid, at: Date.now(), statusUrl }, null, 2),
    "utf8",
  );
}

function releaseParentLock() {
  try {
    const lockPath = parentLockPath();
    if (!fs.existsSync(lockPath)) return;
    const prev = JSON.parse(fs.readFileSync(lockPath, "utf8"));
    if (Number(prev?.pid) === process.pid) fs.unlinkSync(lockPath);
  } catch {
    /* ignore */
  }
}

acquireParentLock();

// Human npm start = power on — clear sticky power-off so watchdog can run.
clearPoweredOff();
const priorRestart = loadRestartRequest();
clearRestartRequest();
if (priorRestart?.silent) {
  pushStatusEvent(`back · silent ${priorRestart.reason || "upgrade"}`);
} else if (priorRestart) {
  pushStatusEvent(`back · ${priorRestart.reason || "restart"}`);
}

const MAX_BURST_CRASHES = 5;
const BURST_WINDOW_MS = 60_000;
const BASE_BACKOFF_MS = 1_500;
const MAX_BACKOFF_MS = 30_000;

/** @type {Map<string, { child: import('node:child_process').ChildProcess | null; restarts: number; recent: number[]; stopping: boolean }>} */
const children = new Map();

let shuttingDown = false;
let childRestartsTotal = 0;

function pulseParentLiveness() {
  const snap = {};
  for (const [name, st] of children) {
    snap[name] = {
      pid: st.child?.pid || null,
      restarts: st.restarts,
      alive: Boolean(st.child && !st.child.killed && st.child.exitCode == null),
    };
  }
  writeLiveness({
    children: snap,
    childRestartsTotal,
    crashLoop: false,
    shuttingDown,
  });
}

function runSupervised(script) {
  const state = children.get(script) || {
    child: null,
    restarts: 0,
    recent: [],
    stopping: false,
  };
  children.set(script, state);

  const child = spawn(process.execPath, [path.join(__dirname, script)], {
    cwd: root,
    stdio: "inherit",
    env: process.env,
  });
  state.child = child;
  pulseParentLiveness();

  child.on("exit", (code, signal) => {
    state.child = null;
    console.error(`${script} exited`, code, signal || "");
    if (shuttingDown || state.stopping) {
      pulseParentLiveness();
      return;
    }

    // Operator power-down — do not respawn; exit the whole tree.
    if (isPoweredOff()) {
      shuttingDown = true;
      for (const st of children.values()) st.stopping = true;
      pushStatusEvent("powered off — parent exiting (no respawn)");
      pulseParentLiveness();
      setTimeout(() => process.exit(0), 300);
      return;
    }

    const now = Date.now();
    state.recent = state.recent.filter((t) => now - t < BURST_WINDOW_MS);
    state.recent.push(now);
    state.restarts += 1;
    childRestartsTotal += 1;

    if (state.recent.length >= MAX_BURST_CRASHES) {
      pushStatusEvent(`crash loop · ${script} — parent staying up; manual restart`);
      writeLiveness({ crashLoop: true, crashLoopScript: script });
      pulseParentLiveness();
      return;
    }

    const backoff = Math.min(
      MAX_BACKOFF_MS,
      BASE_BACKOFF_MS * 2 ** Math.max(0, state.recent.length - 1),
    );
    pushStatusEvent(`respawn · ${script} in ${Math.round(backoff / 1000)}s (exit ${code ?? signal})`);
    pulseParentLiveness();
    setTimeout(() => {
      if (shuttingDown || state.stopping || isPoweredOff()) return;
      runSupervised(script);
    }, backoff);
  });

  return child;
}

/**
 * Open status window at most once (lock file). Restarts reuse the same URL —
 * refresh an existing window instead of spawning stacks of Edge/Chrome apps.
 * Force a new window: AVA_STATUS_WINDOW=force
 * Disable: AVA_NO_STATUS_WINDOW=1 (also auto on Linux / SSH / non-TTY)
 */
function openStatusWindow() {
  if (isHeadlessHost()) {
    console.log(`Ava status (headless) → ${statusUrl} (ssh -L ${AVA_PORT}:127.0.0.1:${AVA_PORT})`);
    return;
  }
  const force = String(process.env.AVA_STATUS_WINDOW || "").trim().toLowerCase() === "force";
  const lockDir = path.join(AVA_HANDOFF, "data");
  try {
    fs.mkdirSync(lockDir, { recursive: true });
  } catch {
    /* ignore */
  }
  const lockPath = path.join(lockDir, "status-window.lock");
  if (!force) {
    try {
      if (fs.existsSync(lockPath)) {
        const age = Date.now() - fs.statSync(lockPath).mtimeMs;
        if (age < 12 * 60 * 60 * 1000) {
          console.log(`Ava status already opened earlier → ${statusUrl} (refresh that tab)`);
          return;
        }
      }
    } catch {
      /* open anyway */
    }
  }
  try {
    fs.writeFileSync(
      lockPath,
      JSON.stringify({ at: Date.now(), url: statusUrl }, null, 2),
      "utf8",
    );
  } catch {
    /* ignore */
  }

  if (process.platform !== "win32") {
    console.log(`Ava status → ${statusUrl}`);
    return;
  }

  const ps = `
$u = '${statusUrl}'
$edge = @(
  "$env:ProgramFiles(x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "$env:ProgramFiles\\Microsoft\\Edge\\Application\\msedge.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1
$chrome = @(
  "$env:ProgramFiles\\Google\\Chrome\\Application\\chrome.exe",
  "$env:ProgramFiles(x86)\\Google\\Chrome\\Application\\chrome.exe",
  "$env:LocalAppData\\Google\\Chrome\\Application\\chrome.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1
if ($edge) { Start-Process $edge -ArgumentList @('--app=' + $u, '--new-window') }
elseif ($chrome) { Start-Process $chrome -ArgumentList @('--app=' + $u, '--new-window') }
else { Start-Process $u }
`;
  try {
    execFile(
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", ps],
      (err) => {
        if (err) console.warn("status window:", err.message);
      },
    );
  } catch (err) {
    console.warn("status window:", err.message);
  }
}

function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  pushStatusEvent("parent shutdown");
  stopAvaPublicTunnel();
  for (const st of children.values()) {
    st.stopping = true;
    try {
      st.child?.kill();
    } catch {
      /* ignore */
    }
  }
  releaseParentLock();
  pulseParentLiveness();
  setTimeout(() => process.exit(0), 500);
}

process.on("exit", releaseParentLock);

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

runSupervised("server.mjs");
runSupervised("poller.mjs");
setInterval(pulseParentLiveness, 10_000);
pulseParentLiveness();

/** Desktop Discord "Playing Ava Ivy" (IPC) — party/join from Rich Presence visualizer. */
startDesktopRichPresence();

/** Public tunnel https://ava.rootmc.net → :8787 while Ava is live on this box. */
startAvaPublicTunnel();

setTimeout(openStatusWindow, 2500);
console.log(`Ava status → ${statusUrl} (watchdog on)`);
console.log(`Ava public → ${publicAvaUrl()} (when tunnel + DNS live)`);
