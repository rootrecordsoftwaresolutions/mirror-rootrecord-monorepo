import { PublicKey } from '@solana/web3.js';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import {
  buildPresaleTransaction,
  isPresaleCheckoutActive,
  presaleMaxUsd,
  presaleMinUsd,
  type PresaleCurrency,
} from '@/lib/presaleCheckout';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  buyer: z.string().min(32).max(64),
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

  const { buyer: buyerStr, usd_amount, currency } = parsed.data;
  let buyer: PublicKey;
  try {
    buyer = new PublicKey(buyerStr.trim());
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_buyer' }, { status: 400 });
  }

  const min = presaleMinUsd();
  const max = presaleMaxUsd();
  if (usd_amount < min || usd_amount > max) {
    return NextResponse.json(
      { ok: false, error: 'amount_range', min_usd: min, max_usd: max },
      { status: 400 },
    );
  }

  try {
    const { serialized, roots_raw } = await buildPresaleTransaction({
      buyer,
      usd: usd_amount,
      currency: currency as PresaleCurrency,
    });
    const b64 = Buffer.from(serialized).toString('base64');
    return NextResponse.json({
      ok: true as const,
      transaction_base64: b64,
      roots_raw,
    });
  } catch (e) {
    const debugStack = process.env.PRESALE_DEBUG_STACK?.trim() === '1';
    const msg = e instanceof Error ? e.message : 'build_failed';
    const stack =
      debugStack && e instanceof Error
        ? e.stack || '(no stack)'
        : undefined;
    const missingKey =
      msg.includes('ECOSYSTEM_OTC_TREASURY_PRIVATE_KEY') || msg.includes('not set');
    return NextResponse.json(
      { ok: false, error: msg, stack },
      { status: missingKey ? 503 : 400 },
    );
  }
}
