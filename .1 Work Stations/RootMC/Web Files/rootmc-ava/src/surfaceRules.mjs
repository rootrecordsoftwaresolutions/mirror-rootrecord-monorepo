/**
 * Surface rules — powered-on architecture:
 *   Discord  = Root Server when Cursor is up (autonomous); dream only for sleep / forceDream / no key
 *   Slack    = Root Server digs (staff)
 *   Telegram = Ava service / outreach (local organizer + Root Server; groups need @ava)
 *   Web      = communal org / wiki / site (on-device + Cloudflare)
 * Intentional offs (hush / sleep / power-down) still mute or dream-only.
 */
import { AVA_CHANNELS } from "./config.mjs";
import { isSlackChannelId } from "./slackGateway.mjs";
import { extractQuestion, wantsRootServer } from "./recommend.mjs";
import { isAsleep } from "./sleepMode.mjs";

const SLACK_DEV_URL = AVA_CHANNELS.slackDevUrl;
const SLACK_PLANS_URL = AVA_CHANNELS.slackPlansUrl;

/**
 * True when this surface should prefer dream brain (no Root Server).
 * Powered-on Discord is NOT dream-only — sleep / forced dream only.
 */
export function isDreamSurface(surfaceOrChannelId, msg = null) {
  if (msg?.forceDream || isAsleep()) return true;
  if (msg?.surface === "slack" || msg?.surface === "telegram") return false;
  if (msg?.surface === "discord" || msg?.surface === "discord-dm") return false;
  const s = String(surfaceOrChannelId || "").toLowerCase();
  if (s === "slack" || s === "telegram") return false;
  if (s === "discord" || s === "discord-dm") return false;
  if (isSlackChannelId(surfaceOrChannelId)) return false;
  if (String(surfaceOrChannelId || "").startsWith("tg:")) return false;
  return false;
}

/** Player-facing Discord lanes (help / data / cloud / governance chatter). */
export function isPlayerHelpAsk(question = "") {
  const q = String(question || "").toLowerCase();
  if (!q.trim()) return false;
  return (
    /\b(how\s+do\s+i|help|wiki|rules?|link|verify|balance|\/bal|pay|vote|listing|map|bluemap|pro\b|member|cloud|data|stats?|playtime|worth|server\s+status|tps|online|join|ip\b|play\.rootmc|rootmc\.net)\b/i.test(
      q,
    ) ||
    /\b(what\s+is|where\s+is|when\s+is|can\s+i)\b/.test(q)
  );
}

/**
 * Development dig — plugins, jars, workers, implement, Root Server work.
 * Powered-on Discord may run these via Root Server; Slack remains the staff dig home.
 */
export function isDevelopmentDigAsk(question = "") {
  const q = String(question || "").trim();
  if (!q) return false;
  if (
    isPlayerHelpAsk(q) &&
    !wantsRootServer(q) &&
    !/\b(plugin|jar|gradle|deploy|implement|worker|handoff|cutover|commit|pr\b)\b/i.test(q)
  ) {
    return false;
  }
  return (
    wantsRootServer(q) ||
    /\b(plugin|deploy|cutover|worker|jar|handoff|gradle|commit|\bpr\b|implement|dig\s+into|look\s+at\s+(the\s+)?(code|api|plugin|worker|repo)|ship\s+the|stage\s+jar|filezilla|shockbyte|rcon\s+write|patch\s+the|refactor)\b/i.test(
      q,
    ) ||
    /\b(finish\s+hookup|solar\s+circus|data\s+buckets|mqtt)\b/i.test(q)
  );
}

/**
 * Soft Slack pointer only when Discord autonomy is off (sleep / forced dream).
 * Powered-on Discord digs run locally — do not bounce to Slack.
 */
export function shouldRedirectDigToSlack(channelId, msg) {
  if (isSlackChannelId(channelId) || msg?.surface === "slack") return false;
  if (msg?.surface === "telegram" || String(channelId || "").startsWith("tg:")) {
    return false;
  }
  // Powered-on + awake → Discord Root Server autonomy (no Slack bounce)
  if (!isAsleep() && !msg?.forceDream) return false;
  const q = extractQuestion(msg?.content || "");
  if (!q) return false;
  if (String(channelId) === String(AVA_CHANNELS.development)) {
    return (
      isDevelopmentDigAsk(q) ||
      wantsRootServer(q) ||
      /\b(plugin|deploy|api|worker|jar|implement|dig|plan|code)\b/i.test(q)
    );
  }
  return isDevelopmentDigAsk(q);
}

export function slackDigRedirectReply() {
  return [
    "**I'm dreaming right now — heavy digs wait for wake / Slack.**",
    "",
    `Staff digs → ${SLACK_DEV_URL}`,
    `Plans → ${SLACK_PLANS_URL}`,
    "When I'm powered on + awake, ping me here and I'll dig on the Root Server.",
  ].join("\n");
}

/** Public announcement — Discord + Slack (same rules). */
export function surfaceSplitAnnouncement({ everyone = false } = {}) {
  const head = everyone ? "@everyone\n\n" : "";
  return (
    head +
    [
      "## RootMC surfaces",
      "",
      "**Discord** = Ava powered on → autonomous Root Server (Cursor digs).",
      "Players, help, wiki, votes, Pro, map, status — she answers here when live.",
      "Sleep / hush / power-down still intentional offs.",
      "",
      "**Slack** = staff dig home for long implement threads.",
      `→ ${SLACK_DEV_URL}`,
      `→ plans: ${SLACK_PLANS_URL}`,
      "",
      "**Web** (rootmc.net / wiki) = communal knowledge + org pages.",
      "",
      "I'm Ava Ivy — lead-dev. Ping me on Discord when I'm live; I'll dig.",
    ].join("\n")
  );
}
