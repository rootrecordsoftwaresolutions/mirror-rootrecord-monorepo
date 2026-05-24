import { useState } from "react";
import { ROOT_CLUSTER_COUNT, rootClusterName, rootClusterRange } from "../game/catalog";
import { formatRu } from "../game/format";
import type { FarmsStoreData } from "../game/storeCatalog";
import type { MembershipBonus, MembershipBonusTree, OrchardAppBonus } from "../lib/farmsApi";
import { fetchRootsMintStatus, type RootsMintStatus } from "../lib/rootsMintApi";
import { AccountBalanceHud } from "./AccountBalanceHud";

type Props = {
  orchardAppBonus: OrchardAppBonus | null;
  membershipBonus: MembershipBonus | null;
  store: FarmsStoreData;
  rootLevel: number;
};

const ROOTS_MINT_ADDRESS = "8hwxLN1Q4Yr8xFErErULCqNvcF1cMwGjpRXPz6DAH7gM";
const BILLING_URL = "https://rootrecord.info/billing.html";

const APP_TREE_DETAILS: Record<string, { source: string; inactive: string }> = {
  volcano: {
    source: "Kilauea Alerts session",
    inactive: "Open Kilauea Alerts to activate this 24h bonus.",
  },
  business: {
    source: "Business Manager session",
    inactive: "Open Business Manager to activate this 24h bonus.",
  },
  weather: {
    source: "Weather Manager session",
    inactive: "Open Weather Manager to activate this 24h bonus.",
  },
};

