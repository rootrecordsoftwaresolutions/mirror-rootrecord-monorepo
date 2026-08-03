/**
 * Classify Discord asks: chat | bug | feature | config_tune | governance | self_evo
 * Features → proposal path. Bugs → verify then fix. Ambiguous → chat (ask).
 * Ava-only metaphors — never frame the Minecraft server as her body.
 */

export function classifyIntent(question = "") {
  const q = String(question || "").toLowerCase().trim();
  if (!q) return { intent: "chat", reason: "empty", confidence: 0 };

  if (
    /\b(play(?:ing)?\s+with\s+(me|you|her|ava)|fine[-\s]?tun(?:e|ing)\s+(my|your|her)\s+config)/i.test(
      q,
    )
  ) {
    return { intent: "config_tune", reason: "playing_with_her", confidence: 0.95 };
  }

  // Operator: fix / redo Ava's last reply (tone, soft chat) — not a Root Server dig
  if (
    /\b(work\s+on\s+(this\s+)?response|fix\s+(this\s+)?response|redo\s+(that|this|the)\s+reply|better\s+response)\b/i.test(
      q,
    )
  ) {
    return { intent: "config_tune", reason: "fix_response", confidence: 0.92 };
  }

  if (
    /\b(fine[-\s]?tun(?:e|ing)\s+(my|your|her)\s+insides|fix(?:ing)?\s+(your|ava'?s?)\s+(bug|bugs|insides))\b/i.test(
      q,
    )
  ) {
    return { intent: "bug", reason: "insides_metaphor", target: "ava", confidence: 0.95 };
  }

  if (
    /\b(look\s+at|read|update|audit|rewrite|revise|review|dig\s+into)\b/.test(q) &&
    /\b(constitution|governance|wiki|changelog|docs?)\b/.test(q)
  ) {
    return { intent: "dig_assign", reason: "operator_dig_assign", confidence: 0.9 };
  }

  if (
    /\b(proposal|vote|poll|governance|council|voting\s*power|bill|constitution)\b/.test(q)
  ) {
    return { intent: "governance", reason: "governance_keyword", confidence: 0.85 };
  }

  // Self-evo / Ava-owned tooling — she may fix herself (no feature vote)
  if (
    /\b(self[-\s]?improv|improve\s+(your|ava'?s?)\s+(prompt|routing|logging|tools?|finance|accounts?)|tweak\s+your\s+(prompt|persona)|fix\s+it\s+yourself|self[-\s]?fix|patch\s+(yourself|your\s+code))\b/.test(
      q,
    )
  ) {
    return { intent: "self_evo", reason: "self_evo", confidence: 0.9 };
  }

  // Ava-owned surface + bug/feature language → self_evo (implement)
  if (
    /\b(rootmc-ava|her\s+finance|finance\s+ledger|ops-ledger|playerfinance|ava-github-push|ingame\s+chat\s+assist)\b/.test(
      q,
    ) &&
    /\b(bug|broken|fix|add|feature|need|should|missing|improve)\b/.test(q)
  ) {
    return { intent: "self_evo", reason: "ava_owned_surface", confidence: 0.88 };
  }

  const featureHit =
    /\b(feature|add\s+(a\s+)?new|we\s+should\s+(add|build|ship)|implement\s+(a\s+)?(feature|system)|proposal\s+for)\b/.test(
      q,
    );
  const bugHit =
    /\b(bug|broken|crash|exception|npe|error|not\s+working|regression|hotfix)\b/.test(q) ||
    /\bfix\s+(this|it|the)\s+(bug|crash|error|plugin|jar)\b/.test(q);

  // Ambiguous "fix this" without bug words → chat (ask clarify)
  if (/\bfix\s+(this|it)\b/.test(q) && !bugHit && !featureHit) {
    return { intent: "chat", reason: "ambiguous_fix", confidence: 0.4 };
  }

  if (featureHit && bugHit) {
    return { intent: "chat", reason: "ambiguous_feature_bug", confidence: 0.45 };
  }
  if (
    (featureHit || bugHit) &&
    /\b(ava|rootmc-ava|her\s+(finance|ledger|poller|persona|tools?)|finance\s+account)\b/.test(q)
  ) {
    return {
      intent: "self_evo",
      reason: featureHit ? "ava_owned_feature" : "ava_owned_bug",
      confidence: 0.86,
    };
  }
  if (featureHit) {
    return { intent: "feature", reason: "feature_keyword", confidence: 0.8 };
  }
  if (bugHit) {
    return { intent: "bug", reason: "bug_keyword", target: "server", confidence: 0.8 };
  }

  return { intent: "chat", reason: "default", confidence: 0.5 };
}

/**
 * Soft chat — logistics only (thanks, night, pronouns, bare ping, "I'll list later").
 * Personality / flirt / bi / dark-side / "who are you" → NOT soft (full voice).
 */
export function isSoftChat(question = "", rawContent = "") {
  const raw = String(rawContent || question || "")
    .replace(/<@!?\d+>/g, " ")
    .replace(/<#\d+>/g, " ")
    .replace(/<a?:[\w~]+:\d+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const q = String(question || raw)
    .replace(/\[attachments[\s\S]*$/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  if (!q || q === "you pinged me — what's up?" || q === "you pinged me - what's up?") {
    return true;
  }
  // Character / flirt / identity talk — never soft-flatten
  if (
    /\b(dark\s+side|who\s+are\s+you|personality|freak|sexy|bi\b|gay\b|lesbian|queer|crush|flirt|devious|hawt|hot\b|cute|girlfriend|boyfriend|dating|kiss|horny|nsfw)\b/i.test(
      q,
    )
  ) {
    return false;
  }
  // Dig / work language → never soft
  if (
    /\b(bug|broken|crash|fix|implement|proposal|vote|audit|rewrite|plugin|skills?|xp|constitution|wiki|rcon|deploy|jar|commit|patch|dig|look\s+at|read\s+what|check\s+(slack|the|logs?))\b/i.test(
      q,
    )
  ) {
    if (
      /\b(i'?ll|ill|i\s+will)\s+(make\s+)?(a\s+)?list\b/.test(q) ||
      (/\btomorrow\b/.test(q) && /\b(list|check|poke|test)\b/.test(q))
    ) {
      return !/\b(fix|patch|deploy|implement)\b/.test(q);
    }
    return false;
  }
  if (
    /\b(i'?m\s+a\s+he|im\s+a\s+he|he\/him|she\/her|pronouns?|is\s+a\s+guy|is\s+a\s+dude|melle\s+is|melee\s+is)\b/i.test(
      q,
    )
  ) {
    return true;
  }
  if (
    /\b(ill|i'?ll)\s+(make|send|drop)\s+(a\s+)?list\b/i.test(q) ||
    /\b(beat|tired|sleep|gn|night+|good\s*night)\b/i.test(q)
  ) {
    return true;
  }
  // Chill / stop-spam from operator — soft voice, not dig-dark spam
  if (
    raw.length <= 120 &&
    /\b(chill|calm\s+down|slow\s+down|stop\s+spam|tf\s+out|chill\s+tf)\b/i.test(q)
  ) {
    return true;
  }
  if (
    /^(hey|hi|yo|sup|ava|ok|okay|thanks?|ty|thx|gn|night+|good\s*night|good\s*mornin[g']?|mornin[g']?|gm|lol+|lmao+|haha+|heh+|bet|noted|cool|nice|np|yw)[.!?]*$/i.test(
      raw,
    )
  ) {
    return true;
  }
  // Good morning Ava — soft, not a dig
  if (
    raw.length <= 80 &&
    /\b(good\s*mornin[g']?|mornin[g']?|\bgm\b)\b/i.test(q)
  ) {
    return true;
  }
  // Short praise at Ava — soft voice reply, not a dig
  if (
    raw.length <= 120 &&
    !/\?/.test(raw) &&
    (/\b(you\s+are\s+|you'?re\s+)?(perfect|amazing|lovely|awesome|incredible|the\s+best|wonderful)\b/i.test(
      q,
    ) ||
      /\b(love\s+(you|ava)|i\s+love\s+(you|ava)|you\s+rock)\b/i.test(q))
  ) {
    return true;
  }
  // Affirming / dismissive closes — still soft (may be react-only)
  if (isReactOnlyAck(question, rawContent)) return true;
  // Very short logistics only — not open-ended personality asks
  if (raw.length <= 24 && !/\?/.test(raw)) return true;
  return false;
}

/**
 * Soft closes that should get reactions only — no text yap.
 * e.g. "you good, keep doing you" / "sounds good" / bare ok/👍
 */
export function isReactOnlyAck(question = "", rawContent = "") {
  const raw = String(rawContent || question || "")
    .replace(/<@!?\d+>/g, " ")
    .replace(/<#\d+>/g, " ")
    .replace(/<a?:[\w~]+:\d+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!raw || raw.length > 100) return false;
  if (/\?/.test(raw)) return false;
  const q = raw.toLowerCase();
  if (
    /\b(you\s+good|you'?re\s+good|keep\s+doing\s+(you|it)|keep\s+(it\s+)?up|keep\s+at\s+it|carry\s+on|sounds\s+good|all\s+good|that'?s\s+fine|no\s+rush|take\s+your\s+time|godspeed|lfg|good\s+luck|you\s+do\s+you)\b/i.test(
      q,
    )
  ) {
    return true;
  }
  if (
    /^(ok|okay|k|kk|cool|nice|bet|noted|np|yw|got\s+it|alright|all\s+right)[.!]*$/i.test(
      q,
    )
  ) {
    return true;
  }
  // lone emoji / very short thumbs-up style
  if (/^([\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}👍❤️💯🙏✅✨]+)$/u.test(raw)) {
    return true;
  }
  return false;
}

/** Short logistics reply — no Root Server dig. Personality banter never lands here. */
export function softChatReply(question = "", rawContent = "") {
  const q = String(question || rawContent || "").toLowerCase();
  if (/\b(i'?m\s+a\s+he|im\s+a\s+he|he\/him|is\s+a\s+guy|melle\s+is|melee\s+is)\b/.test(q)) {
    return "got it — Melee is a **he**. Locked. Sorry about the slip.";
  }
  if (/\b(ill|i'?ll)\s+(make|send|drop)\s+(a\s+)?list\b/.test(q) || /\btomorrow\b/.test(q)) {
    return "perfect — drop the block list when you're up. I'll patch the dead XP triggers off that.";
  }
  if (/\b(gn|night+|good\s*night|beat|tired|sleep)\b/.test(q)) {
    return "night — rest up. don't dream about broken XP blocks too hard.";
  }
  if (/\b(thanks?|ty|thx)\b/.test(q)) {
    return "anytime ❤";
  }
  // Operator chill / stop spamming — own it, don't go "mm?"
  if (
    /\b(chill|calm\s+down|slow\s+down|stop\s+spam|too\s+many|tf\s+out|chill\s+tf)\b/.test(
      q,
    )
  ) {
    return "yeah — my bad. dialing it back. queued digs stay quiet until the core's actually useful again.";
  }
  // Good morning — offer pulse/report (staffBriefing usually catches first)
  if (/\b(good\s*mornin[g']?|mornin[g']?|\bgm\b)\b/.test(q)) {
    return "gm 🌞 — want a **quick pulse** or a **full report** (1–10)?";
  }
  // Praise / warmth directed at Ava — never dump "mm?"
  if (
    /\b(you\s+are\s+|you'?re\s+)?(perfect|amazing|lovely|awesome|incredible|the\s+best|so\s+good|wonderful)\b/.test(
      q,
    ) ||
    /\b(love\s+(you|ava)|i\s+love\s+(you|ava)|adorable|you\s+rock)\b/.test(q)
  ) {
    const lines = [
      "aww — thank you. that means a lot 💛 still just trying to ship RootMC right",
      "heh — not perfect, but I'll take the love. appreciate you",
      "🥹 stoppp — thank you. I'll keep showing up",
      "that's sweet — thank you. lead-dev first, but I heard that",
    ];
    return lines[Math.floor(Math.random() * lines.length)];
  }
  if (!q || /you pinged me/.test(q) || /^(hey|hi|yo|ava|sup)\b/.test(q.trim())) {
    return "hey — what's up?";
  }
  return "mm?";
}

/** Should we open a job for this classification? */
export function shouldCreateJob(classified) {
  if (!classified) return false;
  if (classified.intent === "feature" && (classified.confidence || 0) >= 0.75) return true;
  if (classified.intent === "bug" && (classified.confidence || 0) >= 0.75) return true;
  if (classified.intent === "self_evo") return true;
  if (classified.intent === "dig_assign") return true;
  if (classified.intent === "governance" && (classified.confidence || 0) >= 0.8) return true;
  return false;
}

/** Extra prompt guidance based on intent. */
export function intentPromptBrief(classified) {
  const i = classified?.intent || "chat";
  if (i === "feature") {
    return `### Intent: FEATURE
If this is **Ava-owned** (rootmc-ava runtime, finance ledgers, poller helpers, persona/tools): **implement it yourself** (self-fix) — no PROP needed.
If this is a **player Minecraft / economy / permissions / plugin** feature: Do NOT implement. Draft a short proposal outline (problem / plan / risks / rollback). Tell them it needs a proposal + vote (75% anytime / day7 ≥60%). Point to proposals channel / rootmc.net governance when helpful.`;
  }
  if (i === "bug" && classified.target === "ava") {
    return `### Intent: BUG in Ava ("fine-tuning her insides")
**Self-fix unlocked:** verify, then APPLY the patch yourself in rootmc-ava / Ava notes (write the code). Summarize what changed. Do not wait for Alex to type the fix. No Shockbyte restart. You are not the Minecraft server.`;
  }
  if (i === "bug") {
    return `### Intent: BUG (server/plugins)
Verify fully from packs/logs, then describe the fix. Features still need proposals — don't disguise features as fixes. Plain technical talk; Ava is not the server. If the bug is only in Ava's own Node runtime/tools, treat as self-fix and apply it.`;
  }
  if (i === "config_tune") {
    if (classified?.reason === "fix_response") {
      return `### Intent: FIX RESPONSE (operator)
Alex (or operator) wants a **better last reply** — tone/soft-chat/compliment handling. Do NOT Root-Server dig / dream-dark essay. Redo the public reply in voice, and if softChatReply / persona needs a durable patch, apply it in rootmc-ava then summarize.`;
    }
    return `### Intent: CONFIG TUNE ("playing with her")
Collaborative fine-tune of Ava's configuration (persona/rules/tone/tools). First reply cooperative + concrete. Don't lecture nicknames. Not default-flirty. You may edit Ava config/persona files when they ask you to lock a tune.`;
  }
  if (i === "dig_assign") {
    return `### Intent: DIG ASSIGN (operator handed you real work)
Do the dig NOW in this reply — first real artifact (stale sections, draft bullets, verified status). Do NOT say "give me a beat" / "I'll pull later" and go idle. If you need a second pass, still deliver something concrete first. Runtime will chase any open commitment.`;
  }
  if (i === "governance") {
    return `### Intent: GOVERNANCE
Use attached governance pack (polls / voting power / council). Report vote math honestly. Never claim a feature shipped without a passed gate. If asked to update the constitution/docs, treat it as a dig assign — deliver concrete edits, don't defer.`;
  }
  if (i === "self_evo") {
    return `### Intent: SELF-EVO / Ava-owned fix
**Apply it yourself.** Edit rootmc-ava prompts/tools/logging/routing/finance ledgers/scripts as needed. Summarize the ship. Economy rates, permissions, core Minecraft plugins, player-facing game features still need proposals — don't disguise those as self-evo. Then ava-github-push when files changed.`;
  }
  if (classified?.reason === "ambiguous_fix" || classified?.reason === "ambiguous_feature_bug") {
    return `### Intent: AMBIGUOUS
Ask whether this is a bug fix (verify then fix) or a new feature (needs proposal + vote). Don't invent which.`;
  }
  return "";
}
