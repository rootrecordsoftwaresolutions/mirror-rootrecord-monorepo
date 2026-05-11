import { NextResponse } from 'next/server';
import { z } from 'zod';

import {
  isPresaleCheckoutActive,
  presaleMaxUsd,
  presaleMinUsd,
  quotePresalePayment,
  type PresaleCurrency,
} from '@/lib/presaleCheckout';
import { ECOSYSTEM_SOLSCAN_TREASURY } from '@/lib/ecosystemOtcConstants';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  usd_amount: z.number().positive(),
  currency: z.enum(['SOL', 'USDC']),
});

export async function POST(req: Request) {
  if (!isPresaleCheckoutActive()) {
    return NextResponse.json({ ok: false, error: 'presale_closed' }, { status: 403 });
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'validation' }, { status: 400 });
  }

  const { usd_amount, currency } = parsed.data;
  const min = presaleMinUsd();
  const max = presaleMaxUsd();
  if (usd_amount < min || usd_amount > max) {
    return NextResponse.json(
      { ok: false, error: 'amount_range', min_usd: min, max_usd: max },
      { status: 400 },
    );
  }

  try {
    const q = await quotePresalePayment(usd_amount, currency as PresaleCurrency);
    return NextResponse.json({
      ok: true as const,
      treasury: ECOSYSTEM_SOLSCAN_TREASURY.trim(),
      ...q,
      payment_preview_sol:
        currency === 'SOL' && q.lamports != null
          ? (q.lamports / 1e9).toFixed(6)
          : null,
      payment_preview_usdc:
        currency === 'USDC' && q.usdc_raw != null
          ? (Number(q.usdc_raw) / 1e6).toLocaleString('en-US', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })
          : null,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'quote_failed';
    return NextResponse.json({ ok: false, error: msg }, { status: 502 });
  }
}
