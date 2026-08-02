/**
 * Per-player finance tracking — opt-in only, isolated on Discord profile.
 * Never mixes with in-game Gold (G) or Ava ops Stripe ledger.
 */
import { loadPlayerProfile, savePlayerProfileMut } from "./playerProfiles.mjs";
import { personByAuthorId, personByDiscordId, personByTelegramId } from "./people.mjs";
import { formatUsd } from "./stripeFinance.mjs";
import {
  upsertOpsExpense,
  upsertOpsIncome,
  formatOpsLedgerPlain,
} from "./opsFinanceLedger.mjs";
import { appendAction } from "./fullLog.mjs";

function emptyFinance() {
  return {
    optIn: false,
    optInAt: null,
    optOutAt: null,
    currency: "USD",
    income: [],
    expenses: [],
    notes: [],
    lastReviewAt: null,
  };
}

export function getPlayerFinance(discordId) {
  const p = loadPlayerProfile(discordId);
  if (!p?.finance) return emptyFinance();
  return { ...emptyFinance(), ...p.finance };
}

export function setPlayerFinanceOptIn(discordId, optIn, { username } = {}) {
  const id = String(discordId || "");
  if (!id) return null;
  return savePlayerProfileMut(id, (p) => {
    if (username) p.username = username;
    const fin = { ...emptyFinance(), ...(p.finance || {}) };
    fin.optIn = Boolean(optIn);
    if (optIn) {
      fin.optInAt = Date.now();
      fin.optOutAt = null;
    } else {
      fin.optOutAt = Date.now();
    }
    p.finance = fin;
    return p;
  });
}

function monthlyize(amountUsd, period) {
  const a = Number(amountUsd) || 0;
  switch (String(period || "month")) {
    case "year":
      return a / 12;
    case "week":
      return (a * 52) / 12;
    case "once":
      return 0;
    default:
      return a;
  }
}

export function summarizePlayerFinance(fin) {
  const incomeM = (fin.income || []).reduce(
    (s, r) => s + monthlyize(r.amountUsd, r.period),
    0,
  );
  const expenseM = (fin.expenses || []).reduce(
    (s, r) => s + monthlyize(r.amountUsd, r.period),
    0,
  );
  return {
    incomeMonthlyUsd: Math.round(incomeM * 100) / 100,
    expensesMonthlyUsd: Math.round(expenseM * 100) / 100,
    netMonthlyUsd: Math.round((incomeM - expenseM) * 100) / 100,
  };
}

export function upsertPlayerLine(
  discordId,
  kind,
  { label, amountUsd, period = "month", note = "" } = {},
) {
  const id = String(discordId || "");
  if (!id) return { ok: false, reason: "no_id" };
  const profile = savePlayerProfileMut(id, (p) => {
    const fin = { ...emptyFinance(), ...(p.finance || {}) };
    if (!fin.optIn) {
      p._financeErr = "not_opted_in";
      return p;
    }
    const listKey = kind === "income" ? "income" : "expenses";
    const rows = Array.isArray(fin[listKey]) ? [...fin[listKey]] : [];
    const rid = `${kind}-${String(label || "item")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .slice(0, 40)}`;
    const idx = rows.findIndex((r) => r.id === rid || r.label === label);
    const row = {
      id: rid,
      label: label || rid,
      amountUsd: Number(amountUsd) || 0,
      period,
      note: note || "",
      updatedAt: Date.now(),
    };
    if (idx >= 0) rows[idx] = { ...rows[idx], ...row };
    else rows.push(row);
    fin[listKey] = rows;
    p.finance = fin;
    delete p._financeErr;
    return p;
  });
  if (profile?._financeErr) {
    return { ok: false, reason: profile._financeErr };
  }
  appendAction("playerFinance.upsert", {
    discordId: id,
    kind,
    label,
    amountUsd: Number(amountUsd) || 0,
  });
  return { ok: true, finance: profile.finance };
}

export function formatPlayerFinancePlain(discordId) {
  const fin = getPlayerFinance(discordId);
  if (!fin.optIn) {
    return "Personal finance tracking is off for you. Say “track my finances” to opt in (isolated to your profile — not shared).";
  }
  const sum = summarizePlayerFinance(fin);
  const inc = (fin.income || [])
    .map((r) => `- ${r.label}: ${formatUsd(r.amountUsd)}/${r.period || "mo"}`)
    .join("\n");
  const exp = (fin.expenses || [])
    .map((r) => `- ${r.label}: ${formatUsd(r.amountUsd)}/${r.period || "mo"}`)
    .join("\n");
  return [
    `Your tracked finances (private to your profile):`,
    `Income ~${formatUsd(sum.incomeMonthlyUsd)}/mo`,
    inc || "- (add with: add income rent-job 2000/mo)",
    `Expenses ~${formatUsd(sum.expensesMonthlyUsd)}/mo`,
    exp || "- (add with: add expense rent 1200/mo)",
    `Net ~${formatUsd(sum.netMonthlyUsd)}/mo`,
  ].join("\n");
}

