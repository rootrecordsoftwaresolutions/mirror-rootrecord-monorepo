/**
 * Public api.rootmc.net governance client (no API key).
 */

const BASE = String(
  process.env.AVA_API_BASE || process.env.ROOTMC_API_BASE || "https://api.rootmc.net",
).replace(/\/$/, "");

const DAY_MS = 7 * 24 * 60 * 60 * 1000;

async function getJson(path) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Accept: "application/json", "User-Agent": "AvaIvyRootMC/0.5" },
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    return { ok: false, status: res.status, detail: data?.detail || text.slice(0, 200) };
  }
  return data || { ok: false };
}

export async function listOpenPolls() {
  return getJson("/api/governance/polls");
}

export async function getVote(id) {
  return getJson(`/api/governance/votes/${encodeURIComponent(id)}`);
}

export async function getCouncil() {
  return getJson("/api/governance/council");
}

export async function getVotingPower({ discordUserId, uuid } = {}) {
  const q = new URLSearchParams();
  if (discordUserId) q.set("discord_user_id", String(discordUserId));
  if (uuid) q.set("uuid", String(uuid));
  return getJson(`/api/governance/voting-power?${q}`);
}

/**
 * Ava vote gates:
 * - 75% anytime → implement_now
 * - day 7 (closes_at OR opened_at+7d) ≥60% → pass
 * - day 7 <60% → close
 */
export function evaluatePollGate(poll) {
  if (!poll) return { gate: "unknown", note: "no poll" };
  const forPct = Number(poll.weighted_for_pct ?? 0);
  const againstPct = Number(poll.weighted_against_pct ?? 0);
  const closesAt = poll.closes_at ? Date.parse(poll.closes_at) : NaN;
  const openedAt = poll.opened_at
    ? Date.parse(poll.opened_at)
    : poll.created_at
      ? Date.parse(poll.created_at)
      : NaN;
  const day7At = Number.isFinite(closesAt)
    ? closesAt
    : Number.isFinite(openedAt)
      ? openedAt + DAY_MS
      : NaN;
  const open = poll.open !== false && String(poll.status || "") === "open";
  const now = Date.now();

  if (forPct >= 75) {
    return {
      gate: "implement_now",
      note: `≥75% for (${forPct}%) — implement immediately per Ava rules`,
      forPct,
      againstPct,
      open,
    };
  }

  const closedOrDue = !open || (Number.isFinite(day7At) && now >= day7At);
  if (closedOrDue) {
    if (forPct >= 60) {
      return {
        gate: "pass",
        note: `day-7/close ≥60% for (${forPct}%) — pass`,
        forPct,
        againstPct,
        open,
      };
    }
    return {
      gate: "close",
      note: `day-7/close <60% for (${forPct}%) — close (reopenable)`,
      forPct,
      againstPct,
      open,
    };
  }

  return {
    gate: "waiting",
    note: `open — for ${forPct}% / against ${againstPct}% (need 75% anytime or ≥60% at day-7/close)`,
    forPct,
    againstPct,
    open,
  };
}

function extractVoteId(question = "") {
  const m = String(question || "").match(
    /\b(?:vote|poll|proposal)[:\s#]*([A-Za-z0-9_-]{4,})\b/i,
  );
  return m?.[1] || null;
}

/** Pack for Cursor prompts — never invent poll numbers. */
export async function gatherGovernanceBrief({ discordUserId, question } = {}) {
  try {
    const voteId = extractVoteId(question || "");
    const [pollsRes, powerRes, councilRes, voteRes] = await Promise.all([
      listOpenPolls(),
      discordUserId ? getVotingPower({ discordUserId }) : Promise.resolve(null),
      getCouncil(),
      voteId ? getVote(voteId) : Promise.resolve(null),
    ]);
    const lines = ["### Governance (live api.rootmc.net — do not invent numbers)"];
    if (pollsRes?.ok && Array.isArray(pollsRes.polls)) {
      if (!pollsRes.polls.length) lines.push("Open polls: none");
      for (const p of pollsRes.polls.slice(0, 6)) {
        const g = evaluatePollGate(p);
        lines.push(
          `- **${p.id}** ${p.title || ""} · for ${p.weighted_for_pct ?? "?"}% / against ${p.weighted_against_pct ?? "?"}% · gate: ${g.gate}`,
        );
      }
    } else {
      lines.push(`Polls fetch: ${pollsRes?.detail || "unavailable"}`);
    }
    if (voteRes?.ok && voteRes.poll) {
      const g = evaluatePollGate(voteRes.poll);
      lines.push(
        `Asked vote **${voteRes.poll.id}**: for ${voteRes.poll.weighted_for_pct ?? "?"}% · gate ${g.gate} (${g.note})`,
      );
    }
    if (councilRes?.ok) {
      lines.push(
        `Council: eligible≈${councilRes.eligible_count ?? "?"} · synced ${councilRes.synced_at || "?"}`,
      );
      for (const c of (councilRes.council || []).slice(0, 5)) {
        lines.push(
          `  - ${c.minecraft_username || "?"} share ${c.share_percent ?? "?"}%`,
        );
      }
    }
    if (powerRes?.ok) {
      lines.push(
        `Asker voting power: eligible=${powerRes.eligible} share=${powerRes.share_percent ?? "?"}% · ${powerRes.summary || ""}`,
      );
    } else if (discordUserId && powerRes && powerRes.ok === false) {
      lines.push(`Asker voting power: ${powerRes.detail || "not linked / unavailable"}`);
    }
    lines.push(
      "Rules: features need proposal + vote; 75% anytime = implement; day7 ≥60% = pass; bugs verify then fix.",
    );
    return {
      brief: lines.join("\n"),
      polls: pollsRes,
      power: powerRes,
      council: councilRes,
      vote: voteRes,
    };
  } catch (err) {
    return {
      brief: `### Governance\n(unavailable: ${err.message})`,
      polls: null,
      power: null,
    };
  }
}
