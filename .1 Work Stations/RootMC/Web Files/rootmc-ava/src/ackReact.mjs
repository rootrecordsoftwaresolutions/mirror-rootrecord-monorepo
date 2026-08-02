/**
 * Silent status reactions on the asker's message:
 * - Seen + recorded → ⏱️ (time)
 * - Watching / looking → 👀 (eyes) — use often (Alex lock 2026-08-02)
 * - Reply in the works → ✏️ (pencil)
 * Slack: clock1 / eyes / pencil2 (no Ava pack there)
 * Never announce these; fail soft if missing scopes.
 */
import { isSlackChannelId } from "./slackGateway.mjs";
import { appendAction } from "./fullLog.mjs";
import { appEmojiReaction, hasAppEmoji } from "./appEmojis.mjs";

/** Seen + inbound recorded */
const RECORDED = {
  discord: "⏱️",
  slack: "clock1",
};

/** Watching / looking — Ava uses this often */
const EYES = {
  discord: "👀",
  slack: "eyes",
};

/** Reply / dig currently being written */
const WRITING = {
  discord: "✏️",
  slack: "pencil2",
};

/**
 * @param {{
 *   fetchJson?: (path: string, init?: object) => Promise<any>,
 *   slackClient?: { reactions?: { add: (args: object) => Promise<any>, remove?: (args: object) => Promise<any> } } | null,
 * }} deps
 */
