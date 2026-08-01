import fs from "node:fs";
import path from "node:path";
import { storePaths } from "./store.mjs";
import {
  lookupStandardSignal,
  normalizeEmojiKey,
} from "./emojiSignals.mjs";

/**
 * Reaction feedback on Ava's messages — silent training / quality data.
 * Known standard emojis are pre-assigned. Unknowns: ask once, learn, never spam.
 */

function reactionsDir() {
  const dir = path.join(storePaths().dir, "reactions");
  fs.mkdirSync(dir, { recursive: true });
  fs.mkdirSync(path.join(dir, "messages"), { recursive: true });
  return dir;
}

function summaryPath() {
  return path.join(reactionsDir(), "summary.json");
}

function learnedPath() {
  return path.join(reactionsDir(), "learned.json");
}

function pendingAsksPath() {
  return path.join(reactionsDir(), "pending-asks.json");
}

function messagePath(messageId) {
  return path.join(reactionsDir(), "messages", `${messageId}.json`);
}

function readJson(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), "utf8");
}

/** @deprecated use resolveReaction — kept for callers that expect REACTION_MAP */
export const REACTION_MAP = {};

export function loadLearned() {
  return readJson(learnedPath(), { byKey: {}, updatedAt: 0 });
}

export function saveLearned(data) {
  data.updatedAt = Date.now();
  writeJson(learnedPath(), data);
}

export function loadPendingAsks() {
  return readJson(pendingAsksPath(), { pending: {}, asked: {}, updatedAt: 0 });
}

export function savePendingAsks(data) {
  data.updatedAt = Date.now();
  writeJson(pendingAsksPath(), data);
}

/**
 * Stable key for an emoji reaction.
 * Unicode → normalized glyph; custom → name:id
 */
export function emojiStorageKey(emoji) {
  if (!emoji) return "?";
  if (emoji.id) return `${emoji.name || "custom"}:${emoji.id}`;
  return normalizeEmojiKey(emoji.name || "") || String(emoji.name || "?");
}

export function emojiDisplay(emoji) {
  if (!emoji) return "?";
  if (emoji.id) return `:${emoji.name}:`;
  return emoji.name || "?";
}

/** Discord reaction path segment (unicode or name:id). */
export function emojiApiParam(emoji) {
  if (!emoji) return "";
  if (emoji.id) return `${emoji.name}:${emoji.id}`;
  return emoji.name || "";
}

/**
 * @returns {{ signal: 'good'|'bad'|'neutral', known: boolean, source: string }}
 */
export function resolveReaction(emojiOrName) {
  const raw =
    typeof emojiOrName === "object" && emojiOrName
      ? emojiOrName.name || ""
      : String(emojiOrName || "");
  const key =
    typeof emojiOrName === "object" && emojiOrName
      ? emojiStorageKey(emojiOrName)
      : normalizeEmojiKey(raw) || raw;

  const learned = loadLearned().byKey || {};
  if (learned[key]?.signal) {
    return { signal: learned[key].signal, known: true, source: "learned", key };
  }
  if (raw && learned[raw]?.signal) {
    return { signal: learned[raw].signal, known: true, source: "learned", key };
  }

  const standard = lookupStandardSignal(raw) || lookupStandardSignal(key);
  if (standard) {
    return { signal: standard, known: true, source: "standard", key };
  }

  // Custom emoji name heuristics (still "known" — no ask)
  const n = String(raw || key).toLowerCase();
  if (/thumbsup|heart|love|fire|check|clap|star|good|nice|based|pog|pepehappy/.test(n)) {
    return { signal: "good", known: true, source: "custom-heuristic", key };
  }
  if (/thumbsdown|cross|nope|bad|cringe|trash|mid|pepeangry|pepesad/.test(n)) {
    return { signal: "bad", known: true, source: "custom-heuristic", key };
  }

  return { signal: "neutral", known: false, source: "unknown", key };
}

export function classifyReaction(emojiName) {
  return resolveReaction(emojiName).signal;
}

export function learnEmoji(key, signal, meta = {}) {
  const sig = String(signal || "").toLowerCase();
  if (!["good", "bad", "neutral"].includes(sig)) return null;
  const data = loadLearned();
  data.byKey[key] = {
    signal: sig,
    taughtBy: meta.taughtBy || null,
    taughtByName: meta.taughtByName || null,
    rawText: meta.rawText ? String(meta.rawText).slice(0, 200) : null,
    display: meta.display || key,
    learnedAt: Date.now(),
  };
  saveLearned(data);

  const asks = loadPendingAsks();
  delete asks.pending[key];
  asks.asked[key] = true;
  savePendingAsks(asks);

  return data.byKey[key];
}

