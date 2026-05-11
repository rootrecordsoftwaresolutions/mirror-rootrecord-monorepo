import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { ECOSYSTEM_LISTING_SYMBOL } from '@/lib/ecosystemOtcConstants';
import { flattenSeoKeywordBuckets, pageSeo, pickSeoKeywords } from '@/lib/seo';

export const metadata: Metadata = pageSeo({
  path: '/operations/liquidity-timing',
  title: `Liquidity timing — ${ECOSYSTEM_LISTING_SYMBOL}`,
  description: `UTC schedule and behavior for RootRecord treasury Raydium LP maintenance (${ECOSYSTEM_LISTING_SYMBOL}): native SOL floor checks and listing-token SPL inventory floors.`,
  keywords: flattenSeoKeywordBuckets(pickSeoKeywords('core', 'operationsWiki', 'raydiumLiquidity'), [
    ECOSYSTEM_LISTING_SYMBOL,
    'liquidity automation schedule',
    'treasury LP',
  ]),
});

export default function LiquidityTimingLayout({ children }: { children: ReactNode }) {
  return children;
}
