import { NextResponse } from 'next/server';

import {
  isPresaleCheckoutActive,
  presaleMaxUsd,
  presaleMinUsd,
} from '@/lib/presaleCheckout';
import { ECOSYSTEM_OTC_TOKEN_MINT, ECOSYSTEM_LISTING_SYMBOL } from '@/lib/ecosystemOtcConstants';

export const dynamic = 'force-dynamic';

export async function GET() {
  const wsol = Boolean(process.env.PRESALE_CP_MM_POOL_WSOL?.trim());
  const usdc = Boolean(process.env.PRESALE_CP_MM_POOL_USDC?.trim());
  return NextResponse.json({
    ok: true as const,
    active: isPresaleCheckoutActive(),
    symbol: ECOSYSTEM_LISTING_SYMBOL,
    mint: ECOSYSTEM_OTC_TOKEN_MINT.trim(),
    min_usd: presaleMinUsd(),
    max_usd: presaleMaxUsd(),
    instant_pool_seed: { wsol_pool_configured: wsol, usdc_pool_configured: usdc },
  });
}
