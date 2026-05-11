import React, { useCallback, useEffect, useState } from 'react';
import { Gift, ExternalLink, RefreshCw } from 'lucide-react';
import { api, formatApiError, isBackendConfigured, session, RR_APP_ID } from '../lib/api';
import { NATIVE_APP_VERSION } from '../lib/nativeAppVersion';
import {
  formatRewardBalance,
  parseDisplayBalanceFromSummary,
  parseRewardBreakdownFromSummary,
  SOLANA_TOOLS_ACCOUNT_URL,
} from '../lib/rewardsFormat';

const BETA_REWARDS_INFO_URL =
  String(process.env.REACT_APP_BETA_REWARDS_INFO_URL || 'https://rootrecord.info/beta-tester-rewards.html').trim() ||
  'https://rootrecord.info/beta-tester-rewards.html';
const BETA_REWARDS_PROGRAM_DETAILS_URL = `${BETA_REWARDS_INFO_URL.replace(/#.*$/, '')}#program-details`;

function Section({ title, children, testId }) {
  return (
    <section className="mb-6" data-testid={testId}>
      <h2 className="text-[10px] font-mono uppercase tracking-widest text-accent/70 mb-2 px-4">{title}</h2>
      <div className="bg-container border border-subtle">{children}</div>
    </section>
  );
}

function DetailRow({ label, value }) {
  return (
    <div className="flex items-start justify-between gap-3 px-4 py-2.5 border-b border-subtle last:border-0 text-sm">
      <span className="text-accent/70 shrink-0">{label}</span>
      <span className="text-white font-mono text-right break-all min-w-0">{value}</span>
    </div>
  );
}

