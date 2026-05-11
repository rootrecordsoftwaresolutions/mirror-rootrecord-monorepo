/** Same balance parsing/display as Weather Manager (`/earn/summary` → `balance`). */
export function parseRewardBalance(raw) {
  if (raw === null || raw === undefined) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/**
 * Headline beta-tester total from `/earn/summary`: after treasury→custodial, `balance` is still
 * lifetime ledger credits; `balance_display` (or custodial sum) is pending + RootRecord Wallet RRTT.
 */
export function parseDisplayBalanceFromSummary(data) {
  if (!data || typeof data !== "object") return null;
  const direct = Number(data.balance_display);
  if (Number.isFinite(direct) && direct >= 0) return Math.max(0, Math.floor(direct));
  const sum = Number(data.custodial_sum_ledger_and_wallet_units);
  const sent = Number(data.custodial_units_sent);
  const pend = Number(data.custodial_pending_units);
  const bal = Number(data.balance);
  if (
    Number.isFinite(sum) &&
    (sent > 0 || (Number.isFinite(pend) && Number.isFinite(bal) && pend < bal) || Boolean(data.custodial_balances_rpc_ok))
  ) {
    return Math.max(0, Math.floor(sum));
  }
  return parseRewardBalance(data.balance);
}

/** null = unknown / not loaded; 0+ shown as integer string (zero shows "0"). */
export function formatRewardBalance(n) {
  if (n === null) return "—";
  return Math.max(0, Math.floor(n)).toLocaleString();
}

export const SOLANA_TOOLS_ACCOUNT_URL = "https://solana.rootrecord.info/account";

/**
 * Pending = ledger credits not yet mirrored to RootRecord Wallet; wallet = RRTT on custodial (withdrawable);
 * lifetime = program ledger total (`balance`). When `custodial_summary_attached` is false, pending/wallet are null.
 */
export function parseRewardBreakdownFromSummary(data) {
  if (!data || typeof data !== "object") {
    return { pending: null, wallet: null, lifetime: null, summaryAttached: false };
  }
  const lifetime = parseRewardBalance(data.balance);
  const attached = Boolean(data.custodial_summary_attached);
  if (!attached) {
    return { pending: null, wallet: null, lifetime, summaryAttached: false };
  }
  const pending = Number.isFinite(Number(data.custodial_pending_units))
    ? Math.max(0, Math.floor(Number(data.custodial_pending_units)))
    : null;
  const wallet = Number.isFinite(Number(data.custodial_available_withdraw_units))
    ? Math.max(0, Math.floor(Number(data.custodial_available_withdraw_units)))
    : null;
  return { pending, wallet, lifetime, summaryAttached: true };
}
