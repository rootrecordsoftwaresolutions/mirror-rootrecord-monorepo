import { postMessage } from "./discordApi.mjs";
import { AVA_CHANNELS } from "./config.mjs";

/**
 * When Cursor / desktop offline: post to offline-notes channel and refuse deep digs.
 * No Grok/xAI substitute.
 */

export function offlineChannelId() {
  return (
    String(process.env.AVA_OFFLINE_CHANNEL_ID || "").trim() ||
    AVA_CHANNELS.avaHome ||
    AVA_CHANNELS.admins ||
    null
  );
}

export async function postOfflineNote(fetchJson, reason = "Root Server offline") {
  const ch = offlineChannelId();
  if (!ch || !fetchJson) return null;
  const line = [
    `**Ava offline note** · ${new Date().toISOString()}`,
    String(reason).slice(0, 300),
    `_Deep digs paused — leave notes here or in the Ava handoff folder. No substitute brain._`,
  ].join("\n");
  try {
    return await postMessage(fetchJson, ch, line, null);
  } catch (err) {
    console.warn("offline note:", err.message);
    return null;
  }
}

export function offlineReply() {
  return "I'm a bit offline on the deep-dig side — leave a note in offline-notes / my handoff folder and I'll catch it when the Root Server's back. No substitute brain.";
}
