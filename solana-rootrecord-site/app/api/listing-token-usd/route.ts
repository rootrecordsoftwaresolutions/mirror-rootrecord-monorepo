import { NextResponse } from 'next/server';

import {
  ECOSYSTEM_LISTING_SYMBOL,
  ECOSYSTEM_OTC_TOKEN_MINT,
} from '@/lib/ecosystemOtcConstants';
import { fetchJupiterOtcPriceMarks } from '@/lib/ecosystemJupUsd';

export const dynamic = 'force-dynamic';

/**
 * Live-ish USD / whole token hint from Jupiter for the listing mint (same sources as token dashboards).
 */
export async function GET() {
  try {
    const marks = await fetchJupiterOtcPriceMarks({ cache: 'no-store' });
    const raw = marks.tokenUsd;
    const usd =
      raw != null && Number.isFinite(raw) && raw > 0 ? raw : null;
    return NextResponse.json(
      {
        ok: true as const,
        symbol: ECOSYSTEM_LISTING_SYMBOL,
        mint: ECOSYSTEM_OTC_TOKEN_MINT.trim(),
        usd_per_whole_token: usd,
        updated_at: marks.fetchedAt,
      },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=15, stale-while-revalidate=120',
        },
      },
    );
  } catch {
    return NextResponse.json({ ok: false as const }, { status: 502 });
  }
}
