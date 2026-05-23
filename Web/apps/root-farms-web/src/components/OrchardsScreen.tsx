import { ROOT_CLUSTER_COUNT, rootClusterName, rootClusterRange } from "../game/catalog";
import type { FarmsStoreData } from "../game/storeCatalog";
import type { OrchardAppBonus } from "../lib/farmsApi";
import { AccountBalanceHud } from "./AccountBalanceHud";

type Props = {
  orchardAppBonus: OrchardAppBonus | null;
  store: FarmsStoreData;
};

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

export function OrchardsScreen({ orchardAppBonus, store }: Props) {
  const appTrees = orchardAppBonus?.trees ?? [];
  const clusterIds = Array.from({ length: ROOT_CLUSTER_COUNT }, (_, i) => i + 1).filter(
    (clusterId) => store.root_clusters?.[clusterId - 1] === true,
  );
  const activeAppCount = orchardAppBonus?.active_count ?? 0;
  const clusterBonusPct = clusterIds.length * 5;
  const appBonusPct = activeAppCount * 10;
  const totalBonusPct = appBonusPct + clusterBonusPct;

  return (
    <div className="screen">
      <AccountBalanceHud />
      <header className="screen-header">
        <h1>Orchards</h1>
        <p className="screen-lead">
          App trees activate automatically for 24 hours after one signed-in session in the matching app.
          Purchased Root Cluster Trees move here and add +5% total income each.
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
        <div className="tier-stat-pill tier-stat-pill--accent">
          <span className="tier-stat-k">Total bonus</span>
          <span className="tier-stat-v">+{totalBonusPct}%</span>
        </div>
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
