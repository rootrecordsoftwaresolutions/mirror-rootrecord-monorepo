/**
 * Roots headline balance from `/api/earn/summary`.
 * Matches Discord `/bal` (full `rr_earn_balance`) — not `custodial_pending_units` alone.
 */
(function (global) {
  function parseRootUnitsBalanceFromSummary(j) {
    if (!j || typeof j !== "object") return NaN;
    const candidates = [
      j.root_units_balance,
      j.ledger_balance,
      j.balance,
      j.root_units,
      j.total_rewards_units,
      j.balance_display,
    ]
      .map(function (v) {
        return Number(v);
      })
      .filter(function (n) {
        return Number.isFinite(n) && n >= 0;
      });
    if (!candidates.length) return NaN;
    return Math.floor(Math.max.apply(null, candidates));
  }

  global.parseRootUnitsBalanceFromSummary = parseRootUnitsBalanceFromSummary;
})(typeof globalThis !== "undefined" ? globalThis : window);
