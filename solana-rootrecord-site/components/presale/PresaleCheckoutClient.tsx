'use client';

import { useCallback, useEffect, useState } from 'react';
import { VersionedTransaction } from '@solana/web3.js';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { WalletMultiButton } from '@/components/wallet/WalletButton';
import { ECOSYSTEM_LISTING_SYMBOL } from '@/lib/ecosystemOtcConstants';

type StatusJson = {
  ok: true;
  active: boolean;
  min_usd: number;
  max_usd: number;
  instant_pool_seed?: { wsol_pool_configured: boolean; usdc_pool_configured: boolean };
};

type QuoteJson = {
  ok: true;
  roots_whole_display: string;
  sol_usd: number;
  payment_preview_sol: string | null;
  payment_preview_usdc: string | null;
  lamports: number | null;
  usdc_raw: string | null;
  treasury: string;
};

type Currency = 'SOL' | 'USDC';

function b64ToUint8(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

export function PresaleCheckoutClient() {
  const { connection } = useConnection();
  const { publicKey, signTransaction, connected } = useWallet();

  const [status, setStatus] = useState<StatusJson | null>(null);
  const [usd, setUsd] = useState('100');
  const [currency, setCurrency] = useState<Currency>('SOL');
  const [quote, setQuote] = useState<QuoteJson | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [paying, setPaying] = useState(false);

  const loadStatus = useCallback(async () => {
    try {
      const r = await fetch('/api/presale/status', { cache: 'no-store' });
      const j = (await r.json()) as StatusJson;
      if (j.ok) setStatus(j);
    } catch {
      setStatus(null);
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const fetchQuote = useCallback(async () => {
    const n = parseFloat(usd);
    if (!Number.isFinite(n) || n <= 0) {
      setQuote(null);
      return;
    }
    setQuoteLoading(true);
    try {
      const r = await fetch('/api/presale/quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usd_amount: n, currency }),
      });
      const j = (await r.json()) as { ok: boolean } & Partial<QuoteJson> & { error?: string };
      if (!r.ok || !j.ok) {
        setQuote(null);
        toast.error(j.error || 'Quote unavailable');
        return;
      }
      setQuote(j as QuoteJson);
    } catch {
      setQuote(null);
      toast.error('Quote failed');
    } finally {
      setQuoteLoading(false);
    }
  }, [usd, currency]);

  useEffect(() => {
    const t = window.setTimeout(() => void fetchQuote(), 400);
    return () => window.clearTimeout(t);
  }, [fetchQuote]);

  const pay = async () => {
    if (!connected || !publicKey || !quote) {
      toast.error('Connect wallet and wait for a quote.');
      return;
    }
    const n = parseFloat(usd);
    if (!Number.isFinite(n) || n <= 0) return;

    setPaying(true);
    try {
      const r = await fetch('/api/presale/transaction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          buyer: publicKey.toBase58(),
          usd_amount: n,
          currency,
        }),
      });
      const j = (await r.json()) as {
        ok: boolean;
        transaction_base64?: string;
        error?: string;
      };
      if (!r.ok || !j.ok || !j.transaction_base64) {
        toast.error(j.error || 'Could not build transaction');
        return;
      }

      const vtx = VersionedTransaction.deserialize(b64ToUint8(j.transaction_base64));
      const signed = await signTransaction!(vtx);
      const sig = await connection.sendRawTransaction(signed.serialize(), {
        skipPreflight: false,
        maxRetries: 3,
      });
      await connection.confirmTransaction(sig, 'confirmed');
      toast.success(
        `Purchased ~${quote.roots_whole_display} ${ECOSYSTEM_LISTING_SYMBOL}`,
      );
      window.open(`https://solscan.io/tx/${sig}`, '_blank', 'noopener,noreferrer');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(msg);
    } finally {
      setPaying(false);
    }
  };

  if (!status?.active) {
    return (
      <div className="rounded-lg border border-border/80 bg-white/[0.03] px-4 py-6 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">Presale checkout</p>
        <p className="mt-2">
          Online checkout is closed for this deployment (presale window ended or checkout disabled).
          See{' '}
          <a href="#presale-market" className="text-sol-green hover:underline">
            countdown
          </a>{' '}
          or contact operators for OTC.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-white/[0.04] p-5 md:p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="font-display text-xl font-semibold text-foreground">Presale checkout</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            ${status.min_usd}–${status.max_usd.toLocaleString()} USD · peg ${(1).toFixed(2)}{' '}
            USD per {ECOSYSTEM_LISTING_SYMBOL}. Pay with SOL or USDC; tokens mint to your wallet (same tx).
          </p>
        </div>
        <WalletMultiButton className="shrink-0 !justify-center" />
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="presale-usd">Amount (USD)</Label>
          <Input
            id="presale-usd"
            type="number"
            min={status.min_usd}
            step="0.01"
            value={usd}
            onChange={(e) => setUsd(e.target.value)}
            className="font-mono"
          />
        </div>
        <div className="space-y-2">
          <Label>Pay with</Label>
          <div className="flex gap-2">
            {(['SOL', 'USDC'] as const).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCurrency(c)}
                className={cn(
                  'flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
                  currency === c
                    ? 'border-sol-green bg-sol-green/15 text-foreground'
                    : 'border-border text-muted-foreground hover:bg-white/5',
                )}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-6 rounded-lg border border-border/60 bg-black/20 px-4 py-3 text-sm">
        {quoteLoading ? (
          <span className="text-muted-foreground">Updating quote…</span>
        ) : quote ? (
          <ul className="space-y-1.5 text-muted-foreground">
            <li>
              <strong className="text-foreground">{ECOSYSTEM_LISTING_SYMBOL}</strong> minted:{' '}
              <span className="font-mono text-foreground">{quote.roots_whole_display}</span>
            </li>
            <li>
              SOL / USD (hint):{' '}
              <span className="font-mono text-foreground">${quote.sol_usd.toFixed(4)}</span>
            </li>
            {currency === 'SOL' && quote.payment_preview_sol ? (
              <li>
                You send ≈{' '}
                <span className="font-mono text-foreground">{quote.payment_preview_sol} SOL</span> (
                includes ATA rent if your {ECOSYSTEM_LISTING_SYMBOL} account is new)
              </li>
            ) : null}
            {currency === 'USDC' && quote.payment_preview_usdc ? (
              <li>
                You send ≈{' '}
                <span className="font-mono text-foreground">${quote.payment_preview_usdc} USDC</span>
              </li>
            ) : null}
            <li className="text-xs">
              Treasury receives payment; mint authority signs mint to your ATA
              {status?.instant_pool_seed &&
              (status.instant_pool_seed.wsol_pool_configured ||
                status.instant_pool_seed.usdc_pool_configured)
                ? ', matched mint to treasury, and Raydium add-liquidity for the pool that matches SOL vs USDC payment — all in one transaction.'
                : ' in one transaction.'}
            </li>
          </ul>
        ) : (
          <span className="text-muted-foreground">Enter an amount for a live quote.</span>
        )}
      </div>

      <Button
        type="button"
        className="mt-6 w-full sm:w-auto"
        size="lg"
        disabled={!connected || !quote || quoteLoading || paying}
        onClick={() => void pay()}
      >
        {paying ? 'Confirm in wallet…' : `Sign & pay (${currency})`}
      </Button>

      {!connected ? (
        <p className="mt-3 text-xs text-muted-foreground">Connect a Solana wallet to continue.</p>
      ) : null}
    </div>
  );
}
