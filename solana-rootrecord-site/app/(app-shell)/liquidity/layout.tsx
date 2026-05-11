import type { Metadata } from 'next';

import {
  LAUNCH_FEE_SOL,
  RAYDIUM_MAINNET_CPMM_POOL_CREATE_FEE_SOL,
} from '@/lib/solana';
import { pageSeo, pickSeoKeywords } from '@/lib/seo';

const launchMetaFixed = (
  RAYDIUM_MAINNET_CPMM_POOL_CREATE_FEE_SOL + LAUNCH_FEE_SOL
).toFixed(2);

export const metadata: Metadata = pageSeo({
  path: '/liquidity',
  title: 'Raydium CPMM liquidity',
  description: `Create a Raydium CPMM pool, add liquidity, or remove liquidity (burn LP). On mainnet, new pool setup is about ${launchMetaFixed} SOL plus your liquidity deposit (Raydium program fees plus RootRecord launch fee).`,
  keywords: pickSeoKeywords('core', 'raydiumLiquidity', 'bulkSends'),
});

export default function LiquidityLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
