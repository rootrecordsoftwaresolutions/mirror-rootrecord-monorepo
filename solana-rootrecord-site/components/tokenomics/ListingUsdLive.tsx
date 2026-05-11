'use client';

import { useCallback, useEffect, useState } from 'react';

import Link from 'next/link';

import { ECOSYSTEM_LISTING_SYMBOL } from '@/lib/ecosystemOtcConstants';

type OkJson = {
  ok: true;
  symbol: string;
  mint: string;
  usd_per_whole_token: number | null;
  updated_at: number;
};

function formatUsd(n: number): string {
  const maxFrac = n >= 1 ? 4 : n >= 0.01 ? 6 : 10;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: maxFrac,
  }).format(n);
}

function relTime(ms: number, nowMs: number): string {
  const s = Math.max(0, Math.floor((nowMs - ms) / 1000));
  if (s < 5) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

export function ListingUsdLive() {
  const [usd, setUsd] = useState<number | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const r = await fetch('/api/listing-token-usd', { cache: 'no-store' });
      const j = (await r.json()) as OkJson | { ok: false };
      if (!r.ok || j.ok !== true) {
        setError(true);
        setUsd(null);
        setUpdatedAt(null);
        return;
      }
      setError(false);
      setUsd(j.usd_per_whole_token);
      setUpdatedAt(j.updated_at);
    } catch {
      setError(true);
      setUsd(null);
      setUpdatedAt(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const poll = window.setInterval(() => void refresh(), 30_000);
    return () => window.clearInterval(poll);
  }, [refresh]);

  useEffect(() => {
    const ui = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(ui);
  }, []);

  const relative =
    updatedAt != null ? relTime(updatedAt, nowMs) : null;

  return (
    <div
      className="rounded-xl border border-border bg-white/[0.04] px-4 py-5 md:px-6 md:py-6"
      data-testid="listing-usd-live"
    >
      <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
        <div>
          <h2 className="text-base font-semibold text-foreground">
            Live price ({ECOSYSTEM_LISTING_SYMBOL} / USD)
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Jupiter price hint for the listing mint; refreshes every 30s in your browser. Not an execution quote — check{' '}
            <a
              href="https://jup.ag/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sol-green hover:underline"
            >
              Jupiter
            </a>{' '}
            or{' '}
            <Link href="/token-stats" className="text-sol-green hover:underline">
              Token Stats
            </Link>{' '}
            before trading.
          </p>
        </div>
        <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground sm:text-right">
          Live tracker
        </p>
      </div>

      <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-h-[3rem]">
          {loading ? (
            <span className="inline-block h-10 w-48 animate-pulse rounded-md bg-muted-foreground/20" />
          ) : error ? (
            <span className="font-mono text-lg text-destructive">Could not load price</span>
          ) : usd != null ? (
            <span className="font-display text-4xl font-semibold tracking-tight text-foreground md:text-5xl">
              {formatUsd(usd)}
            </span>
          ) : (
            <span className="text-lg text-muted-foreground">
              No Jupiter USD quote right now — try again shortly or use{' '}
              <Link href="/token-stats" className="text-sol-green hover:underline">
                Token Stats
              </Link>
              .
            </span>
          )}
        </div>
        {!loading && !error && updatedAt != null ? (
          <p className="text-xs tabular-nums text-muted-foreground sm:text-right">
            Updated {relative}
          </p>
        ) : null}
      </div>
    </div>
  );
}
