import type { Metadata } from 'next';

import { pageSeo, pickSeoKeywords } from '@/lib/seo';

export const metadata: Metadata = pageSeo({
  path: '/create',
  title: 'Create SPL or Token-2022 token',
  description:
    'Launch a Solana mint in one flow: legacy SPL + Metaplex metadata or Token-2022 with extensions. Optional logo & JSON pinned to IPFS via Pinata; transparent create fee in SOL.',
  keywords: pickSeoKeywords('core', 'createMint', 'ipfsMetadata', 'toolActions'),
});

export default function CreateLayout({ children }: { children: React.ReactNode }) {
  return children;
}
