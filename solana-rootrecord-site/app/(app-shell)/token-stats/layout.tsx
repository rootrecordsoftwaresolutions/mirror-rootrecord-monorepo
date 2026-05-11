import type { Metadata } from 'next';

import { pageSeo, pickSeoKeywords } from '@/lib/seo';

export const metadata: Metadata = pageSeo({
  path: '/token-stats',
  title: 'Token stats dashboard',
  description:
    'Open a shareable dashboard for any Solana SPL mint: circulating supply, authorities, largest token accounts, Jupiter price hint, and Metaplex metadata when present.',
  keywords: pickSeoKeywords('core', 'tokenDashboard', 'toolActions'),
});

export default function TokenStatsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
