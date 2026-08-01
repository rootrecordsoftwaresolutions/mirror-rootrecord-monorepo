/**
 * Shared Discord REST helpers for Ava (poller + gateway).
 */
import { DISCORD_API } from "./config.mjs";

export function authHeaders(token) {
  return {
    Authorization: `Bot ${token}`,
    "Content-Type": "application/json",
    "User-Agent": "AvaIvyRootMC (rootmc.net, 0.5)",
  };
}

export function makeFetchJson(token) {
  const headers = authHeaders(token);
  return async function fetchJson(path, init = {}) {
    const res = await fetch(`${DISCORD_API}${path}`, {
      ...init,
      headers: { ...headers, ...(init.headers || {}) },
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`${path} ${res.status}: ${text.slice(0, 200)}`);
    return text ? JSON.parse(text) : null;
  };
}

export async function postMessage(fetchJson, channelId, content, refId) {
  return fetchJson(`/channels/${channelId}/messages`, {
    method: "POST",
    body: JSON.stringify({
      content: String(content).slice(0, 2000),
      message_reference: refId ? { message_id: refId } : undefined,
      allowed_mentions: { parse: [] },
    }),
  });
}

export async function createDmChannel(fetchJson, userId) {
  return fetchJson(`/users/@me/channels`, {
    method: "POST",
    body: JSON.stringify({ recipient_id: String(userId) }),
  });
}

export async function sendDm(fetchJson, userId, content) {
  const ch = await createDmChannel(fetchJson, userId);
  if (!ch?.id) throw new Error("dm_channel_failed");
  return postMessage(fetchJson, ch.id, content, null);
}

/** Download Discord attachment into Ava uploads/. */
export async function downloadAttachment(url, destPath) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const fs = await import("node:fs");
  const path = await import("node:path");
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  fs.writeFileSync(destPath, buf);
  return destPath;
}
