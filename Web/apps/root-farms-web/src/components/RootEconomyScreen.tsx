import { useCallback, useEffect, useState } from "react";
import { formatRu } from "../game/format";
import {
  economyEntryLabel,
  fetchEconomyLeaderboard,
  type EconomyLeaderboard,
} from "../lib/economyApi";

const REFRESH_MS = 30_000;

export function RootEconomyScreen({ variant = "web" }: { variant?: "web" | "mobile" }) {
  const [board, setBoard] = useState<EconomyLeaderboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const data = await fetchEconomyLeaderboard();
    if (!data) {
      setError("Could not load Root Economy — try again shortly.");
      setLoading(false);
      return;
    }
    setBoard(data);
    setError(null);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), REFRESH_MS);
    return () => clearInterval(id);
  }, [load]);

  const updatedLabel =
    board?.updated_at &&
    (() => {
      try {
        return new Date(board.updated_at).toLocaleTimeString(undefined, { timeStyle: "short" });
      } catch {
        return null;
      }
    })();

  return (
    <div className={`screen economy-screen economy-screen--${variant}`}>
      <header className="economy-head">
        <h1>Root Economy</h1>
        <p className="economy-lead">Live Root Units balances for the top 100 accounts on Root Record.</p>
        {updatedLabel ? <p className="economy-updated">Updated {updatedLabel}</p> : null}
      </header>

      {loading && !board ? <p className="economy-status">Loading leaderboard…</p> : null}
      {error ? <p className="economy-status economy-status--err">{error}</p> : null}

      {board && board.entries.length > 0 ? (
        <ol className="economy-list" aria-label="Top accounts by Root Units balance">
          {board.entries.map((e) => {
            const label = economyEntryLabel(e);
            const showWallet = label !== e.wallet_short;
            return (
              <li key={`${e.rank}-${e.wallet_short}`} className="economy-row">
                <span className="economy-rank">{e.rank}</span>
                <span className="economy-holder">
                  <span className="economy-name">{label}</span>
                  {showWallet ? <span className="economy-wallet">{e.wallet_short}</span> : null}
                  {e.public_display_name && e.discord_username ? (
                    <span className="economy-discord">@{e.discord_username.replace(/^@/, "")}</span>
                  ) : null}
                </span>
                <span className="economy-balance">{formatRu(e.balance)}</span>
              </li>
            );
          })}
        </ol>
      ) : null}

      {board && board.entries.length === 0 && !loading ? (
        <p className="economy-status">No balances yet.</p>
      ) : null}

      <p className="economy-foot">
        Set a public display name on{" "}
        <a href="https://rootrecord.info/account.html" target="_blank" rel="noopener noreferrer">
          rootrecord.info/account
        </a>
        . Discord username appears when your account is linked.
      </p>
    </div>
  );
}