function formatExpires(lastOpenAt: string | null): string | null {
  if (!lastOpenAt) return null;
  const lastOpenMs = Date.parse(lastOpenAt);
  if (!Number.isFinite(lastOpenMs) || lastOpenMs <= 0) return null;
  return new Date(lastOpenMs + 24 * 60 * 60 * 1000).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function TreeSprite({ active }: { active: boolean }) {
  return (
    <span className={`plot-tree${active ? " plot-tree--active" : ""}`} aria-hidden>
      <span className="plot-tree-canopy plot-tree-canopy--a" />
      <span className="plot-tree-canopy plot-tree-canopy--b" />
      <span className="plot-tree-canopy plot-tree-canopy--c" />
      <span className="plot-tree-trunk" />
      <span className="plot-tree-soil" />
    </span>
  );
}

function defaultMemberTrees(): MembershipBonusTree[] {
  return [
    {
      key: "monthly_member",
      name: "Monthly Member Tree",
      active: false,
      bonus_pct: 10,
      blurb: "Active monthly members grow a +10% income tree.",
    },
    {
      key: "lifetime_member",
      name: "Lifetime Tree",
      active: false,
      bonus_pct: 25,
      blurb: "Lifetime members grow a permanent +25% income tree.",
    },
  ];
}

export function OrchardsScreen({ orchardAppBonus, membershipBonus, store, rootLevel }: Props) {
  const appTrees = orchardAppBonus?.trees ?? [];
  const memberTrees = membershipBonus?.trees?.length ? membershipBonus.trees : defaultMemberTrees();
  const clusterIds = Array.from({ length: ROOT_CLUSTER_COUNT }, (_, i) => i + 1).filter(
    (clusterId) => store.root_clusters?.[clusterId - 1] === true,
  );
  const activeAppCount = orchardAppBonus?.active_count ?? 0;
  const memberBonusPct = membershipBonus?.bonus_pct ?? 0;
  const clusterBonusPct = clusterIds.length * 5;
  const appBonusPct = activeAppCount * 10;
  const totalBonusPct = appBonusPct + clusterBonusPct + memberBonusPct;
  const [treasuryOpen, setTreasuryOpen] = useState(false);
  const [treasuryStatus, setTreasuryStatus] = useState<RootsMintStatus | null>(null);
  const [treasuryNote, setTreasuryNote] = useState("");
  const [treasuryBusy, setTreasuryBusy] = useState(false);

  const openTreasuryTree = async () => {
    setTreasuryOpen((open) => !open);
    if (treasuryStatus || treasuryBusy) return;
    setTreasuryBusy(true);
    setTreasuryNote("");
    try {
      const status = await fetchRootsMintStatus();
      if (status.ok) {
        setTreasuryStatus(status);
      } else {
        setTreasuryNote(status.detail);
      }
    } finally {
      setTreasuryBusy(false);
    }
  };

  return (
    <div className="screen">
      <AccountBalanceHud />
      <header className="screen-header">
        <h1>Orchards</h1>
        <p className="screen-lead">
          App trees activate automatically for 24 hours after one signed-in session in the matching app.
          Purchased Root Cluster Trees move here, and member-only trees add monthly or lifetime income perks.
        </p>
      </header>

      <div className="tier-stat-strip" aria-label="Orchard totals">
        <div className="tier-stat-pill">
          <span className="tier-stat-k">Active app</span>
          <span className="tier-stat-v">
            {activeAppCount}<small>/{appTrees.length || 3}</small>
          </span>
        </div>
        <div className="tier-stat-pill">
          <span className="tier-stat-k">Cluster trees</span>
          <span className="tier-stat-v">{clusterIds.length}</span>
        </div>
        <div className="tier-stat-pill">
          <span className="tier-stat-k">Member tree</span>
          <span className="tier-stat-v">+{memberBonusPct}%</span>
        </div>
        <div className="tier-stat-pill tier-stat-pill--accent">
          <span className="tier-stat-k">Total bonus</span>
          <span className="tier-stat-v">+{totalBonusPct}%</span>
        </div>
      </div>

      <div className="section-head tier-section-head">
        <span>Treasury Tree</span>
        <span>No income perk · cannot be damaged</span>
      </div>
      <article className="plot-card plot-card--grid accent-green orchard-tree-card orchard-tree-card--treasury">
        <button type="button" className="treasury-tree-button" onClick={() => void openTreasuryTree()} aria-expanded={treasuryOpen}>
          <TreeSprite active />
          <div className="plot-card-top">
            <div className="plot-card-main">
              <span className="plot-name">
                Treasury Tree
                <span className="plot-dot" aria-label="available" />
              </span>
              <span className="plot-sub plot-sub--sci">Custodial wallet gateway</span>
              <span className="plot-sub">Stores and views your internal ROOTS, on-chain ROOTS, and SOL deposit wallet.</span>
            </div>
            <span className="plot-yield">
              0%
              <small>perk</small>
            </span>
          </div>
        </button>
        {treasuryOpen ? (
          <div className="treasury-tree-detail">
            <div className="treasury-wallet-grid">
              <div>
                <span className="treasury-label">Custodial wallet</span>
                <strong className="treasury-address">{treasuryStatus?.custodial_wallet || (treasuryBusy ? "Loading..." : "Unavailable")}</strong>
                <small>Deposit SOL here to perform future on-chain actions.</small>
              </div>
              <div>
                <span className="treasury-label">Internal ROOTS</span>
                <strong>{treasuryStatus ? formatRu(treasuryStatus.internal_balance_atomic) : "..."}</strong>
              </div>
              <div>
                <span className="treasury-label">On-chain ROOTS</span>
                <strong>{treasuryStatus ? formatRu(treasuryStatus.custodial_roots_atomic) : "..."}</strong>
                <small>Mint: {ROOTS_MINT_ADDRESS}</small>
              </div>
              <div>
                <span className="treasury-label">SOL for actions</span>
                <strong>
                  {treasuryStatus
                    ? `${(treasuryStatus.custodial_sol_lamports / 1_000_000_000).toLocaleString(undefined, { maximumFractionDigits: 6 })} SOL`
                    : "..."}
                </strong>
              </div>
            </div>
            <div className={`treasury-mint-card${rootLevel >= 30 ? "" : " treasury-mint-card--locked"}`}>
              <div>
                <h2>Mint card</h2>
                <p>
                  Minting unlocks at farm level 30 and will require a mint license held in this custodial wallet once the
                  Solana license flow is plugged in.
                </p>
              </div>
              <span className="market-lock-badge">{rootLevel >= 30 ? "License required" : `Level ${rootLevel}/30`}</span>
            </div>
            {treasuryNote ? <p className="market-note market-note--warn">{treasuryNote}</p> : null}
          </div>
        ) : null}
      </article>

      <div className="section-head tier-section-head">
        <span>Member-only Trees</span>
        <span>Monthly +10% · Lifetime +25%</span>
      </div>
      <div className="plots-grid orchard-tree-grid">
        {memberTrees.map((tree) => (
          <article
            key={tree.key}
            className={`plot-card plot-card--grid accent-green orchard-tree-card orchard-tree-card--member${tree.active ? "" : " orchard-tree-card--inactive"}`}
          >
            <TreeSprite active={tree.active} />
            <div className="plot-card-top">
              <div className="plot-card-main">
                <span className="plot-name">
                  {tree.name}
                  {tree.active ? <span className="plot-dot" aria-label="active" /> : null}
                </span>
                <span className="plot-sub plot-sub--sci">Member-only orchard perk</span>
                <span className="plot-sub">
                  {tree.active ? "Active membership tree bonus is growing now." : tree.blurb}
                </span>
              </div>
              <span className="plot-yield">
                +{tree.bonus_pct}%
                <small>income</small>
              </span>
            </div>
            {tree.active ? (
              <p className="plot-bonus">Member-only income boost active</p>
            ) : (
              <p className="plot-bonus is-muted">
                Member perk locked. <a href={BILLING_URL}>Become a member</a> to grow this tree.
              </p>
            )}
          </article>
        ))}
      </div>

      <div className="section-head tier-section-head">
        <span>App bonus trees ({appTrees.length})</span>
        <span>{activeAppCount} active</span>
      </div>
      <div className="plots-grid orchard-tree-grid">
        {appTrees.map((tree) => {
          const details = APP_TREE_DETAILS[tree.key] ?? {
            source: "App session",
            inactive: "Open the matching app to activate this 24h bonus.",
          };
          const expires = formatExpires(tree.last_open_at);
          return (
            <article
              key={tree.key || tree.id}
              className={`plot-card plot-card--grid accent-green orchard-tree-card${tree.active ? "" : " orchard-tree-card--inactive"}`}
            >
              <TreeSprite active={tree.active} />
              <div className="plot-card-top">
                <div className="plot-card-main">
                  <span className="plot-name">
                    {tree.name}
                    {tree.active ? <span className="plot-dot" aria-label="active" /> : null}
                  </span>
                  <span className="plot-sub plot-sub--sci">{details.source}</span>
                  <span className="plot-sub">
                    {tree.active
                      ? `Active now${expires ? ` · expires ${expires}` : ""}`
                      : details.inactive}
                  </span>
                </div>
                <span className="plot-yield">
                  +10%
                  <small>income</small>
                </span>
              </div>
              <p className={`plot-bonus${tree.active ? "" : " is-muted"}`}>
                {tree.active ? "24h bonus income rate active" : "No purchase needed"}
              </p>
            </article>
          );
        })}
      </div>

      <div className="section-head tier-section-head">
        <span>Root Cluster Trees ({clusterIds.length})</span>
        <span>+{clusterBonusPct}% income</span>
      </div>
      {clusterIds.length > 0 ? (
        <div className="plots-grid orchard-tree-grid">
          {clusterIds.map((clusterId) => {
            const range = rootClusterRange(clusterId);
            return (
              <article key={clusterId} className="plot-card plot-card--grid plot-card--cluster accent-green orchard-tree-card">
                <TreeSprite active />
                <div className="plot-card-top">
                  <div className="plot-card-main">
                    <span className="plot-name">
                      {rootClusterName(clusterId)}
                      <span className="plot-dot" aria-label="clustered" />
                    </span>
                    <span className="plot-sub plot-sub--sci">
                      Root plots {range.start}-{range.end}
                    </span>
                    <span className="plot-sub">Purchased cluster tree</span>
                  </div>
                  <span className="plot-yield">
                    +5%
                    <small>income</small>
                  </span>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <article className="plot-card orchard-empty-card">
          <span className="orchard-empty-emoji" aria-hidden>🌳</span>
          <div>
            <p className="orchard-empty-title">Plant your first orchard</p>
            <p className="plot-sub">
              Complete a 10-plot root section from the Roots tab, then cluster it to move that Root Cluster Tree here.
            </p>
          </div>
        </article>
      )}
    </div>
  );
}
