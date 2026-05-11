import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Gift, ExternalLink, RefreshCw, ChevronLeft } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { earnGetSummary, earnCheckin, RR_APP_ID, formatRrApiError } from "../../lib/rrApi";
import {
  formatRewardBalance,
  parseDisplayBalanceFromSummary,
  parseRewardBreakdownFromSummary,
  SOLANA_TOOLS_ACCOUNT_URL,
} from "../../lib/rewardsFormat";

const BETA_REWARDS_INFO_URL =
  String(process.env.REACT_APP_BETA_REWARDS_INFO_URL || "https://rootrecord.info/beta-tester-rewards.html").trim() ||
  "https://rootrecord.info/beta-tester-rewards.html";
const BETA_REWARDS_PROGRAM_DETAILS_URL = `${BETA_REWARDS_INFO_URL.replace(/#.*$/, "")}#program-details`;

function DetailRow({ label, value }) {
  return (
    <div className="flex items-start justify-between gap-3 px-4 py-2.5 border-b border-white/5 last:border-0 text-sm">
      <span className="text-ink-tertiary shrink-0">{label}</span>
      <span className="text-ink-primary font-mono text-right break-all min-w-0">{value}</span>
    </div>
  );
}

export default function TestingRewards() {
  const nav = useNavigate();
  const { user } = useAuth();
  const [summary, setSummary] = useState(null);
  const [balance, setBalance] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [claimBusy, setClaimBusy] = useState(false);
  const [toast, setToast] = useState({ text: "", kind: "" });

  const showToast = (text, kind) => {
    setToast({ text, kind });
    window.setTimeout(() => setToast({ text: "", kind: "" }), 3200);
  };

  const load = useCallback(async () => {
    if (!user) {
      setSummary(null);
      setBalance(null);
      setLoading(false);
      setErr("");
      return;
    }
    setLoading(true);
    setErr("");
    try {
      const { data } = await earnGetSummary();
      setSummary(data && typeof data === "object" ? data : null);
      setBalance(parseDisplayBalanceFromSummary(data));
    } catch (e) {
      const detail = e?.response?.data?.detail || e?.message || "";
      const msg = String(e?.message || "");
      const isNetwork =
        !e?.response && /network|failed to fetch|load failed|aborted|timeout|ERR_/i.test(msg);
      setSummary(null);
      setBalance(null);
      setErr(
        isNetwork
          ? "No connection."
          : typeof detail === "string" && detail && detail.length < 200
            ? detail
            : "Could not load rewards.",
      );
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!user) return undefined;
    const onVis = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [user, load]);

  async function claimCheckin() {
    setClaimBusy(true);
    try {
      const { data } = await earnCheckin({ app_id: RR_APP_ID });
      if (data?.ok) showToast(`Check-in: +${data.granted} units`, "ok");
      else if (data?.reason === "already_claimed") showToast("Check-in already claimed today.", "err");
      else if (data?.reason === "daily_cap") showToast("Daily cap reached for this app today.", "err");
      else showToast("Check-in not available.", "err");
      await load();
    } catch (e) {
      showToast(formatRrApiError(e), "err");
    } finally {
      setClaimBusy(false);
    }
  }

  if (!user) {
    return (
      <div className="page-shell px-4 pt-8 pb-24 text-center text-sm text-ink-tertiary" data-testid="testing-rewards-guest">
        Sign in to view rewards.
      </div>
    );
  }

  return (
    <div className="page-shell pb-24" data-testid="testing-rewards-page">
      <header
        className="sticky top-0 z-20 backdrop-blur-xl bg-bg-base/75 border-b border-white/5"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <div className="px-4 py-3 flex items-center gap-2">
          <button
            type="button"
            className="btn btn-ghost p-2 -ml-2"
            onClick={() => nav("/settings")}
            aria-label="Back"
            data-testid="testing-rewards-back"
          >
            <ChevronLeft size={22} />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-bold text-ink-primary truncate">Testing rewards</h1>
            <p className="text-[11px] text-ink-tertiary uppercase tracking-widest truncate">Beta tester balance</p>
          </div>
          <Gift size={20} className="text-phos shrink-0" aria-hidden />
        </div>
      </header>

      {toast.text && (
        <div className="px-4 mb-4 mt-2">
          <div
            role="status"
            className={`text-sm p-3 rounded-xl border ${
              toast.kind === "ok"
                ? "bg-emerald-950/40 border-emerald-700/50 text-emerald-100"
                : "bg-red-950/30 border-red-800/50 text-red-200"
            }`}
          >
            {toast.text}
          </div>
        </div>
      )}

      <div className="px-4 pt-4 space-y-4">
        {loading ? (
          <p className="text-center text-sm text-ink-tertiary py-12" data-testid="testing-rewards-loading">
            Loading…
          </p>
        ) : (
          <>
            {err && (
              <div className="card p-3 mb-2 border border-red-800/40 bg-red-950/20 text-sm text-red-200" role="alert" data-testid="testing-rewards-error">
                <span>{err}</span>
                <button
                  type="button"
                  data-testid="testing-rewards-retry"
                  onClick={() => load()}
                  className="mt-2 text-sm font-semibold text-phos underline underline-offset-2"
                >
                  Try again
                </button>
              </div>
            )}

            <div className="card overflow-hidden">
              <div className="px-4 py-3 border-b border-white/5 text-[10px] font-mono uppercase tracking-widest text-ink-tertiary">
                Rewards (RRTT units)
              </div>
              <div className="p-4 space-y-0">
                {(() => {
                  const br = summary ? parseRewardBreakdownFromSummary(summary) : null;
                  return (
                    <>
                      <DetailRow label="Pending rewards" value={formatRewardBalance(br?.pending ?? null)} />
                      <DetailRow label="Wallet balance" value={formatRewardBalance(br?.wallet ?? null)} />
                      <DetailRow label="Lifetime rewards" value={formatRewardBalance(br?.lifetime ?? null)} />
                    </>
                  );
                })()}
                <p className="text-xs text-ink-tertiary leading-relaxed px-4 py-3 border-t border-white/5">
                  <strong className="text-ink-primary">Lifetime rewards</strong> is your all-time program ledger total
                  (credits ever recorded); it is not the same as cash-out today.{" "}
                  <strong className="text-ink-primary">Pending</strong> is credits still on RootRecord before the daily
                  move to your RootRecord Wallet. <strong className="text-ink-primary">Wallet</strong> is RRTT already in
                  that RootRecord Wallet on Solana. The headline is <strong className="text-ink-primary">pending + wallet</strong>{" "}
                  only (we do not add lifetime on top). <strong className="text-ink-primary">Withdrawable truth</strong>:{" "}
                  <a href={SOLANA_TOOLS_ACCOUNT_URL} target="_blank" rel="noopener noreferrer" className="text-phos font-semibold underline underline-offset-2">
                    solana.rootrecord.info/account
                  </a>
                  . Headline total: <span className="font-mono tabular-nums">{formatRewardBalance(balance)}</span>. Full
                  policy: Program details below.
                </p>
                <div className="px-4 pb-4">
                  <a
                    href={BETA_REWARDS_PROGRAM_DETAILS_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    data-testid="testing-rewards-info-link"
                    className="inline-flex items-center gap-2 text-sm font-semibold text-phos no-underline"
                  >
                    <Gift size={16} aria-hidden />
                    Program details
                    <ExternalLink size={14} className="text-ink-tertiary" aria-hidden />
                  </a>
                </div>
              </div>
            </div>

            {summary && (
              <>
                <div className="card overflow-hidden">
                  <div className="px-4 py-3 border-b border-white/5 text-[10px] font-mono uppercase tracking-widest text-ink-tertiary">
                    Daily check-in
                  </div>
                  <div className="p-4 space-y-3">
                    <DetailRow label="Claimed today" value={summary.checkin?.claimed_today ? "Yes" : "No"} />
                    <DetailRow label="Check-in amount (units)" value={String(summary.checkin?.checkin_amount ?? "—")} />
                    <DetailRow label="Claimable now" value={summary.checkin?.claimable ? "Yes" : "No"} />
                    <button
                      type="button"
                      data-testid="testing-rewards-checkin-btn"
                      disabled={!summary.checkin?.claimable || claimBusy}
                      onClick={claimCheckin}
                      className="btn btn-primary w-full"
                    >
                      {claimBusy ? "Claiming…" : "Claim daily check-in"}
                    </button>
                    <button
                      type="button"
                      data-testid="testing-rewards-refresh"
                      onClick={() => load()}
                      className="btn btn-secondary w-full flex items-center justify-center gap-2"
                    >
                      <RefreshCw size={16} aria-hidden />
                      Refresh
                    </button>
                  </div>
                </div>

                <div className="card overflow-hidden">
                  <div className="px-4 py-3 border-b border-white/5 text-[10px] font-mono uppercase tracking-widest text-ink-tertiary">
                    Today (this app)
                  </div>
                  <div>
                    <DetailRow label="UTC date (ymd)" value={String(summary.ymd ?? "—")} />
                    <DetailRow label="Today units earned" value={String(summary.today_units_earned ?? "—")} />
                    <DetailRow label="Daily cap" value={String(summary.daily_cap ?? "—")} />
                    <DetailRow label="Daily remaining" value={String(summary.daily_remaining ?? "—")} />
                    <DetailRow label="Units / second" value={String(summary.units_per_second ?? "—")} />
                    <DetailRow label="Max seconds / page" value={String(summary.max_seconds_per_page ?? "—")} />
                  </div>
                </div>

                {summary.signup_bonus && (
                  <div className="card overflow-hidden">
                    <div className="px-4 py-3 border-b border-white/5 text-[10px] font-mono uppercase tracking-widest text-ink-tertiary">
                      Signup bonus
                    </div>
                    <div>
                      <DetailRow label="Received" value={summary.signup_bonus.received ? "Yes" : "No"} />
                      <DetailRow label="Received units" value={String(summary.signup_bonus.received_units ?? "—")} />
                      <DetailRow label="Program units" value={String(summary.signup_bonus.program_units ?? "—")} />
                    </div>
                  </div>
                )}

                <div className="card overflow-hidden">
                  <div className="px-4 py-3 border-b border-white/5 text-[10px] font-mono uppercase tracking-widest text-ink-tertiary">
                    Focus (heartbeat)
                  </div>
                  {summary.focus ? (
                    <>
                      <DetailRow label="App" value={String(summary.focus.app_id)} />
                      <DetailRow label="Page" value={String(summary.focus.page)} />
                      <DetailRow label="Seconds on page" value={String(summary.focus.seconds_on_page)} />
                      <DetailRow label="At page cap" value={summary.focus.at_page_cap ? "Yes" : "No"} />
                    </>
                  ) : (
                    <p className="p-4 text-sm text-ink-tertiary">—</p>
                  )}
                </div>

                <div className="card overflow-hidden">
                  <div className="px-4 py-3 border-b border-white/5 text-[10px] font-mono uppercase tracking-widest text-ink-tertiary">
                    Per-app today
                  </div>
                  <div className="p-4">
                    <pre className="text-[11px] font-mono text-ink-secondary overflow-x-auto whitespace-pre-wrap break-all">
                      {JSON.stringify(summary.per_app_today || [], null, 0)}
                    </pre>
                  </div>
                </div>

                <div className="card overflow-hidden">
                  <div className="px-4 py-3 border-b border-white/5 text-[10px] font-mono uppercase tracking-widest text-ink-tertiary">
                    Per-app lifetime totals
                  </div>
                  <div className="p-4">
                    <pre className="text-[11px] font-mono text-ink-secondary overflow-x-auto whitespace-pre-wrap break-all">
                      {JSON.stringify(summary.per_app_total || [], null, 0)}
                    </pre>
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