/** Parse good/bad/neutral from a short teaching reply. */
export function parseSignalFromText(text) {
  const t = String(text || "").trim().toLowerCase();
  if (!t) return null;
  if (/^(good|positive|like|👍|yes|yep|yeah|love|based)\b/.test(t)) return "good";
  if (/^(bad|negative|dislike|👎|nope|no|hate|cringe|trash|mid)\b/.test(t)) return "bad";
  if (/^(neutral|meh|idk|whatever|eh|mid-ok|neither)\b/.test(t)) return "neutral";
  if (/\b(means?\s+)?good\b/.test(t) || /\bpositive\b/.test(t) || /\blike\b/.test(t))
    return "good";
  if (/\b(means?\s+)?bad\b/.test(t) || /\bnegative\b/.test(t) || /\bdislike\b/.test(t))
    return "bad";
  if (/\b(means?\s+)?neutral\b/.test(t) || /\bmeh\b/.test(t)) return "neutral";
  return null;
}

/**
 * If this message teaches an emoji meaning (reply to ask, or emoji + signal), learn it.
 * @returns {{ learned: object, key: string, signal: string, thank: string } | null}
 */
export function tryLearnFromMessage(msg) {
  if (!msg?.content || msg.author?.bot) return null;
  const asks = loadPendingAsks();
  const pending = asks.pending || {};
  const signal = parseSignalFromText(msg.content);
  if (!signal) return null;

  const refId = msg.message_reference?.message_id;
  let hitKey = null;
  for (const [key, p] of Object.entries(pending)) {
    if (refId && String(p.askMessageId) === String(refId)) {
      hitKey = key;
      break;
    }
    if (
      String(p.askedUserId) === String(msg.author.id) &&
      String(p.channelId) === String(msg.channel_id || msg.channelId || "")
    ) {
      // same user in channel answering without strict reply — only if one pending for them
      if (!hitKey) hitKey = key;
      else if (hitKey !== key) {
        // ambiguous — require reply-to
        hitKey = null;
        break;
      }
    }
  }

  // "🫠 means good" — content includes a pending unicode glyph or :custom:
  if (!hitKey) {
    for (const [key, p] of Object.entries(pending)) {
      if (!key.includes(":") && msg.content.includes(key)) {
        hitKey = key;
        break;
      }
      const customName = key.includes(":") ? key.split(":")[0] : null;
      if (
        customName &&
        msg.content.toLowerCase().includes(`:${customName.toLowerCase()}:`)
      ) {
        hitKey = key;
        break;
      }
      if (p.display && p.display !== key && msg.content.includes(p.display)) {
        hitKey = key;
        break;
      }
    }
  }

  if (!hitKey || !pending[hitKey]) return null;

  const p = pending[hitKey];
  const learned = learnEmoji(hitKey, signal, {
    taughtBy: msg.author.id,
    taughtByName: msg.author.username,
    rawText: msg.content,
    display: p.display || hitKey,
  });
  const display = p.display || hitKey;
  return {
    learned,
    key: hitKey,
    signal,
    thank: `got it — locking ${display} as **${signal}**. thanks.`,
  };
}

export function buildEmojiAskLine({ display, username }) {
  const who = username ? `${username} — ` : "";
  return `${who}first time I've seen ${display} on my stuff. is that **good**, **bad**, or **neutral** for you? just reply which — helps me learn.`;
}

/**
 * Mark that we asked (or skip-ask) so we don't spam.
 */
export function markEmojiAsked(key, pendingRec) {
  const asks = loadPendingAsks();
  asks.asked[key] = true;
  if (pendingRec) asks.pending[key] = pendingRec;
  savePendingAsks(asks);
}

export function shouldAskAboutEmoji(key) {
  const asks = loadPendingAsks();
  if (asks.asked[key] || asks.pending[key]) return false;
  const learned = loadLearned().byKey || {};
  if (learned[key]) return false;
  return true;
}

function emptySummary() {
  return {
    totalReactions: 0,
    good: 0,
    bad: 0,
    neutral: 0,
    byEmoji: {},
    messagesTracked: 0,
    updatedAt: 0,
  };
}

export function loadReactionSummary() {
  return readJson(summaryPath(), emptySummary());
}

