import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import {
  ECOSYSTEM_LISTING_NAME,
  ECOSYSTEM_LISTING_SYMBOL,
} from '@/lib/ecosystemOtcConstants';
import { flattenSeoKeywordBuckets, pageSeo, pickSeoKeywords } from '@/lib/seo';

export const metadata: Metadata = pageSeo({
  path: '/operations/ecosystem',
  title: `Ecosystem — ${ECOSYSTEM_LISTING_SYMBOL}`,
  description: `${ECOSYSTEM_LISTING_NAME} (${ECOSYSTEM_LISTING_SYMBOL}): treasury / operator wallet, documented pool-related accounts, and how RootRecord ties on-chain references to operations.`,
  keywords: flattenSeoKeywordBuckets(pickSeoKeywords('core', 'operationsWiki', 'raydiumLiquidity'), [
    ECOSYSTEM_LISTING_SYMBOL,
    ECOSYSTEM_LISTING_NAME,
  ]),
});

export default function EcosystemLayout({ children }: { children: ReactNode }) {
  return children;
}
