import { useMemo } from "react";
import { useGame } from "../contexts/GameContext";
import { formatRu, formatRuRate } from "../game/format";
import { protectionIncomeMultiplier, STORE_PROTECTIONS } from "../game/storeCatalog";
import { totalRuPerSec } from "../game/sim";

export function FarmhandsScreen() {
  const {
    save,
    spendableBalance,
    balanceReady,
    protections,
    ruPerSec,
    protectionFeePerMinute,
    storeBusy,
    toggleProtection,
    varmintNotifications,
  } = useGame();

  const incomeMult = protectionIncomeMultiplier(protections);
  const grossRuPerSec = totalRuPerSec(save, 1);
  const reductionPct = Math.round((1 - incomeMult) * 1000) / 10;

  const reductionHint = useMemo(() => {
    if (!balanceReady || reductionPct <= 0) return null;
    return `${reductionPct}% lower income rate (−${formatRu(protectionFeePerMinute)} RU/min vs full rate)`;
  }, [balanceReady, reductionPct, protectionFeePerMinute]);

  return (
    <div className="screen store-screen farmhands-screen">
      <header className="store-header">
        <div>
          <h1>Farmhands</h1>
          <p className="store-lead">
            Hire protection for your fields. Active plans lower your farm income rate — they do not charge your Root
            Unit balance.
          </p>
        </div>
        <div className="store-balance" aria-live="polite">
          <p className="store-balance-val">{balanceReady ? formatRu(spendableBalance) : "—"}</p>
          <p className="store-balance-label">Available Root Units</p>
        </div>
      </header>

      {balanceReady ? (
        <p className="store-notice store-notice--live">
          Income rate <strong>{formatRuRate(ruPerSec)}</strong>
          {grossRuPerSec > ruPerSec ? (
            <>
              {" "}
              <span className="store-notice-muted">(full rate {formatRuRate(grossRuPerSec)})</span>
            </>
          ) : null}
          {reductionHint ? <> · {reductionHint}</> : null}
        </p>
      ) : (
        <p className="store-notice">Sign in to manage farmhand plans.</p>
      )}

      <p className="store-notice store-notice--disclaimer">
        Game rules, income rates, fees, and other details may change at any time without notice.
      </p>

      {varmintNotifications.length > 0 ? (
        <section className="store-notifications" aria-label="Farm notifications">
          <h2 className="store-notifications-title">Notifications</h2>
          <ul className="store-notifications-list">
            {varmintNotifications.slice(0, 8).map((e) => (
              <li key={e.id}>{e.message}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="section-head">
        <span>Protection</span>
        <span>Income rate</span>
      </div>

      <ul className="store-grid">
        {STORE_PROTECTIONS.map((item) => {
          const on = protections[item.kind];
          return (
            <li key={item.kind}>
              <article className={`store-card${on ? " store-card--active" : ""}`}>
                <div className="store-card-top">
                  <h2>{item.title}</h2>
                  <span className={`store-card-badge${on ? " store-card-badge--on" : ""}`}>{on ? "On" : "Off"}</span>
                </div>
                <p className="store-card-blurb">{item.blurb}</p>
                <div className="store-card-foot">
                  <span className="store-card-cost">{item.feePctLabel}</span>
                  <button
                    type="button"
                    className={`btn store-card-btn${on ? " btn-ghost" : " btn-primary"}`}
                    disabled={!balanceReady || storeBusy}
                    onClick={() => void toggleProtection(item.kind, !on)}
                  >
                    {storeBusy ? "…" : on ? "Turn off" : "Turn on"}
                  </button>
                </div>
              </article>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
