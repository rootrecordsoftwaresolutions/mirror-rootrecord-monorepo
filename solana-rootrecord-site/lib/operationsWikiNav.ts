/** Sidebar + index for `/operations` wiki (program docs, on-chain context, product guides). */
export type OperationsWikiPage = {
  href: string;
  label: string;
  description: string;
};

export const OPERATIONS_WIKI_PAGES: readonly OperationsWikiPage[] = [
  {
    href: '/operations',
    label: 'Overview',
    description: 'Short guide to pools, docs, and schedules.',
  },
  {
    href: '/operations/docs',
    label: 'Documentation',
    description: 'Wallet, create, tools, referrals, paper wallet, rewards.',
  },
  {
    href: '/operations/reference',
    label: 'Reference',
    description: 'Definitions, pillars, fees — GEO / AI citation-friendly.',
  },
  {
    href: '/operations/ecosystem',
    label: 'Ecosystem',
    description: 'Solscan links for mint, treasury, and pools.',
  },
  {
    href: '/operations/liquidity-timing',
    label: 'Liquidity timing',
    description: 'When treasury checks run (UTC) and daily earn settlement.',
  },
  {
    href: '/operations/tokenomics',
    label: 'Tokenomics & markets',
    description: 'Presale countdown, OTC peg, pool unlock, mint, pools, live price, fees.',
  },
] as const;
