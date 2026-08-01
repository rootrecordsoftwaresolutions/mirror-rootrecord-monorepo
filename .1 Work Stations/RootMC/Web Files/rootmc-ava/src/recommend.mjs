import { cursorApiKey, AVA_BOT_APP_ID } from "./config.mjs";
import { cursorRecommend } from "./cursorBrain.mjs";
import { scrubPublicReply } from "./scrub.mjs";
import { gatherSiteContext } from "./siteContext.mjs";
import { gatherLocalContext } from "./localContext.mjs";
import { gatherPeopleContext } from "./people.mjs";
import { gatherCoreSpec } from "./coreSpec.mjs";
import { gatherAppearanceContext } from "./appearance.mjs";
import { gatherGuildContext } from "./guildScout.mjs";
import {
  gatherAskerProfile,
  recordCursorUsage,
  usageSoftGateBrief,
} from "./playerProfiles.mjs";
import { gatherReactionStatsBrief } from "./reactionStore.mjs";
import { classifyIntent, intentPromptBrief } from "./classify.mjs";
import { gatherGovernanceBrief } from "./governanceClient.mjs";
import { gatherJobsBrief } from "./jobQueue.mjs";
import { gatherEcoBrief } from "./ecoflow.mjs";
import { gatherHostMetricsBrief } from "./hostMetrics.mjs";
import { gatherRconBrief } from "./rconGuard.mjs";
import { offlineReply } from "./offlineNotes.mjs";
import { isEmergencyStopped } from "./emergencyStop.mjs";

export { scrubPublicReply } from "./scrub.mjs";
export { stripForbiddenMentions } from "./scrub.mjs";

export function wantsRootServer(question) {
  const q = String(question || "").toLowerCase();
  if (String(process.env.AVA_FORCE_CURSOR || process.env.SEXI_FORCE_CURSOR || "").trim() === "1") {
    return true;
  }
  return (
    /\broot\s*server\b/.test(q) ||
    /\b(implement|code\s+this|build\s+it|ship\s+it|dig\s+into\s+(the\s+)?(repo|code|source))\b/.test(q) ||
    /\b(check|read|scan|look\s+at|verify|find)\s+(the\s+)?(repo|codebase|source|plugins?|logs?|files?)\b/.test(q) ||
    /\b(why\s+(is|did|does)|stack\s*trace|exception|crash|npe)\b/.test(q) ||
    /\b(reserve|treasury|economy|hyperdrive|sync(e|ed)?)\b/.test(q)
  );
}

