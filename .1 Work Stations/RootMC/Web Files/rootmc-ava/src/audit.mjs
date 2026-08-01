import { postMessage } from "./discordApi.mjs";

/**
 * Audit / changelog channel posts for significant Ava actions.
 */

export async function postAudit(fetchJson, channelId, { title, body }) {
  if (!fetchJson || !channelId) return null;
  const content = ["**Ava audit**", title ? `### ${title}` : null, body || ""]
    .filter(Boolean)
    .join("\n")
    .slice(0, 1900);
  return postMessage(fetchJson, channelId, content, null);
}
