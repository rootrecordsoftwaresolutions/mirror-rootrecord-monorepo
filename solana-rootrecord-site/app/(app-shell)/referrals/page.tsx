import type { Metadata } from 'next';
import { ReferralsClient } from './ReferralsClient';

import { pageSeo, pickSeoKeywords } from '@/lib/seo';

export const metadata: Metadata = pageSeo({
  path: '/referrals',
  title: 'Referral program',
  description:
    'Share RootRecord Solana Tools with ?ref=your wallet address. A configurable share of each referred platform fee is sent to the referrer in the same on-chain transaction.',
  keywords: pickSeoKeywords('core', 'referralDiscovery', 'pricingFees'),
});

export default function ReferralsPage() {
  return <ReferralsClient />;
}
