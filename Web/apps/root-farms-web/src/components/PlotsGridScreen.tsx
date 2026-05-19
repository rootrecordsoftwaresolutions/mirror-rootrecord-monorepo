import { PLOT_COUNT, getPlotCatalog, plotRuPerCycle, plotUnlockCost } from "../game/catalog";
import { formatRu, formatRuRate } from "../game/format";
import { activePlotStats, canBuyPlotUnlock, totalRuPerHarvest, totalRuPerSec } from "../game/sim";
import type { GameSave, PlotProgress } from "../game/types";
import { useGame, type PurchaseResult } from "../contexts/GameContext";
import { AccountBalanceHud } from "./AccountBalanceHud";

export function PlotsGridScreen({ onOpenPlot }: { onOpenPlot: (plotId: number) => void }) {
  const { save, syncNote, purchasePlotUnlock, purchaseBusy, balanceReady, ruPerSec } = useGame();
  const { activePlots, activeRows } = activePlotStats(save);
  const harvestTotal = totalRuPerHarvest(save);
  const grossRuPerSec = totalRuPerSec(save, 1);

  return (
    <div className="screen plots-screen plots-screen--web">
      <AccountBalanceHud
        variant="web"
        side={
          <>
            <p className="hud-rate">
              +{formatRuRate(ruPerSec)} <span className="hud-rate-note">all plots</span>
            </p>
            {grossRuPerSec > ruPerSec + 0.05 ? (
              <p className="hud-meta hud-meta--dim">Before farmhands: {formatRuRate(grossRuPerSec)}</p>
            ) : null}
            <p className="hud-meta">
              {activePlots} plots · {activeRows} rows · {formatRu(harvestTotal)} combined / harvest
            </p>
            {syncNote ? <p className="hud-sync">{syncNote}</p> : null}
          </>
        }
      />

      <div className="section-head">
        <span>Root varieties ({PLOT_COUNT})</span>
        <span>Tap for growing info & rows</span>
      </div>

      <div className="plots-grid">
        {save.plots.map((plot) =>
          plot.unlocked ? (
            <PlotGridCard key={plot.id} plot={plot} onOpen={() => onOpenPlot(plot.id)} />
          ) : (
            <LockedPlotGridCard
              key={plot.id}
              save={save}
              plotId={plot.id}
              balanceReady={balanceReady}
              purchaseBusy={purchaseBusy}
              onUnlock={purchasePlotUnlock}
              onLearn={() => onOpenPlot(plot.id)}
            />
          ),
        )}
      </div>
    </div>
  );
}

function PlotGridCard({ plot, onOpen }: { plot: PlotProgress; onOpen: () => void }) {
  const cat = getPlotCatalog(plot.id);
  const perHarvest = plotRuPerCycle(cat, plot.rowsActive, plot.rowCount);

  return (
    <button type="button" className={`plot-card plot-card--grid accent-${cat.accent}`} onClick={onOpen}>
      <div className="plot-card-top">
        <div className="plot-card-main">
          <span className="plot-name">
            {cat.name}
            <span className="plot-dot" aria-label="active" />
          </span>
          <span className="plot-sub plot-sub--sci">{cat.scientificName}</span>
          <span className="plot-sub">
            {plot.rowsActive}/{cat.maxRows} rows
          </span>
        </div>
        <span className="plot-yield">
          {formatRu(perHarvest)}
          <small>/ harvest</small>
        </span>
      </div>
      <div className="seg-bar" aria-hidden>
        {Array.from({ length: cat.maxRows }, (_, i) => (
          <span key={i} className={i < plot.rowCount ? "on" : ""} />
        ))}
      </div>
      <div className="plot-cycle" style={{ width: `${Math.min(100, plot.cycleProgress * 100)}%` }} />
    </button>
  );
}

function LockedPlotGridCard({
  save,
  plotId,
  balanceReady,
  purchaseBusy,
  onUnlock,
  onLearn,
}: {
  save: GameSave;
  plotId: number;
  balanceReady: boolean;
  purchaseBusy: boolean;
  onUnlock: (id: number) => Promise<PurchaseResult>;
  onLearn: () => void;
}) {
  const cat = getPlotCatalog(plotId);
  const cost = plotUnlockCost(plotId);
  const eligible = canBuyPlotUnlock(save, plotId);
  const canBuy = eligible && balanceReady && !purchaseBusy;
  const prev = save.plots.find((p) => p.id === plotId - 1);
  const blocked = plotId > 1 && !prev?.unlocked;

  const handleUnlock = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const r = await onUnlock(plotId);
    if (r === "insufficient") window.alert("Not enough Root Units.");
    else if (r === "offline") window.alert("Could not reach the server. Deploy farms API and run D1 migration.");
    else if (r === "unavailable") window.alert("Unlock not available yet.");
  };

  return (
    <div className="plot-card plot-card--grid plot-card-locked">
      <span className="plot-icon" aria-hidden>
        🔒
      </span>
      <div className="plot-card-main">
        <p className="plot-name">{cat.name}</p>
        <p className="plot-sub plot-sub--sci">{cat.scientificName}</p>
        <p className="plot-sub">{blocked ? "Unlock previous plot first" : `Unlock · ${formatRu(cost)}`}</p>
      </div>
      <div className="plot-card-actions">
        <button type="button" className="btn btn-ghost btn-sm" onClick={onLearn}>
          Learn
        </button>
        {!blocked ? (
          <button type="button" className="btn btn-primary btn-sm" disabled={purchaseBusy || !canBuy} onClick={(e) => void handleUnlock(e)}>
            {formatRu(cost)}
          </button>
        ) : null}
      </div>
    </div>
  );
}
