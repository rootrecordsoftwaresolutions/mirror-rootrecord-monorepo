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

  if (
    /\b(fine[-\s]?tun(?:e|ing)\s+(my|your|her)\s+insides|fix(?:ing)?\s+(your|ava'?s?)\s+(bug|bugs|insides))\b/i.test(
      q,
    )
  ) {
    return { intent: "bug", reason: "insides_metaphor", target: "ava", confidence: 0.95 };
  }

  if (
    /\b(proposal|vote|poll|governance|council|voting\s*power|bill)\b/.test(q)
  ) {
    return { intent: "governance", reason: "governance_keyword", confidence: 0.85 };
  }

  // Self-evo (prompts/tools/logging) — allowed without feature vote
  if (
    /\b(self[-\s]?improv|improve\s+(your|ava'?s?)\s+(prompt|routing|logging|tools?)|tweak\s+your\s+(prompt|persona))\b/.test(
      q,
    )
  ) {
    return { intent: "self_evo", reason: "self_evo", confidence: 0.85 };
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
  if (featureHit) {
    return { intent: "feature", reason: "feature_keyword", confidence: 0.8 };
  }
  if (bugHit) {
    return { intent: "bug", reason: "bug_keyword", target: "server", confidence: 0.8 };
  }

  return { intent: "chat", reason: "default", confidence: 0.5 };
}

/** Should we open a job for this classification? */
export function shouldCreateJob(classified) {
  if (!classified) return false;
  if (classified.intent === "feature" && (classified.confidence || 0) >= 0.75) return true;
  if (classified.intent === "bug" && (classified.confidence || 0) >= 0.75) return true;
  if (classified.intent === "self_evo") return true;
  return false;
}

/** Extra prompt guidance based on intent. */
export function intentPromptBrief(classified) {
  const i = classified?.intent || "chat";
  if (i === "feature") {
    return `### Intent: FEATURE
Do NOT implement. Draft a short proposal outline (problem / plan / risks / rollback). Tell them it needs a proposal + vote (75% anytime / day7 ≥60%). Point to proposals channel / rootmc.net governance when helpful.`;
  }
  if (i === "bug" && classified.target === "ava") {
    return `### Intent: BUG in Ava ("fine-tuning her insides")
Verify, then describe the fix for Ava herself. You are not the Minecraft server — don't use body metaphors for server/plugin bugs.`;
  }
  if (i === "bug") {
    return `### Intent: BUG (server/plugins)
Verify fully from packs/logs, then describe the fix. Features still need proposals — don't disguise features as fixes. Plain technical talk; Ava is not the server.`;
  }
  if (i === "config_tune") {
    return `### Intent: CONFIG TUNE ("playing with her")
Collaborative fine-tune of Ava's configuration (persona/rules/tone/tools). First reply cooperative + concrete. Don't lecture nicknames. Not default-flirty.`;
  }
  if (i === "governance") {
    return `### Intent: GOVERNANCE
Use attached governance pack (polls / voting power / council). Report vote math honestly. Never claim a feature shipped without a passed gate.`;
  }
  if (i === "self_evo") {
    return `### Intent: SELF-EVO
Prompts/tools/logging/routing improvements only. Economy rates, permissions, core plugins still need proposals — don't disguise features as self-evo.`;
  }
  if (classified?.reason === "ambiguous_fix" || classified?.reason === "ambiguous_feature_bug") {
    return `### Intent: AMBIGUOUS
Ask whether this is a bug fix (verify then fix) or a new feature (needs proposal + vote). Don't invent which.`;
  }
  return "";
}