export function isHushCommand(content) {
  const q = String(content || "")
    .toLowerCase()
    .replace(new RegExp(`<@!?${AVA_BOT_APP_ID}>`, "g"), " ")
    .replace(/<@!?\d+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  // Operator lock (Melee+Alex): only the exact word QUIET mutes Ava.
  // Optional "ava quiet" / "quiet ava" still count. Nothing else.
  return (
    /^quiet[.!?]*$/.test(q) ||
    /^(hey\s+|hi\s+|ok\s+|okay\s+)?ava[,:]?\s+quiet[.!?]*$/.test(q) ||
    /^quiet[,.]?\s+ava[.!?]*$/.test(q)
  );
}

/** Only Alex / Melee may hush via QUIET. */
export function isQuietOperator(authorId) {
  const id = String(authorId || "");
  const melee = String(process.env.AVA_MELEE_DISCORD_ID || "154446475789729792")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const alex = ["1497037418979786823"];
  return alex.includes(id) || melee.includes(id);
}

export function isWakeCommand(content) {
  const q = String(content || "")
    .toLowerCase()
    .replace(new RegExp(`<@!?${AVA_BOT_APP_ID}>`, "g"), " ava ")
    .replace(/<@!?\d+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return (
    (/\b(wake|come\s+back|you'?re\s+active|unmute)\b/.test(q) && /\bava\b/.test(q)) ||
    /^ava[,:]?\s*(wake|come\s+back)\b/.test(q) ||
    /\bwake\s+up\b.*\bava\b|\bava\b.*\bwake\s+up\b/.test(q)
  );
}

export function heuristicRecommend(question) {
  const q = String(question || "").toLowerCase();
  if (isCreepDemand(q)) {
    return scrubPublicReply("Fuck off.");
  }
  return scrubPublicReply(offlineReply());
}

/** Hard shut-down — frisky/creepy/harassment, not mild banter. */
function isCreepDemand(q) {
  const s = String(q || "").toLowerCase();
  return (
    /nudes?|onlyfans|\bdtf\b|hook\s*up|(come|get)\s+over\s+here|be\s+sexy\s+for\s+me|send\s+(pics?|nudes?)|rate\s+my\s+(dick|cock)/i.test(
      s,
    ) ||
    /\b(suck\s+my|sit\s+on\s+my|show\s+me\s+your|send\s+feet|roleplay\s+sex|erp\b)\b/i.test(s) ||
    /\b(slut|whore|rape)\b/i.test(s)
  );
}

/**
 * Cursor-only brain. Wiki + local packs go into the Cursor prompt.
 * Grok / xAI is unplugged — never called here.
 */
export async function recommend({
  question,
  context = "",
  env,
  authorId = "",
  authorName = "",
  intent = null,
  member = false,
  images = [],
}) {
  const q = String(question || "").trim();
  if (!q) {
    return scrubPublicReply(
      "What's up? Wiki, design, logs, proposals — fire away. Give me a sec when you ping; I think before I talk.",
    );
  }

  if (isCreepDemand(q)) {
    return scrubPublicReply("Fuck off.");
  }

  if (!cursorApiKey(env || {})) {
    return heuristicRecommend(q);
  }

  const classified = intent || classifyIntent(q);
  const core = gatherCoreSpec({ maxChars: 32000 });
  const people = gatherPeopleContext({ question: q, authorId, authorName });
  const appearance = gatherAppearanceContext();
  const guild = gatherGuildContext();
  const askerProfile = gatherAskerProfile(authorId);
  const reactions = gatherReactionStatsBrief();
  const jobs = gatherJobsBrief();
  const eco = gatherEcoBrief();
  const hostMetrics = gatherHostMetricsBrief();
  const rcon = gatherRconBrief();
  const usage = usageSoftGateBrief(authorId, { member });
  const intentBrief = intentPromptBrief(classified);

  const wantGov =
    classified.intent === "governance" ||
    /vote|poll|proposal|governance|council/.test(q.toLowerCase());

  const [site, local, gov] = await Promise.all([
    gatherSiteContext(q, { maxPages: 2, maxChars: 3500 }),
    Promise.resolve(gatherLocalContext(`${q}\n${context}`)),
    wantGov
      ? gatherGovernanceBrief({ discordUserId: authorId, question: q })
      : Promise.resolve({ brief: "" }),
  ]);

  const packed = [
    core.brief,
    appearance.brief,
    people.brief,
    guild.brief,
    askerProfile.brief,
    usage.brief,
    reactions.brief,
    jobs.brief,
    eco.brief,
    hostMetrics.brief,
    rcon.brief,
    intentBrief,
    gov.brief,
    isEmergencyStopped()
      ? "### Emergency stop\nACTIVE — do not propose RCON/file writes; conversation OK."
      : "",
    Array.isArray(images) && images.length
      ? `### Vision\n${images.length} image(s) attached to this ask — describe and answer from them.`
      : "",
    context,
    site.brief.slice(0, 3000),
    local.brief.slice(0, 4500),
  ]
    .filter(Boolean)
    .join("\n\n");

  const deep =
    wantsRootServer(q) ||
    (Array.isArray(images) && images.length > 0) ||
    classified.intent === "bug" ||
    classified.intent === "feature" ||
    classified.intent === "self_evo";
  const cursor = await cursorRecommend({
    question: q,
    context: packed,
    env,
    deep,
    images,
  });

  if (cursor.ok && cursor.text) {
    recordCursorUsage(authorId, { memberHint: member });
    let text = cursor.text;
    if (usage.upsell && !member && !/membership/i.test(text)) {
      text = `${text}\n\n_${usage.upsell}_`;
    }
    return text;
  }
  console.warn("Ava cursor:", cursor.reason);
  return heuristicRecommend(q);
}

/** Clear address to Ava — bot mention, reply handled by poller, or Ava / Ava Ivy. */
export function looksLikeAvaTrigger(contentOrMsg, botUserId) {
  if (contentOrMsg && typeof contentOrMsg === "object") {
    const msg = contentOrMsg;
    if (botUserId && Array.isArray(msg.mentions)) {
      if (msg.mentions.some((u) => String(u?.id) === String(botUserId))) return true;
    }
    return looksLikeAvaTrigger(msg.content || "", botUserId);
  }
  const raw = String(contentOrMsg || "").trim();
  if (!raw) return false;
  if (botUserId && (raw.includes(`<@${botUserId}>`) || raw.includes(`<@!${botUserId}>`))) {
    return true;
  }
  if (/^(hey\s+|hi\s+|yo\s+|ok\s+|okay\s+|alright\s+)?ava(\s+ivy)?([,:!?]|\s|$)/i.test(raw)) {
    return true;
  }
  if (/^ava(\s+ivy)?[!?.]*$/i.test(raw)) return true;
  return false;
}

/** @deprecated */
export const looksLikeSexiTrigger = looksLikeAvaTrigger;

export function extractQuestion(content) {
  return String(content || "")
    .replace(/<@!?\d+>/g, "")
    .replace(/^(hey\s+|hi\s+|yo\s+|ok\s+|okay\s+|alright\s+)?ava(\s+ivy)?[,:!]?\s*/i, "")
    .trim();
}
