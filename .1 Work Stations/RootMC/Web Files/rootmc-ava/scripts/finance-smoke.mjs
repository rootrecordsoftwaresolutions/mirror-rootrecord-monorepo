/**
 * Smoke: Stripe snapshot + finance review (no Discord spam).
 * Usage: node scripts/finance-smoke.mjs [--notify]
 */
import { loadEnv } from "../src/config.mjs";
import { refreshStripeSnapshot, formatStripeIncomePlain } from "../src/stripeFinance.mjs";
import { formatOpsLedgerPlain, loadOpsLedger } from "../src/opsFinanceLedger.mjs";
import { runFinanceReview } from "../src/financeReview.mjs";
import { tryHandleFinanceCommand } from "../src/playerFinance.mjs";

const env = await loadEnv();
const notify = process.argv.includes("--notify");

const snap = await refreshStripeSnapshot(env, { force: true });
console.log("--- Stripe ---");
console.log(formatStripeIncomePlain(snap));
console.log("--- Ops ledger ---");
console.log(formatOpsLedgerPlain(loadOpsLedger()));

const opt = tryHandleFinanceCommand({
  text: "track my finances",
  authorId: "finance-smoke-test",
  authorName: "smoke",
});
console.log("--- opt-in ---", opt?.reply?.slice(0, 120));
tryHandleFinanceCommand({
  text: "add expense rent 1000/mo",
  authorId: "finance-smoke-test",
  authorName: "smoke",
});
const show = tryHandleFinanceCommand({
  text: "my finances",
  authorId: "finance-smoke-test",
  authorName: "smoke",
});
console.log(show?.reply);
tryHandleFinanceCommand({
  text: "stop tracking my finances",
  authorId: "finance-smoke-test",
  authorName: "smoke",
});

const review = await runFinanceReview({ env, force: true, notify });
console.log("--- review ---", {
  sent: review.sent,
  reason: review.reason,
  suggestions: review.suggestions?.length,
});
