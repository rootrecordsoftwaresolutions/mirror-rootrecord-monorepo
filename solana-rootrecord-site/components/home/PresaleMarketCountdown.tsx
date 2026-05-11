'use client';

import { useEffect, useMemo, useState } from 'react';

import Link from 'next/link';

import {
  ECOSYSTEM_LISTING_SYMBOL,
  PRESALE_MARKET_OPEN_AT_ISO,
  PRESALE_MARKET_OPEN_AT_MS,
  PRESALE_MARKET_OPEN_LABEL_EN_UTC,
  PRESALE_POOL_UNLOCK_SOL_ACCOUNT,
  PRESALE_POOL_UNLOCK_USDC_ACCOUNT,
  solscanAccount,
} from '@/lib/ecosystemOtcConstants';

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

type PresaleMarketCountdownProps = {
  /** Hide the “Tokenomics” link (e.g. when embedded on the tokenomics page). */
  hideTokenomicsLink?: boolean;
};

export function PresaleMarketCountdown({ hideTokenomicsLink = false }: PresaleMarketCountdownProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

  const { open, parts } = useMemo(() => {
    const msLeft = PRESALE_MARKET_OPEN_AT_MS - now;
    if (msLeft <= 0) {
      return {
        open: true as const,
        parts: null as null,
      };
    }
    const sec = Math.floor(msLeft / 1000);
    const days = Math.floor(sec / 86400);
    const hours = Math.floor((sec % 86400) / 3600);
    const minutes = Math.floor((sec % 3600) / 60);
    const seconds = sec % 60;
    return {
      open: false as const,
      parts: { days, hours, minutes, seconds },
    };
  }, [now]);

  const unitClass =
    'flex min-w-[4.25rem] flex-col items-center rounded-lg border border-border/80 bg-black/30 px-3 py-3 sm:min-w-[5rem] sm:px-4';

  return (
    <section
      id="presale-market"
      className="scroll-mt-24 border-y border-border/60 bg-gradient-to-b from-sol-green/[0.07] to-transparent"
      aria-labelledby="presale-countdown-heading"
    >
      <div className="container py-12 md:py-16">
        <div className="mx-auto max-w-4xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-sol-green">
            {ECOSYSTEM_LISTING_SYMBOL} · presale
          </p>
          <h2
            id="presale-countdown-heading"
            className="mt-3 font-display text-3xl tracking-tight text-foreground md:text-4xl"
          >
            {open ? 'Market is open' : 'Liquidity unlock countdown'}
          </h2>
          <p className="mt-3 text-sm text-muted-foreground md:text-base">
            {open ? (
              <>
                SOL and USDC pool vaults are live for trading. All holder token accounts remain transferable — no OTC
                buyer freeze. Official open time was{' '}
                <time dateTime={PRESALE_MARKET_OPEN_AT_ISO}>{PRESALE_MARKET_OPEN_LABEL_EN_UTC}</time>.
              </>
            ) : (
              <>
                Pool liquidity for <strong className="text-foreground">{ECOSYSTEM_LISTING_SYMBOL}</strong> unlocks at{' '}
                <time dateTime={PRESALE_MARKET_OPEN_AT_ISO} className="font-medium text-foreground">
                  {PRESALE_MARKET_OPEN_LABEL_EN_UTC}
                </time>
                . OTC allocations mint to unlocked wallets; two Raydium vaults thaw at this instant so swaps can route.
              </>
            )}
          </p>

          {!open && parts ? (
            <div
              className="mt-8 flex flex-wrap justify-center gap-3 md:gap-4"
              role="timer"
              aria-live="polite"
              aria-label="Time until market open"
            >
              <div className={unitClass}>
                <span className="font-display text-3xl font-semibold tabular-nums text-foreground md:text-4xl">
                  {parts.days}
                </span>
                <span className="mt-1 text-[11px] uppercase tracking-wider text-muted-foreground">days</span>
              </div>
              <div className={unitClass}>
                <span className="font-display text-3xl font-semibold tabular-nums text-foreground md:text-4xl">
                  {pad2(parts.hours)}
                </span>
                <span className="mt-1 text-[11px] uppercase tracking-wider text-muted-foreground">hours</span>
              </div>
              <div className={unitClass}>
                <span className="font-display text-3xl font-semibold tabular-nums text-foreground md:text-4xl">
                  {pad2(parts.minutes)}
                </span>
                <span className="mt-1 text-[11px] uppercase tracking-wider text-muted-foreground">minutes</span>
              </div>
              <div className={unitClass}>
                <span className="font-display text-3xl font-semibold tabular-nums text-foreground md:text-4xl">
                  {pad2(parts.seconds)}
                </span>
                <span className="mt-1 text-[11px] uppercase tracking-wider text-muted-foreground">seconds</span>
              </div>
            </div>
          ) : null}

          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center sm:gap-6">
            <a
              href={solscanAccount(PRESALE_POOL_UNLOCK_SOL_ACCOUNT)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-white/[0.04] px-4 py-2 text-sm font-medium text-sol-green hover:bg-white/[0.07]"
            >
              SOL pool vault — Solscan
            </a>
            <a
              href={solscanAccount(PRESALE_POOL_UNLOCK_USDC_ACCOUNT)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-white/[0.04] px-4 py-2 text-sm font-medium text-sol-green hover:bg-white/[0.07]"
            >
              USDC pool vault — Solscan
            </a>
            {!hideTokenomicsLink ? (
              <Link
                href="/operations/tokenomics#presale-market"
                className="text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              >
                Tokenomics
              </Link>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
