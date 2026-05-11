import type { Metadata } from 'next';

import { pageSeo, pickSeoKeywords } from '@/lib/seo';

export const metadata: Metadata = pageSeo({
  path: '/bulk',
  title: 'Bulk SOL & token sends',
  description:
    'Send native SOL or SPL tokens to many wallets in batched transactions. RootRecord fee scales with list size; you cover Solana network fees and token-account rent when accounts must be created.',
  keywords: pickSeoKeywords('core', 'bulkSends', 'createMint'),
});

export default function BulkLayout({ children }: { children: React.ReactNode }) {
  return children;
}
