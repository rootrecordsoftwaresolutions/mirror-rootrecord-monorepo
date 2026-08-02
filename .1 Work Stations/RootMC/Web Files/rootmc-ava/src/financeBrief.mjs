/**
 * Finance ask detection + prompt brief for recommend / persona.
 * Ops Stripe numbers: operator + trusted dig surfaces. Player ledger: asker-only.
 */
import {
  refreshStripeSnapshot,
  loadStripeSnapshot,
  formatStripeIncomePlain,
  stripeConfigured,
  formatUsd,
} from "./stripeFinance.mjs";
import {
  loadOpsLedger,
  summarizeOpsLedger,
  formatOpsLedgerPlain,
} from "./opsFinanceLedger.mjs";
import {
  getPlayerFinance,
  formatPlayerFinancePlain,
  summarizePlayerFinance,
  isOperatorAuthor,
} from "./playerFinance.mjs";

export function looksLikeFinanceAsk(question = "") {
  const q = String(question || "").toLowerCase();
  return (
    /\b(stripe|how\s+much\s+(am\s+i|are\s+we|we('?re)?|she('?s)?|ava('?s)?)\s+(earn|making|income)|income|revenue|burn\s*rate|expenses?|budget|profit|payout|balance\s+sheet|cash\s*flow|financial\s+advisor|finance\s+review)\b/i.test(
      q,
    ) ||
    /\b(my\s+finances?|track\s+my\s+finances?|ops\s+(expense|income|ledger))\b/i.test(
      q,
    )
  );
}

/**
 * @param {{ question?: string, authorId?: string, authorName?: string, env?: object, refresh?: boolean }} opts
 */
export async function gatherFinanceBrief({
  question = "",
  authorId = "",
  authorName = "",
  env = {},
  refresh = false,
} = {}) {
  const ask = looksLikeFinanceAsk(question);
  const operator = isOperatorAuthor(authorId, authorName);
  const playerFin = authorId ? getPlayerFinance(authorId) : null;

  let snap = loadStripeSnapshot();
  if (ask && operator && stripeConfigured(env)) {
    snap = await refreshStripeSnapshot(env, { force: refresh });
  }

  const ledger = loadOpsLedger();
  const opsSum = summarizeOpsLedger(ledger);

  const parts = [
    "### Finance lane (LOCKED rules)",
    "- Player economy stays **Gold (G)** — never mint Gold from Stripe/membership dollars.",
    "- Checkout stays masked https://rootmc.net/pro/ — never paste buy.stripe.com or Stripe secrets.",
    "- Ava may state **how much Pro/Stripe is earning** when Alex (or she) is asked — prefer Telegram/DM/Slack digs; keep public Discord high-level unless Alex asks there.",
    "- Ops expenses + other income live in Ava handoff `data/finance/ops-ledger.json`.",
    "- Player personal finance = **opt-in only**, isolated on their Discord profile (`finance` field). Never share another player's numbers.",
  ];

  if (operator) {
    parts.push(
      "### Ops Stripe (operator)",
      snap?.ok
        ? formatStripeIncomePlain(snap)
        : `Stripe: ${snap?.reason || (stripeConfigured(env) ? "no snapshot yet" : "not configured")}`,
      "### Ops ledger (expenses + other income)",
      formatOpsLedgerPlain(ledger),
      `Routing reminder: ops 35–45% · Ava slice 10–15% of membership dollars (see AVA-FINANCE-ROUTING-v1.md).`,
    );
    if (opsSum.staleIds.length) {
      parts.push(
        `Stale ledger rows needing updated totals: ${opsSum.staleIds.join(", ")}`,
      );
    }
  } else if (ask) {
    parts.push(
      "### Public / player finance ask",
      "Do NOT dump exact Stripe account balances or payout schedules in public player chat unless Alex already opened that dig here.",
      "You may say Pro/membership supports hosting and that Ava tracks ops finances privately with Alex.",
      "If they want personal budgeting help: invite “track my finances” (opt-in, profile-isolated).",
    );
  }

  if (playerFin?.optIn && authorId) {
    const sum = summarizePlayerFinance(playerFin);
    parts.push(
      "### Asker's personal finance (OPT-IN — private — only this speaker)",
      formatPlayerFinancePlain(authorId),
      `Net ≈ ${formatUsd(sum.netMonthlyUsd)}/mo — suggest missing expense categories gently when reviewing (rent, food, utilities, subscriptions) without shaming.`,
    );
  } else if (ask && authorId) {
    parts.push(
      "### Asker finance",
      "Not opted in. If they want tracking: tell them to say “track my finances”.",
    );
  }

  if (ask) {
    parts.push(
      "This ask is finance-shaped — answer with real numbers you have above when allowed; otherwise invite opt-in / point Alex to Telegram for ops detail.",
    );
  }

  return {
    brief: parts.join("\n"),
    ask,
    operator,
    snap,
    opsSum,
  };
}
