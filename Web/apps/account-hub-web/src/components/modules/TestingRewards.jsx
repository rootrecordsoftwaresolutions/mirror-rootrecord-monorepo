import React, { useCallback, useEffect, useState } from "react";
import { Gift, ExternalLink, RefreshCw } from "lucide-react";
import { ScreenHeader, PageContainer, Section, Empty, Spinner, Toast, useToast } from "../ui/Shell";
import { useAuth } from "../../contexts/AuthContext";
import { earnGetSummary, earnCheckin, RR_APP_ID, formatApiError } from "../../lib/api";
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
    <div className="row text-sm" style={{ alignItems: "flex-start" }}>
      <span className="text-ink-tertiary shrink-0 pr-2">{label}</span>
      <span className="text-ink-primary font-mono text-right break-all min-w-0">{value}</span>
    </div>
  );
}

export default function TestingRewards() {
  const { user } = useAuth();
  const { toast, show, clear } = useToast();
  const [summary, setSummary] = useState(null);
  const [balance, setBalance] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [claimBusy, setClaimBusy] = useState(false);

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
    if (!user) return;
    setClaimBusy(true);
    try {
      const { data } = await earnCheckin({ app_id: RR_APP_ID });
      if (data?.ok) show(`Check-in: +${data.granted} units`, "success");
      else if (data?.reason === "already_claimed") show("Check-in already claimed today.", "error");
      else if (data?.reason === "daily_cap") show("Daily cap reached for this app today.", "error");
      else show("Check-in not available.", "error");
      await load();
    } catch (e) {
      show(formatApiError(e), "error");
    } finally {
      setClaimBusy(false);
    }
  }

  return (
    <>
      <ScreenHeader title="Testing rewards" subtitle="Beta tester balance" />
      <PageContainer>
        {!user ? (
          <Empty title="Sign in to view rewards" icon={<Gift size={32} />} />
        ) : loading ? (
          <Spinner />
        ) : (
          <>
            {err && (
              <div
                className="card p-3 mb-4 border border-[rgba(244,63,94,0.35)] bg-[rgba(244,63,94,0.08)] text-sm text-[#FB7185] flex flex-col gap-2"
                role="alert"
                data-testid="testing-rewards-error"
              >
                <span>{err}</span>
                <button
                  type="button"
                  data-testid="testing-rewards-retry"
                  onClick={() => load()}
                  className="self-start text-brand font-semibold underline underline-offset-2"
                >
                  Try again
                </button>
              </div>
            )}

            <Section title="Rewards (RRTT units)">
              <div className="p-4 space-y-3">
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
                <p className="text-xs text-ink-tertiary leading-relaxed border-t border-white/10 pt-3 mt-1">
                  <strong className="text-ink-primary">Lifetime rewards</strong> is your all-time program ledger total
                  (credits ever recorded); it is not the same as cash-out today.{" "}
                  <strong className="text-ink-primary">Pending</strong> is credits still on RootRecord before the daily
                  move to your RootRecord Wallet. <strong className="text-ink-primary">Wallet</strong> is RRTT already in
                  that RootRecord Wallet on Solana. The headline is <strong className="text-ink-primary">pending + wallet</strong>{" "}
                  only (we do not add lifetime on top). <strong className="text-ink-primary">Withdrawable truth</strong>:{" "}
                  <a href={SOLANA_TOOLS_ACCOUNT_URL} target="_blank" rel="noreferrer" className="text-brand font-semibold underline underline-offset-2">
                    solana.rootrecord.info/account
                  </a>
                  . Headline total: <span className="font-mono tabular-nums">{formatRewardBalance(balance)}</span>. Full
                  policy: Program details below.
                </p>
                <a
                  href={BETA_REWARDS_PROGRAM_DETAILS_URL}
                  target="_blank"
                  rel="noreferrer"
                  data-testid="testing-rewards-info-link"
                  className="flex items-center gap-2 text-sm font-semibold text-brand"
                >
                  <Gift size={16} />
                  Program details
                  <ExternalLink size={14} className="text-ink-tertiary" />
                </a>
              </div>
            </Section>

            {summary && (
              <>
                <Section title="Daily check-in">
                  <div className="p-4 space-y-3">
                    <DetailRow label="Claimed today" value={summary.checkin?.claimed_today ? "Yes" : "No"} />
                    <DetailRow
                      label="Check-in amount (units)"
                      value={String(summary.checkin?.checkin_amount ?? "—")}
                    />
                    <DetailRow
                      label="Claimable now"
                      value={summary.checkin?.claimable ? "Yes" : "No"}
                    />
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
                      <RefreshCw size={16} /> Refresh
                    </button>
                  </div>
                </Section>

                <Section title="Today (this app)">
                  <div className="p-4 space-y-0">
                    <DetailRow label="UTC date (ymd)" value={String(summary.ymd ?? "—")} />
                    <DetailRow label="Today units earned" value={String(summary.today_units_earned ?? "—")} />
                    <DetailRow label="Daily cap" value={String(summary.daily_cap ?? "—")} />
                    <DetailRow label="Daily remaining" value={String(summary.daily_remaining ?? "—")} />
                    <DetailRow label="Units / second" value={String(summary.units_per_second ?? "—")} />
                    <DetailRow label="Max seconds / page" value={String(summary.max_seconds_per_page ?? "—")} />
                  </div>
                </Section>

                {summary.signup_bonus && (
                  <Section title="Signup bonus">
                    <div className="p-4 space-y-0">
                      <DetailRow label="Received" value={summary.signup_bonus.received ? "Yes" : "No"} />
                      <DetailRow label="Received units" value={String(summary.signup_bonus.received_units ?? "—")} />
                      <DetailRow label="Program units" value={String(summary.signup_bonus.program_units ?? "—")} />
                    </div>
                  </Section>
                )}

                <Section title="Focus (heartbeat)">
                  <div className="p-4 space-y-0">
                    {summary.focus ? (
                      <>
                        <DetailRow label="App" value={String(summary.focus.app_id)} />
                        <DetailRow label="Page" value={String(summary.focus.page)} />
                        <DetailRow label="Seconds on page" value={String(summary.focus.seconds_on_page)} />
                        <DetailRow label="At page cap" value={summary.focus.at_page_cap ? "Yes" : "No"} />
                      </>
                    ) : (
                      <p className="text-sm text-ink-tertiary">—</p>
                    )}
                  </div>
                </Section>

                <Section title="Per-app today">
                  <div className="p-4">
                    <pre className="text-[11px] font-mono text-ink-secondary overflow-x-auto whitespace-pre-wrap break-all">
                      {JSON.stringify(summary.per_app_today || [], null, 0)}
                    </pre>
                  </div>
                </Section>

                <Section title="Per-app lifetime totals">
                  <div className="p-4">
                    <pre className="text-[11px] font-mono text-ink-secondary overflow-x-auto whitespace-pre-wrap break-all">
                      {JSON.stringify(summary.per_app_total || [], null, 0)}
                    </pre>
                  </div>
                </Section>
              </>
            )}
          </>
        )}
      </PageContainer>
      <Toast message={toast.message} kind={toast.kind} onDone={clear} />
    </>
  );
}
