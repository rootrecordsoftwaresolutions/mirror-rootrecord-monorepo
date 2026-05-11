import type { Metadata } from 'next';

import { pageSeo, pickSeoKeywords } from '@/lib/seo';

export const metadata: Metadata = pageSeo({
  path: '/tools',
  title: 'Manage Solana tokens',
  description:
    'On-chain token tools: revoke mint authority, revoke freeze authority, bulk freeze or thaw holder wallets & ATAs, mint more supply, burn tokens, update or lock Metaplex listing metadata (legacy SPL), Token-2022 withdraw withheld fees, harvest fees to mint, update transfer fee config. Links to Raydium CPMM liquidity and bulk SOL/SPL sends. Flat SOL fees per action.',
  keywords: pickSeoKeywords('core', 'toolActions', 'raydiumLiquidity', 'bulkSends'),
});

export default function ToolsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
