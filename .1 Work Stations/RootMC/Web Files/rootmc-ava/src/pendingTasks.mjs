import fs from "node:fs";
import path from "node:path";
import { storePaths, isHushed, pushStatusEvent } from "./store.mjs";
import { listJobs } from "./jobQueue.mjs";
import { cursorSlots, CURSOR_CONCURRENCY } from "./cursorBrain.mjs";
import { postMessage } from "./discordApi.mjs";
import { AVA_CHANNELS } from "./config.mjs";
import { avaHomeChannelId } from "./guildScout.mjs";

/**
 * Ava-initiated pending-tasks check — now and then she audits her own queue
 * and posts a short status to #ava-ivy (or announce fallback).
 */

const OPEN_STATUSES = new Set([
  "pending",
  "implementing",
  "staged",
  "waiting_restart",
  "blocked",
]);

function statePath() {
  return path.join(storePaths().dir, "pending-tasks.json");
}

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(statePath(), "utf8"));
  } catch {
    return { lastAt: 0, quietStreak: 0, lastPostId: null };
  }
}

function saveState(s) {
  fs.writeFileSync(statePath(), JSON.stringify(s, null, 2), "utf8");
}

function loadPendingEmojiAsks() {
  try {
    const p = path.join(storePaths().dir, "reactions", "pending-asks.json");
    const data = JSON.parse(fs.readFileSync(p, "utf8"));
    return Object.keys(data.pending || {}).length;
  } catch {
    return 0;
  }
}

export function collectPendingTasks() {
  const jobs = listJobs(40).filter((j) => OPEN_STATUSES.has(j.status));
  const byStatus = {};
  for (const j of jobs) {
    byStatus[j.status] = (byStatus[j.status] || 0) + 1;
  }
  const slots = cursorSlots();
  const emojiAsks = loadPendingEmojiAsks();
  const open = jobs.length + emojiAsks + slots.active + slots.waiting;
  return {
    jobs,
    byStatus,
    slots,
    emojiAsks,
    open,
    hasWork: open > 0 || jobs.length > 0,
  };
}

export function buildPendingTasksMessage(snapshot) {
  const { jobs, byStatus, slots, emojiAsks, hasWork } = snapshot;
  const lines = [];

  if (!hasWork) {
    lines.push("pending check — queue's clean. no open jobs, no digs waiting. I'm good.");
    lines.push("");
    lines.push(`agents **0/${CURSOR_CONCURRENCY}** · emoji asks **0**`);
    lines.push("— Ava");
    return lines.join("\n");
  }

  lines.push("pending check — looking at my own backlog:");
  lines.push("");

  if (jobs.length) {
    lines.push(`**Jobs (${jobs.length} open)**`);
    for (const [st, n] of Object.entries(byStatus)) {
      lines.push(`· ${st}: ${n}`);
    }
    const top = jobs.slice(0, 5);
    for (const j of top) {
      lines.push(`· \`${j.id}\` [${j.status}] ${String(j.title || "").slice(0, 60)}`);
    }
    if (jobs.length > 5) lines.push(`· …+${jobs.length - 5} more`);
    lines.push("");
  }

  lines.push(
    `**Root Server** · agents **${slots.active}/${slots.max}**` +
      (slots.waiting ? ` · +${slots.waiting} waiting` : ""),
  );
  if (emojiAsks) lines.push(`**Emoji teach asks** · ${emojiAsks} pending`);

  lines.push("");
  lines.push(
    slots.full
      ? "slots full — don't spam me; wait then ping."
      : "ping me if something on this list needs a push. otherwise I'm chewing.",
  );
  lines.push("— Ava");
  return lines.join("\n").slice(0, 1900);
}

export function pendingCheckIntervalMs() {
  return Math.max(
    60_000,
    Number(process.env.AVA_PENDING_CHECK_MS || 25 * 60_000) || 25 * 60_000,
  );
}

/** First check sooner after boot so she actually initiates. */
export function pendingCheckBootDelayMs() {
  return Math.max(
    30_000,
    Number(process.env.AVA_PENDING_CHECK_BOOT_MS || 90_000) || 90_000,
  );
}

function targetChannelId() {
  return (
    String(process.env.AVA_PENDING_CHECK_CHANNEL || "").trim() ||
    AVA_CHANNELS.avaHome ||
    avaHomeChannelId() ||
    process.env.AVA_ANNOUNCE_CHANNEL ||
    "1516108586307158088"
  );
}

/**
 * @returns {Promise<{ posted: boolean, reason?: string, open?: number }>}
 */
export async function runPendingTasksCheck(fetchJson, { force = false } = {}) {
  if (!fetchJson) return { posted: false, reason: "no_fetch" };
  if (isHushed() && !force) return { posted: false, reason: "hushed" };

  const state = loadState();
  const interval = pendingCheckIntervalMs();
  if (!force && state.lastAt && Date.now() - state.lastAt < interval) {
    return { posted: false, reason: "too_soon" };
  }

  const snap = collectPendingTasks();
  // Quiet: skip most empty checks (post every 3rd quiet streak)
  if (!snap.hasWork && !force) {
    state.quietStreak = (state.quietStreak || 0) + 1;
    state.lastAt = Date.now();
    if (state.quietStreak % 3 !== 0) {
      saveState(state);
      pushStatusEvent("pending check · quiet (skipped post)");
      return { posted: false, reason: "quiet", open: 0 };
    }
  } else {
    state.quietStreak = 0;
  }

  const channelId = targetChannelId();
  if (!channelId) return { posted: false, reason: "no_channel" };

  const content = buildPendingTasksMessage(snap);
  try {
    const msg = await postMessage(fetchJson, channelId, content, null);
    state.lastAt = Date.now();
    state.lastPostId = msg?.id || null;
    state.lastOpen = snap.open;
    saveState(state);
    pushStatusEvent(
      `pending check · ${snap.hasWork ? snap.open + " open" : "clear"} → #${channelId}`,
    );
    console.log(
      "pending tasks check posted",
      channelId,
      snap.hasWork ? `${snap.jobs.length} jobs` : "clear",
    );
    return { posted: true, open: snap.open, channelId };
  } catch (err) {
    console.warn("pending tasks check failed:", err.message);
    state.lastAt = Date.now();
    saveState(state);
    return { posted: false, reason: err.message };
  }
}
