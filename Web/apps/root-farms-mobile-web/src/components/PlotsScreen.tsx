import { getPlotCatalog, plotRuPerCycle, plotUnlockCost } from "@core/game/catalog";

import { formatRu, formatRuRate } from "@core/game/format";

import { activePlotStats, canBuyPlotUnlock, totalRuPerHarvest, totalRuPerSec } from "@core/game/sim";

import type { GameSave, PlotProgress } from "@core/game/types";

import { useGame, type PurchaseResult } from "@core/contexts/GameContext";
import { AccountBalanceHud } from "@core/components/AccountBalanceHud";



export function PlotsScreen({ onOpenPlot }: { onOpenPlot: (plotId: number) => void }) {

  const { save, syncNote, purchasePlotUnlock, purchaseBusy, balanceReady, ruPerSec } = useGame();

  const { activePlots, activeRows } = activePlotStats(save);

  const harvestTotal = totalRuPerHarvest(save);
  const grossRuPerSec = totalRuPerSec(save, 1);

  const unlocked = save.plots.filter((p) => p.unlocked);

  const nextLocked = save.plots.find((p) => !p.unlocked);



  return (

    <div className="screen plots-screen">

      <AccountBalanceHud
        variant="mobile"
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

        <span>PLOTS</span>

        <span>{formatRu(harvestTotal)} / harvest total</span>

      </div>

      <p className="plots-hint">65 edible roots to learn and grow — spend Root Units from your account balance.</p>



      <ul className="plot-list">

        {unlocked.map((p) => (

          <PlotCard key={p.id} plot={p} onOpen={() => onOpenPlot(p.id)} />

        ))}

        {nextLocked ? (

          <LockedPlotCard
            save={save}
            plotId={nextLocked.id}
            balanceReady={balanceReady}
            purchaseBusy={purchaseBusy}
            onUnlock={purchasePlotUnlock}
            onLearn={() => onOpenPlot(nextLocked.id)}
          />

        ) : null}

      </ul>

    </div>

  );

}



function PlotCard({ plot, onOpen }: { plot: PlotProgress; onOpen: () => void }) {

  const cat = getPlotCatalog(plot.id);

  const perHarvest = plotRuPerCycle(cat, plot.rowsActive, plot.rowCount);



  return (

    <li>

      <button type="button" className={`plot-card accent-${cat.accent}`} onClick={onOpen}>

        <div className="plot-card-top">

          <div className="plot-card-main">

            <span className="plot-name">

              {cat.name}

              <span className="plot-dot" aria-label="active" />

            </span>

            <span className="plot-sub plot-sub--sci">{cat.scientificName}</span>
            <span className="plot-sub">
              {plot.rowsActive}/{cat.maxRows} rows · tap for info
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

    </li>

  );

}



function LockedPlotCard({

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



  const handleUnlock = async () => {

    const r = await onUnlock(plotId);

    if (r === "insufficient") window.alert("Not enough Root Units.");

    else if (r === "offline") window.alert("Could not reach the server. Deploy farms API and run D1 migration.");

    else if (r === "unavailable") window.alert("Unlock not available yet.");

  };



  return (

    <li>

      <div className="plot-card plot-card-locked">

        <span className="plot-icon" aria-hidden>

          🔒

        </span>

        <div className="plot-card-main">

          <p className="plot-name">{cat.name}</p>
          <p className="plot-sub plot-sub--sci">{cat.scientificName}</p>
          <p className="plot-sub">Unlock · {formatRu(cost)}</p>

        </div>

        <button type="button" className="btn btn-ghost btn-sm" onClick={onLearn}>
          Learn
        </button>
        <button type="button" className="btn btn-primary btn-sm" disabled={purchaseBusy || !canBuy} onClick={() => void handleUnlock()}>
          {formatRu(cost)}
        </button>

      </div>

    </li>

  );

}


