/**
 * Ava ops finance ledger — other income sources + expenses (manual + suggested).
 * Isolated from player Gold (G). Real-money tracking only.
 */
import fs from "node:fs";
import path from "node:path";
import { financeDir, formatUsd } from "./stripeFinance.mjs";
import { appendAction } from "./fullLog.mjs";

function ledgerPath() {
  return path.join(financeDir(), "ops-ledger.json");
}

const DEFAULT_LEDGER = {
  updatedAt: null,
  currency: "USD",
  otherIncome: [
    // { id, label, amountUsd, period: "month"|"year"|"once", updatedAt, note }
  ],
  expenses: [
    // { id, label, amountUsd, period, category, updatedAt, note }
  ],
  lastSuggestionAt: null,
  lastSuggestions: [],
};

export function loadOpsLedger() {
  try {
    if (!fs.existsSync(ledgerPath())) {
      const seed = {
        ...DEFAULT_LEDGER,
        updatedAt: Date.now(),
        expenses: [
          {
            id: "exp-shockbyte",
            label: "Shockbyte hosting (Claims+Towny)",
            amountUsd: 0,
            period: "month",
            category: "ops",
            updatedAt: null,
            note: "Set real monthly total when known",
          },
          {
            id: "exp-domains",
            label: "Domains (rootmc.net + related)",
            amountUsd: 0,
            period: "year",
            category: "ops",
            updatedAt: null,
            note: "Annual — convert to monthly when reviewing",
          },
          {
            id: "exp-cloudflare",
            label: "Cloudflare / Workers / Pages",
            amountUsd: 0,
            period: "month",
            category: "dev",
            updatedAt: null,
            note: "Include paid add-ons if any",
          },
        ],
        otherIncome: [
          {
            id: "inc-other",
            label: "Other (ads, sponsors, one-offs)",
            amountUsd: 0,
            period: "month",
            updatedAt: null,
            note: "Non-Stripe income — update when known",
          },
        ],
      };
      saveOpsLedger(seed);
      return seed;
    }
    return JSON.parse(fs.readFileSync(ledgerPath(), "utf8"));
  } catch {
    return { ...DEFAULT_LEDGER, otherIncome: [], expenses: [] };
  }
}

export function saveOpsLedger(ledger) {
  const next = { ...ledger, updatedAt: Date.now() };
  fs.writeFileSync(ledgerPath(), JSON.stringify(next, null, 2), "utf8");
  return next;
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

export function summarizeOpsLedger(ledger = loadOpsLedger()) {
  const incomeM = (ledger.otherIncome || []).reduce(
    (s, r) => s + monthlyize(r.amountUsd, r.period),
    0,
  );
  const expenseM = (ledger.expenses || []).reduce(
    (s, r) => s + monthlyize(r.amountUsd, r.period),
    0,
  );
  const stale = [];
  const staleMs = 45 * 86400 * 1000;
  for (const row of [...(ledger.otherIncome || []), ...(ledger.expenses || [])]) {
    if (!row.updatedAt || Date.now() - row.updatedAt > staleMs) {
      stale.push(row.id || row.label);
    }
  }
  return {
    otherIncomeMonthlyUsd: Math.round(incomeM * 100) / 100,
    expensesMonthlyUsd: Math.round(expenseM * 100) / 100,
    netOtherMonthlyUsd: Math.round((incomeM - expenseM) * 100) / 100,
    staleIds: stale,
    expenseCount: (ledger.expenses || []).length,
    incomeCount: (ledger.otherIncome || []).length,
  };
}

export function upsertOpsExpense({
  id,
  label,
  amountUsd,
  period = "month",
  category = "ops",
  note = "",
} = {}) {
  const ledger = loadOpsLedger();
  const rid =
    id ||
    `exp-${String(label || "item")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .slice(0, 40)}`;
  const rows = Array.isArray(ledger.expenses) ? [...ledger.expenses] : [];
  const idx = rows.findIndex((r) => r.id === rid);
  const row = {
    id: rid,
    label: label || rid,
    amountUsd: Number(amountUsd) || 0,
    period,
    category,
    note: note || "",
    updatedAt: Date.now(),
  };
  if (idx >= 0) rows[idx] = { ...rows[idx], ...row };
  else rows.push(row);
  ledger.expenses = rows;
  saveOpsLedger(ledger);
  appendAction("opsFinance.expenseUpsert", { id: rid, amountUsd: row.amountUsd });
  return row;
}

export function upsertOpsIncome({
  id,
  label,
  amountUsd,
  period = "month",
  note = "",
} = {}) {
  const ledger = loadOpsLedger();
  const rid =
    id ||
    `inc-${String(label || "item")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .slice(0, 40)}`;
  const rows = Array.isArray(ledger.otherIncome) ? [...ledger.otherIncome] : [];
  const idx = rows.findIndex((r) => r.id === rid);
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
  ledger.otherIncome = rows;
  saveOpsLedger(ledger);
  appendAction("opsFinance.incomeUpsert", { id: rid, amountUsd: row.amountUsd });
  return row;
}

export function formatOpsLedgerPlain(ledger = loadOpsLedger()) {
  const sum = summarizeOpsLedger(ledger);
  const expLines = (ledger.expenses || [])
    .slice(0, 12)
    .map(
      (e) =>
        `- ${e.label}: ${formatUsd(e.amountUsd)}/${e.period || "mo"} [${e.category || "?"}]`,
    )
    .join("\n");
  const incLines = (ledger.otherIncome || [])
    .slice(0, 8)
    .map((e) => `- ${e.label}: ${formatUsd(e.amountUsd)}/${e.period || "mo"}`)
    .join("\n");
  return [
    `Ops expenses (~monthly): ${formatUsd(sum.expensesMonthlyUsd)}`,
    expLines || "- (none yet)",
    `Other income (~monthly): ${formatUsd(sum.otherIncomeMonthlyUsd)}`,
    incLines || "- (none yet)",
    sum.staleIds.length
      ? `Stale / never updated: ${sum.staleIds.slice(0, 8).join(", ")}`
      : "All ledger rows recently touched.",
  ].join("\n");
}
