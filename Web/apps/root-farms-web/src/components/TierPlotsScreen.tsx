import { formatGrowTime, formatRu } from "../game/format";
import type { FarmsPurchaseKind, OrchardAppBonusTree } from "../lib/farmsApi";
import type { TierPlotProgress } from "../game/tier-catalog";

type Props = {
  title: string;
  lead: string;
  plots: TierPlotProgress[];
  locked: boolean;
  lockedMessage: string;
  unlockKind: FarmsPurchaseKind;
  rowKind: FarmsPurchaseKind;
  nameFor: (id: number) => string;
  descriptionFor?: (id: number) => string;
  growSecFor: (id: number) => number;
  harvestFor?: (plot: TierPlotProgress) => number;
  unlockCostFor: (id: number) => number;
  rowCostFor: (id: number, rows: number) => number;
  onPurchase: (kind: FarmsPurchaseKind, id: number) => void;
  purchaseBusy: boolean;
  orchardAppBonus?: OrchardAppBonusTree[];
};

export function TierPlotsScreen({
  title,
  lead,
  plots,
  locked,
  lockedMessage,
  unlockKind,
  rowKind,
  nameFor,
  descriptionFor,
  growSecFor,
  harvestFor,
  unlockCostFor,
  rowCostFor,
  onPurchase,
  purchaseBusy,
  orchardAppBonus,
}: Props) {
  const bonusById = new Map((orchardAppBonus ?? []).map((b) => [b.id, b]));

  if (locked) {
    return (
      <div className="screen">
        <header className="screen-header">
          <h1>{title}</h1>
          <p className="screen-lead">{lockedMessage}</p>
        </header>
      </div>
    );
  }

  return (
    <div className="screen">
      <header className="screen-header">
        <h1>{title}</h1>
        <p className="screen-lead">{lead}</p>
      </header>
      <div className="section-head tier-section-head">
        <span>{title} ({plots.length})</span>
        <span>Tap for rows &amp; grow info</span>
      </div>
      <div className="plots-grid tier-plots-grid">
        {plots.map((p) => {
          const grow = growSecFor(p.id);
          const harvest = harvestFor?.(p) ?? 0;
          const unlockCost = unlockCostFor(p.id);
          const rowCost = p.unlocked ? rowCostFor(p.id, p.rowCount) : 0;
          const appBonus = bonusById.get(p.id);
          return (
            <article
              key={p.id}
              className={`plot-card plot-card--grid accent-green${p.unlocked ? "" : " tier-plot-card-locked"}`}
            >
              <div className="plot-card-top">
                <div className="plot-card-main">
                  <span className="plot-name">
                    {p.unlocked ? nameFor(p.id) : `🔒 ${nameFor(p.id)}`}
                    {p.unlocked ? <span className="plot-dot" aria-label="active" /> : null}
                  </span>
                  {descriptionFor ? <span className="plot-sub plot-sub--sci">{descriptionFor(p.id)}</span> : null}
                  <span className="plot-sub">
                    {p.unlocked
                      ? `${p.rowCount}/10 rows · ${p.rowsActive} growing`
                      : `Unlock · ${formatRu(unlockCost)}`}
                  </span>
                  {p.unlocked ? <span className="plot-sub">{formatGrowTime(grow)} / harvest</span> : null}
                </div>
                <span className="plot-yield">
                  {p.unlocked ? formatRu(harvest) : formatRu(unlockCost)}
                  <small>{p.unlocked ? "/ harvest" : "unlock"}</small>
                </span>
              </div>
              {appBonus ? (
                <p className={`plot-bonus${appBonus.active ? "" : " is-muted"}`}>
                  {appBonus.active
                    ? "+10% total earnings active"
                    : appBonus.used_recently
                      ? "Unlock tree to use recent app bonus"
                      : "Open the matching app to activate +10%"}
                </p>
              ) : null}
              {p.unlocked ? (
                <>
                  <div className="seg-bar tier-seg-bar" aria-hidden>
                    {Array.from({ length: 10 }, (_, i) => (
                      <span key={i} className={i < p.rowCount ? "on" : ""} />
                    ))}
                  </div>
                  <div className="plot-cycle" style={{ width: `${Math.min(100, p.cycleProgress * 100)}%` }} />
                </>
              ) : null}
              <div className="plot-card-actions tier-card-actions">
                {p.unlocked ? (
                  <button
                    type="button"
                    className="btn btn-buy btn-sm tier-row-action"
                    disabled={purchaseBusy || p.rowCount >= 10}
                    onClick={() => onPurchase(rowKind, p.id)}
                  >
                    Add row ({formatRu(rowCost)})
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    disabled={purchaseBusy}
                    onClick={() => onPurchase(unlockKind, p.id)}
                  >
                    Unlock
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
