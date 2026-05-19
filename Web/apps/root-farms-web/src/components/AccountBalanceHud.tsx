import type { ReactNode } from "react";
import { useGame } from "../contexts/GameContext";
import { formatRu, formatRuRate } from "../game/format";

/** Spendable Root Units — same ledger as account portal / Discord /bal. */
export function AccountBalanceHud({
  variant = "web",
  side,
  className = "",
}: {
  variant?: "web" | "mobile";
  side?: ReactNode;
  className?: string;
}) {
  const {
    spendableBalance,
    pendingHarvest,
    balanceReady,
    syncNote,
    harvestNow,
    harvestBusy,
    harvestCooldownSec,
    ruPerSec,
    guestMode,
  } = useGame();

  const harvestLabel = harvestBusy
    ? "Harvesting…"
    : harvestCooldownSec > 0
      ? `Harvest in ${harvestCooldownSec}s`
      : "Harvest now";

  return (
    <header className={`hud hud--${variant} account-balance-hud ${className}`.trim()}>
      <div>
        <p className="hud-balance">{balanceReady ? formatRu(spendableBalance) : "—"}</p>
        <p className="hud-sub">{guestMode ? "Root Units · guest session (not saved)" : "Root Units · account balance"}</p>
        {(pendingHarvest > 0 || balanceReady) && (
          <div className="hud-harvest-row">
            {pendingHarvest > 0 ? (
              <p className="hud-pending">
                Pending harvest: {formatRu(pendingHarvest)}
                {ruPerSec > 0 ? (
                  <span className="hud-pending-note"> · +{formatRuRate(ruPerSec)} field total</span>
                ) : null}
              </p>
            ) : null}
            {balanceReady ? (
              <button
                type="button"
                className="btn btn-harvest-now"
                disabled={harvestBusy || harvestCooldownSec > 0}
                onClick={() => void harvestNow()}
              >
                {harvestLabel}
              </button>
            ) : null}
          </div>
        )}
        {syncNote && !side ? <p className="hud-sync">{syncNote}</p> : null}
      </div>
      {side ? <div className="hud-side">{side}</div> : null}
    </header>
  );
}
