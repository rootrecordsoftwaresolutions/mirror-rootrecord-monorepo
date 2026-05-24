import { useMemo } from "react";
import { useGame } from "../contexts/GameContext";
import { formatRu, formatRuRate } from "../game/format";
import {
  LIGHTNING_ROD_COST,
  protectionIncomeMultiplier,
  STORE_PROTECTIONS,
  vegetablesProtected,
  type ProtectionKind,
  type StoreToggleKind,
} from "../game/storeCatalog";
import { totalRuPerSec } from "../game/sim";

const FIELD_KINDS = new Set<ProtectionKind>(["gopher", "mice", "rabbit", "birds"]);

function storeToggleOn(
  store: ReturnType<typeof useGame>["store"],
  kind: StoreToggleKind,
): boolean {
  if (kind === "gopher" || kind === "mice" || kind === "rabbit" || kind === "birds") return store.protections[kind];
  if (kind === "lightning_meteorologist") return store.lightning_meteorologist;
  return store.cypress_trees;
}

export function FarmhandsScreen() {
  const {
    save,
    spendableBalance,
    balanceReady,
    store,
    farmhandCheckin,
    ruPerSec,
    protectionFeePerMinute,
    storeBusy,
    purchaseBusy,
    toggleStore,
    buyLightningRod,
    handleInsufficientFunds,
    lightningRow,
    varmintNotifications,
  } = useGame();

  const incomeMult = protectionIncomeMultiplier(store);
  const grossRuPerSec = totalRuPerSec(save, 1);
  const reductionPct = Math.round((1 - incomeMult) * 1000) / 10;

  const reductionHint = useMemo(() => {
    if (!balanceReady || reductionPct <= 0) return null;
    return `${reductionPct}% lower income rate (−${formatRu(protectionFeePerMinute)}/min vs full rate)`;
  }, [balanceReady, reductionPct, protectionFeePerMinute]);

  const fieldItems = STORE_PROTECTIONS.filter((i) => FIELD_KINDS.has(i.kind as ProtectionKind));
  const stormItems = STORE_PROTECTIONS.filter((i) => !FIELD_KINDS.has(i.kind as ProtectionKind));

  const onBuyLightningRod = async () => {
    const r = await buyLightningRod();
    if (r === "insufficient") await handleInsufficientFunds();
    else if (r === "offline") window.alert("Could not reach the server. Try again after reconnecting.");
    else if (r === "unavailable") window.alert("Lightning rod is not available.");
  };

  return (
    <div className="screen store-screen farmhands-screen">
      <header className="store-header">
        <div>
          <h1>Farmhands</h1>
          <p className="store-lead">
            Hire protection and storm gear. Active plans lower your farm income rate — they do not charge your Root
            Unit balance except the lightning rod purchase.
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

      {lightningRow != null ? (
        <p className="store-notice">
          Shared lightning row today: <strong>row {lightningRow}</strong> (all Ginger+ farms).
        </p>
      ) : null}

      <p className="store-notice">
        Vegetable protection: <strong>{farmhandCheckin?.active && vegetablesProtected(store) ? "active" : "inactive"}</strong>{" "}
        — requires the lightning rod plus at least one active farmhand.
        {farmhandCheckin?.expires_at ? ` Farmhand check-in expires ${new Date(farmhandCheckin.expires_at).toLocaleString()}.` : " Log in to Root Farms every 48 hours to keep farmhands protecting the farm."}
      </p>

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
        <span>Field hazards</span>
        <span>Income rate</span>
      </div>

      <ul className="store-grid">
        {fieldItems.map((item) => {
          const on = storeToggleOn(store, item.kind);
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
                    onClick={() => void toggleStore(item.kind, !on)}
                  >
                    {storeBusy ? "…" : on ? "Turn off" : "Turn on"}
                  </button>
                </div>
              </article>
            </li>
          );
        })}
      </ul>

      <div className="section-head">
        <span>Storms (Ginger+)</span>
        <span>Income / cost</span>
      </div>

      <ul className="store-grid">
        <li>
          <article className={`store-card${store.lightning_rod_owned ? " store-card--active" : ""}`}>
            <div className="store-card-top">
              <h2>Lightning rod</h2>
              <span className={`store-card-badge${store.lightning_rod_owned ? " store-card-badge--on" : ""}`}>
                {store.lightning_rod_owned ? "Owned" : "—"}
              </span>
            </div>
            <p className="store-card-blurb">
              One-time purchase blocks shared lightning row strikes on your farm.
            </p>
            <div className="store-card-foot">
              <span className="store-card-cost">{formatRu(LIGHTNING_ROD_COST)}</span>
              <button
                type="button"
                className="btn store-card-btn btn-primary"
                disabled={
                  !balanceReady || storeBusy || purchaseBusy || store.lightning_rod_owned
                }
                onClick={() => void onBuyLightningRod()}
              >
                {store.lightning_rod_owned ? "Owned" : purchaseBusy ? "…" : "Buy rod"}
              </button>
            </div>
          </article>
        </li>
        {stormItems.map((item) => {
          const on = storeToggleOn(store, item.kind);
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
                    onClick={() => void toggleStore(item.kind, !on)}
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