export function createAckReactor(deps = {}) {
  const { fetchJson, slackClient } = deps;

  async function reactDiscord(channelId, messageId, emoji) {
    if (!fetchJson || !channelId || !messageId || !emoji) return false;
    const enc = encodeURIComponent(emoji);
    try {
      await fetchJson(
        `/channels/${channelId}/messages/${messageId}/reactions/${enc}/@me`,
        { method: "PUT" },
      );
      return true;
    } catch (err) {
      console.warn("discord ack react:", err.message);
    }
    return false;
  }

  async function unreactDiscord(channelId, messageId, emoji) {
    if (!fetchJson || !channelId || !messageId || !emoji) return false;
    const enc = encodeURIComponent(emoji);
    try {
      await fetchJson(
        `/channels/${channelId}/messages/${messageId}/reactions/${enc}/@me`,
        { method: "DELETE" },
      );
      return true;
    } catch (err) {
      // Missing reaction / unknown emoji — ignore
      if (!/10008|10014|404/.test(String(err.message || ""))) {
        console.warn("discord ack unreact:", err.message);
      }
    }
    return false;
  }

  async function reactSlack(channelId, messageTs, name) {
    const client =
      typeof slackClient === "function" ? slackClient() : slackClient;
    if (!client?.reactions?.add || !channelId || !messageTs) return false;
    try {
      const data = await client.reactions.add({
        channel: String(channelId),
        timestamp: String(messageTs),
        name: String(name).replace(/^:|:$/g, ""),
      });
      if (data && data.ok === false) {
        // already_reacted is fine
        if (data.error !== "already_reacted") {
          console.warn("slack ack react:", data.error);
          return false;
        }
      }
      return true;
    } catch (err) {
      console.warn("slack ack react:", err.message);
      return false;
    }
  }

  async function unreactSlack(channelId, messageTs, name) {
    const client =
      typeof slackClient === "function" ? slackClient() : slackClient;
    if (!client?.reactions?.remove || !channelId || !messageTs) return false;
    try {
      const data = await client.reactions.remove({
        channel: String(channelId),
        timestamp: String(messageTs),
        name: String(name).replace(/^:|:$/g, ""),
      });
      if (data && data.ok === false && data.error !== "no_reaction") {
        console.warn("slack ack unreact:", data.error);
        return false;
      }
      return true;
    } catch (err) {
      console.warn("slack ack unreact:", err.message);
      return false;
    }
  }

  async function react(channelId, messageId, kind) {
    if (!channelId || !messageId) return false;
    const surface = isSlackChannelId(channelId) ? "slack" : "discord";
    const table =
      kind === "writing"
        ? WRITING
        : kind === "eyes" || kind === "watching"
          ? EYES
          : kind === "stored" || kind === "seen"
            ? RECORDED
            : RECORDED;
    const emoji = table[surface];
    let ok = false;
    if (surface === "slack") {
      ok = await reactSlack(channelId, messageId, emoji);
    } else {
      ok = await reactDiscord(channelId, messageId, emoji);
    }
    if (ok) {
      appendAction("ack.react", {
        channelId,
        messageId,
        kind,
        surface,
        emoji,
      });
    }
    return ok;
  }

  /** ⏱️ + 👀 — default "I see this / I'm watching" pair */
  async function reactSeenWithEyes(channelId, messageId) {
    if (!channelId || !messageId) return false;
    const a = await react(channelId, messageId, "seen");
    const b = await react(channelId, messageId, "eyes");
    return a || b;
  }

  async function clearWriting(channelId, messageId) {
    if (!channelId || !messageId) return false;
    const surface = isSlackChannelId(channelId) ? "slack" : "discord";
    const emoji = WRITING[surface];
    let ok = false;
    if (surface === "slack") {
      ok = await unreactSlack(channelId, messageId, emoji);
    } else {
      ok = await unreactDiscord(channelId, messageId, emoji);
    }
    if (ok) {
      appendAction("ack.unreact", {
        channelId,
        messageId,
        kind: "writing_clear",
        surface,
        emoji,
      });
    }
    return ok;
  }

  /**
   * React with a named Ava Discord app emoji (e.g. ava_wave, heart, bug_report).
   * Discord only — Slack has no Ava pack yet. Fail soft.
   */
  async function reactApp(channelId, messageId, name) {
    if (!channelId || !messageId || !name) return false;
    if (isSlackChannelId(channelId)) return false;
    if (!hasAppEmoji(name)) {
      console.warn("ack reactApp: unknown emoji", name);
      return false;
    }
    const emoji = appEmojiReaction(name);
    const ok = await reactDiscord(channelId, messageId, emoji);
    if (ok) {
      appendAction("ack.react", {
        channelId,
        messageId,
        kind: "app",
        surface: "discord",
        emoji,
        name,
      });
    }
    return ok;
  }

  return {
    /** Saw it — ⏱️ + 👀 (eyes often) */
    reactSeen: (channelId, messageId) => reactSeenWithEyes(channelId, messageId),
    /** Inbound stored / recorded — ⏱️ + 👀 */
    reactStored: (channelId, messageId) => reactSeenWithEyes(channelId, messageId),
    /** Watching only — 👀 */
    reactEyes: (channelId, messageId) => react(channelId, messageId, "eyes"),
    /** Reply or dig in progress — ✏️ */
    reactWriting: (channelId, messageId) => react(channelId, messageId, "writing"),
    /** Drop pencil when reply posts or is abandoned */
    clearWriting,
    /** Named Ava app emoji on Discord */
    reactApp,
    /**
     * No text reply — still acknowledge. ⏱️ + 👀 + warm heart. No pencil.
     */
    reactNoReply: async (channelId, messageId) => {
      if (!channelId || !messageId) return false;
      const surface = isSlackChannelId(channelId) ? "slack" : "discord";
      let ok = await reactSeenWithEyes(channelId, messageId);
      if (surface === "slack") {
        ok = (await reactSlack(channelId, messageId, "thumbsup")) || ok;
      } else {
        const warm =
          appEmojiReaction("ava_love") ||
          appEmojiReaction("heart") ||
          "❤️";
        ok = (await reactDiscord(channelId, messageId, warm)) || ok;
      }
      // Ensure no leftover pencil from a cancelled write
      await clearWriting(channelId, messageId);
      if (ok) {
        appendAction("ack.react", {
          channelId,
          messageId,
          kind: "no_reply",
          surface,
        });
      }
      return ok;
    },
  };
}