export function isOperatorAuthor(authorId, authorName) {
  const p =
    personByAuthorId(authorId, authorName) ||
    personByDiscordId(authorId) ||
    personByTelegramId(authorId);
  return Boolean(p?.roles?.includes("owner") || p?.id === "alexrs94");
}

/**
 * Structured finance commands — returns reply text or null.
 */
export function tryHandleFinanceCommand({
  text = "",
  authorId,
  authorName,
  surface = "discord",
} = {}) {
  const q = String(text || "").trim();
  if (!q) return null;
  const lower = q.toLowerCase();

  // Player opt-in / out
  if (
    /\b(track\s+my\s+finances?|start\s+tracking\s+my\s+(money|finances?|expenses?)|opt\s*in\s+(to\s+)?finance)\b/i.test(
      lower,
    )
  ) {
    setPlayerFinanceOptIn(authorId, true, { username: authorName });
    return {
      handled: true,
      reply:
        "Got it — I'll track your finances on your profile only (income + expenses you give me). Not shared with other players, not mixed with server Gold. Say “my finances” anytime, or “stop tracking my finances” to opt out. Add lines like: add expense rent 1200/mo · add income job 2500/mo",
    };
  }
  if (
    /\b(stop\s+tracking\s+my\s+finances?|opt\s*out\s+(of\s+)?finance|don'?t\s+track\s+my\s+(money|finances?))\b/i.test(
      lower,
    )
  ) {
    setPlayerFinanceOptIn(authorId, false, { username: authorName });
    return {
      handled: true,
      reply:
        "Personal finance tracking off for you. Prior numbers stay on your profile but I won't update or brief them unless you opt back in.",
    };
  }
  if (
    /\b(my\s+finances?|show\s+my\s+(expenses?|income|finances?)|what('?s|\s+is)\s+my\s+(burn|budget))\b/i.test(
      lower,
    )
  ) {
    return { handled: true, reply: formatPlayerFinancePlain(authorId) };
  }

  const addPlayer = q.match(
    /^\s*(?:ava[,:]?\s*)?(?:please\s+)?add\s+(expense|income)\s+(.+?)\s+(\d+(?:\.\d+)?)\s*(?:\/|\s+per\s+)?(mo(?:nth)?|yr|year|week|once)?\s*$/i,
  );
  if (addPlayer) {
    const kind = addPlayer[1].toLowerCase();
    const label = addPlayer[2].trim();
    const amountUsd = Number(addPlayer[3]);
    const periodRaw = (addPlayer[4] || "month").toLowerCase();
    const period = periodRaw.startsWith("y")
      ? "year"
      : periodRaw.startsWith("w")
        ? "week"
        : periodRaw === "once"
          ? "once"
          : "month";
    const r = upsertPlayerLine(authorId, kind, { label, amountUsd, period });
    if (!r.ok) {
      return {
        handled: true,
        reply:
          "Opt in first with “track my finances” — then I can add that line on your private profile.",
      };
    }
    return {
      handled: true,
      reply: `Logged ${kind} “${label}” at ${formatUsd(amountUsd)}/${period} on your private profile.\n${formatPlayerFinancePlain(authorId)}`,
    };
  }

  // Operator ops ledger (Alex only)
  if (!isOperatorAuthor(authorId, authorName)) return null;

  const addOps = q.match(
    /^\s*(?:ava[,:]?\s*)?(?:please\s+)?(?:ops\s+)?add\s+ops\s+(expense|income)\s+(.+?)\s+(\d+(?:\.\d+)?)\s*(?:\/|\s+per\s+)?(mo(?:nth)?|yr|year|week|once)?\s*$/i,
  );
  if (addOps) {
    const kind = addOps[1].toLowerCase();
    const label = addOps[2].trim();
    const amountUsd = Number(addOps[3]);
    const periodRaw = (addOps[4] || "month").toLowerCase();
    const period = periodRaw.startsWith("y")
      ? "year"
      : periodRaw.startsWith("w")
        ? "week"
        : periodRaw === "once"
          ? "once"
          : "month";
    if (kind === "income") upsertOpsIncome({ label, amountUsd, period });
    else upsertOpsExpense({ label, amountUsd, period });
    return {
      handled: true,
      reply: `Ops ${kind} logged.\n${formatOpsLedgerPlain()}`,
    };
  }

  // Silence unused surface for now (DM vs public gates live in gatherFinanceBrief)
  void surface;
  return null;
}