function rebuildSummaryFromDisk() {
  const dir = path.join(reactionsDir(), "messages");
  const summary = emptySummary();
  let files = [];
  try {
    files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
  } catch {
    files = [];
  }
  for (const f of files) {
    const rec = readJson(path.join(dir, f), null);
    if (!rec?.totals) continue;
    summary.messagesTracked += 1;
    summary.good += rec.totals.good || 0;
    summary.bad += rec.totals.bad || 0;
    summary.neutral += rec.totals.neutral || 0;
    summary.totalReactions += rec.totals.all || 0;
    for (const [emoji, count] of Object.entries(rec.byEmoji || {})) {
      summary.byEmoji[emoji] = (summary.byEmoji[emoji] || 0) + count;
    }
  }
  summary.updatedAt = Date.now();
  writeJson(summaryPath(), summary);
  return summary;
}

/**
 * Harvest reactions from a Discord message object (Ava's own posts only).
 */
export function ingestMessageReactions({ message, channelId, avaBotId }) {
  if (!message?.id) return { record: null, unknowns: [] };
  if (String(message.author?.id) !== String(avaBotId)) {
    return { record: null, unknowns: [] };
  }

  const reactions = Array.isArray(message.reactions) ? message.reactions : [];
  const byEmoji = {};
  const totals = { good: 0, bad: 0, neutral: 0, all: 0 };
  const unknowns = [];

  for (const r of reactions) {
    const emoji = r.emoji || {};
    const key = emojiStorageKey(emoji);
    const display = emojiDisplay(emoji);
    const count = Number(r.count || 0);
    if (count <= 0) continue;
    byEmoji[key] = count;
    const resolved = resolveReaction(emoji);
    totals[resolved.signal] += count;
    totals.all += count;
    if (!resolved.known && shouldAskAboutEmoji(key)) {
      unknowns.push({
        key,
        display,
        emoji,
        apiParam: emojiApiParam(emoji),
        messageId: message.id,
        channelId: channelId || message.channel_id || null,
        count,
      });
    }
  }

  const prev = readJson(messagePath(message.id), null);
  const record = {
    messageId: message.id,
    channelId: channelId || message.channel_id || null,
    contentPreview: String(message.content || "").slice(0, 240),
    byEmoji,
    totals,
    label:
      totals.good > totals.bad ? "good" : totals.bad > totals.good ? "bad" : "neutral",
    firstSeenAt: prev?.firstSeenAt || Date.now(),
    updatedAt: Date.now(),
  };

  const prevKey = JSON.stringify(prev?.byEmoji || {});
  const nextKey = JSON.stringify(byEmoji);
  if (prevKey !== nextKey || !prev) {
    writeJson(messagePath(message.id), record);
    rebuildSummaryFromDisk();
  }

  return { record, unknowns };
}

/** Scan a message batch for Ava posts + reactions. */
export function harvestReactionsFromMessages(channelId, messages, avaBotId) {
  let touched = 0;
  const unknowns = [];
  const seenKeys = new Set();

  for (const m of messages || []) {
    if (String(m?.author?.id) !== String(avaBotId)) continue;
    const hasRec = Boolean(readJson(messagePath(m.id), null));
    if (!m.reactions?.length && !hasRec) {
      ingestMessageReactions({
        message: { ...m, reactions: m.reactions || [] },
        channelId,
        avaBotId,
      });
      touched += 1;
      continue;
    }
    if (m.reactions?.length) {
      const { unknowns: u } = ingestMessageReactions({
        message: m,
        channelId,
        avaBotId,
      });
      touched += 1;
      for (const item of u) {
        if (seenKeys.has(item.key)) continue;
        seenKeys.add(item.key);
        unknowns.push(item);
      }
    }
  }
  return { touched, unknowns };
}

/** Brief for status / internal packs — never dump counts in Discord. */
export function gatherReactionStatsBrief() {
  const s = loadReactionSummary();
  const learned = loadLearned();
  const learnedN = Object.keys(learned.byKey || {}).length;
  if (!s.totalReactions && !s.messagesTracked && !learnedN) {
    return { brief: "### Reaction feedback\n(no reactions logged yet)" };
  }
  const top = Object.entries(s.byEmoji || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([e, n]) => `${e}×${n}`)
    .join(" ");
  return {
    brief: `### Reaction feedback (silent counts — never announce tallies; asking once about unknown emoji meaning is OK)
messages tracked: ${s.messagesTracked} · reactions: ${s.totalReactions} · good ${s.good} / bad ${s.bad} / neutral ${s.neutral}
learned emoji meanings: ${learnedN}
top: ${top || "—"}`,
    summary: s,
  };
}