export default function TestingRewards() {
  const [summary, setSummary] = useState(null);
  const [balance, setBalance] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [claimBusy, setClaimBusy] = useState(false);
  const [toast, setToast] = useState({ text: '', kind: '' });

  const showToast = (text, kind) => {
    setToast({ text, kind });
    window.setTimeout(() => setToast({ text: '', kind: '' }), 3200);
  };

  const load = useCallback(async () => {
    if (!session.isAuthed() || !isBackendConfigured()) {
      setSummary(null);
      setBalance(null);
      setLoading(false);
      setErr('');
      return;
    }
    setLoading(true);
    setErr('');
    try {
      const { data } = await api.getEarnSummary();
      setSummary(data && typeof data === 'object' ? data : null);
      setBalance(parseDisplayBalanceFromSummary(data));
    } catch (e) {
      const detail = e?.response?.data?.detail || e?.message || '';
      const msg = String(e?.message || '');
      const isNetwork =
        !e?.response && /network|failed to fetch|load failed|aborted|timeout|ERR_/i.test(msg);
      setSummary(null);
      setBalance(null);
      setErr(
        isNetwork
          ? 'No connection.'
          : typeof detail === 'string' && detail && detail.length < 200
            ? detail
            : 'Could not load rewards.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!session.isAuthed()) return undefined;
    const onVis = () => {
      if (document.visibilityState === 'visible') load();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [load]);

  async function claimCheckin() {
    setClaimBusy(true);
    try {
      const { data } = await api.earnCheckin({ app_id: RR_APP_ID });
      if (data?.ok) showToast(`Check-in: +${data.granted} units`, 'ok');
      else if (data?.reason === 'already_claimed') showToast('Check-in already claimed today.', 'err');
      else if (data?.reason === 'daily_cap') showToast('Daily cap reached for this app today.', 'err');
      else showToast('Check-in not available.', 'err');
      await load();
    } catch (e) {
      showToast(formatApiError(e), 'err');
    } finally {
      setClaimBusy(false);
    }
  }

  if (!session.isAuthed()) {
    return (
      <div className="animate-fadein pb-8 px-4 pt-8 text-center text-accent/80 text-sm" data-testid="testing-rewards-guest">
        Sign in to view rewards.
      </div>
    );
  }

  if (!isBackendConfigured()) {
    return (
      <div className="animate-fadein pb-8 px-4 pt-8 text-center text-accent/80 text-sm" data-testid="testing-rewards-no-backend">
        Rewards require a configured API. Set REACT_APP_BACKEND_URL for local builds.
      </div>
    );
  }

  return (
    <div className="animate-fadein pb-8" data-testid="testing-rewards-page">
      <header
        className="flex items-center justify-between p-4"
        style={{ paddingTop: 'calc(1rem + env(safe-area-inset-top, 0px))' }}
      >
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Testing rewards</h1>
          <p className="text-xs text-accent/70 font-mono uppercase tracking-widest">Beta tester balance</p>
        </div>
        <Gift strokeWidth={1.5} className="w-5 h-5 text-accent/70" aria-hidden />
      </header>

      {toast.text && (
        <div className="px-4 mb-4">
          <div
            role="status"
            className={`text-sm p-3 rounded-lg border ${
              toast.kind === 'ok'
                ? 'bg-emerald-950/40 border-emerald-700/50 text-emerald-100'
                : 'bg-sev-severe/10 border-sev-severe/40 text-sev-moderate'
            }`}
          >
            {toast.text}
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-center text-accent/70 text-sm py-12" data-testid="testing-rewards-loading">
          Loading…
        </p>
      ) : (
        <>
          {err && (
            <div className="mx-4 mb-4" role="alert" data-testid="testing-rewards-error">
              <div className="text-xs bg-sev-severe/10 border border-sev-severe/40 text-sev-moderate p-3 rounded-lg flex flex-col gap-2">
                <span>{err}</span>
                <button
                  type="button"
                  data-testid="testing-rewards-retry"
                  onClick={() => load()}
                  className="self-start text-sm font-mono text-accent underline underline-offset-2"
                >
                  Try again
                </button>
              </div>
            </div>
          )}

          <Section title="Rewards (RRTT units)" testId="testing-rewards-balance-section">
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
              <p className="text-xs text-accent/70 leading-relaxed border-t border-subtle pt-3 mt-1">
                <strong className="text-accent">Lifetime rewards</strong> is your all-time program ledger total (credits
                ever recorded); it is not the same as cash-out today. <strong className="text-accent">Pending</strong> is
                credits still on RootRecord before the daily move to your RootRecord Wallet.{' '}
                <strong className="text-accent">Wallet</strong> is RRTT already in that RootRecord Wallet on Solana. The big
                headline is <strong className="text-accent">pending + wallet</strong> only (we do not add lifetime on
                top). <strong className="text-accent">Withdrawable truth</strong> and cash-out:{' '}
                <a
                  href={SOLANA_TOOLS_ACCOUNT_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent font-semibold underline underline-offset-2"
                >
                  solana.rootrecord.info/account
                </a>
                . Headline total: <span className="font-mono tabular-nums">{formatRewardBalance(balance)}</span>. Full
                policy: Program details below.
              </p>
              <a
                href={BETA_REWARDS_PROGRAM_DETAILS_URL}
                target="_blank"
                rel="noopener noreferrer"
                data-testid="testing-rewards-info-link"
                className="inline-flex items-center gap-2 text-sm font-semibold text-accent no-underline"
              >
                <Gift strokeWidth={1.5} className="w-4 h-4" aria-hidden />
                Program details
                <ExternalLink strokeWidth={1.5} className="w-3.5 h-3.5 text-accent/60" aria-hidden />
              </a>
            </div>
          </Section>

          {summary && (
            <>
              <Section title="Daily check-in" testId="testing-rewards-checkin-section">
                <div className="p-4 space-y-3">
                  <DetailRow label="Claimed today" value={summary.checkin?.claimed_today ? 'Yes' : 'No'} />
                  <DetailRow label="Check-in amount (units)" value={String(summary.checkin?.checkin_amount ?? '—')} />
                  <DetailRow label="Claimable now" value={summary.checkin?.claimable ? 'Yes' : 'No'} />
                  <button
                    type="button"
                    data-testid="testing-rewards-checkin-btn"
                    disabled={!summary.checkin?.claimable || claimBusy}
                    onClick={claimCheckin}
                    className="w-full py-3 rounded-lg bg-accent text-app font-semibold text-sm disabled:opacity-50"
                  >
                    {claimBusy ? 'Claiming…' : 'Claim daily check-in'}
                  </button>
                  <button
                    type="button"
                    data-testid="testing-rewards-refresh"
                    onClick={() => load()}
                    className="w-full py-3 rounded-lg border border-subtle text-white font-semibold text-sm flex items-center justify-center gap-2 hover:bg-containerHover"
                  >
                    <RefreshCw strokeWidth={1.5} className="w-4 h-4" aria-hidden />
                    Refresh
                  </button>
                </div>
              </Section>

              <Section title="Today (this app)" testId="testing-rewards-today-section">
                <DetailRow label="UTC date (ymd)" value={String(summary.ymd ?? '—')} />
                <DetailRow label="Today units earned" value={String(summary.today_units_earned ?? '—')} />
                <DetailRow label="Daily cap" value={String(summary.daily_cap ?? '—')} />
                <DetailRow label="Daily remaining" value={String(summary.daily_remaining ?? '—')} />
                <DetailRow label="Units / second" value={String(summary.units_per_second ?? '—')} />
                <DetailRow label="Max seconds / page" value={String(summary.max_seconds_per_page ?? '—')} />
              </Section>

              {summary.signup_bonus && (
                <Section title="Signup bonus" testId="testing-rewards-signup-section">
                  <DetailRow label="Received" value={summary.signup_bonus.received ? 'Yes' : 'No'} />
                  <DetailRow label="Received units" value={String(summary.signup_bonus.received_units ?? '—')} />
                  <DetailRow label="Program units" value={String(summary.signup_bonus.program_units ?? '—')} />
                </Section>
              )}

              <Section title="Focus (heartbeat)" testId="testing-rewards-focus-section">
                {summary.focus ? (
                  <>
                    <DetailRow label="App" value={String(summary.focus.app_id)} />
                    <DetailRow label="Page" value={String(summary.focus.page)} />
                    <DetailRow label="Seconds on page" value={String(summary.focus.seconds_on_page)} />
                    <DetailRow label="At page cap" value={summary.focus.at_page_cap ? 'Yes' : 'No'} />
                  </>
                ) : (
                  <p className="p-4 text-sm text-accent/70">—</p>
                )}
              </Section>

              <Section title="Per-app today" testId="testing-rewards-per-app-today-section">
                <div className="p-4">
                  <pre className="text-[11px] font-mono text-accent/80 overflow-x-auto whitespace-pre-wrap break-all">
                    {JSON.stringify(summary.per_app_today || [], null, 0)}
                  </pre>
                </div>
              </Section>

              <Section title="Per-app lifetime totals" testId="testing-rewards-per-app-total-section">
                <div className="p-4">
                  <pre className="text-[11px] font-mono text-accent/80 overflow-x-auto whitespace-pre-wrap break-all">
                    {JSON.stringify(summary.per_app_total || [], null, 0)}
                  </pre>
                </div>
              </Section>
            </>
          )}
        </>
      )}

      <p className="text-center text-[10px] font-mono text-accent/60 mt-8">
        Root Record Weather Manager Mobile · v{NATIVE_APP_VERSION}
      </p>
    </div>
  );
}
