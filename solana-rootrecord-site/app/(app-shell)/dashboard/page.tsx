import type { Metadata } from 'next';

import { DashboardWelcome } from '@/components/dashboard/DashboardWelcome';
import { pageSeo, pickSeoKeywords } from '@/lib/seo';

export const metadata: Metadata = pageSeo({
  path: '/dashboard',
  title: 'Hub',
  description:
    'Solana Tools home: wallet snapshot, RootRecord account hint, and links to create, manage tokens, liquidity, bulk sends, paper wallet, stats, and operations wiki.',
  keywords: pickSeoKeywords('core', 'hubNav', 'toolActions', 'raydiumLiquidity'),
});

export default function DashboardPage() {
  return <DashboardWelcome />;
}
