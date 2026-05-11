import type { Metadata } from 'next';

import { getPublicSiteOrigin } from '@/lib/siteOrigin';

/** Default OG / Twitter card image (under `public/`). */
export const SEO_OG_IMAGE_PATH = '/brand.jpg';

const SITE_NAME = 'RootRecord Solana Tools';

/**
 * SEO keyword buckets — derived from `lib/toolsCatalog` tool kinds, /create, /liquidity,
 * /bulk, /wallet-generator, contracts, referrals, and dashboards. Merged with dedupe for
 * layout defaults and `pickSeoKeywords`.
 */
export const SEO_KEYWORDS = {
  /** Brand, chain, wallet, Metaplex — site-wide */
  core: [
    'Solana',
    'Solana mainnet',
    'Solana devnet',
    'SPL token',
    'SPL Token program',
    'Token-2022',
    'Token-2022 extensions',
    'Metaplex',
    'Metaplex token metadata',
    'Solana token creator',
    'SPL token creator',
    'cheap Solana token creator',
    'create token on Solana',
    'create Solana token',
    'create SPL token',
    'Associated Token Account',
    'ATA',
    'Solana wallet adapter',
    'Phantom wallet',
    'self-custody wallet',
    'Jupiter',
    'Solscan',
    'rootrecord',
    'RootRecord',
    'RootRecord Solana Tools',
    'solana.rootrecord.info',
  ],

  /**
   * /tools — matches ToolKind + catalog: revoke, freeze/thaw, mint more, burn, metadata,
   * Token-2022 transfer fees.
   */
  toolActions: [
    'revoke mint authority',
    'revoke mint authority Solana',
    'lock token supply',
    'revoke freeze authority',
    'revoke freeze authority SPL',
    'freeze authority removed',
    'bulk freeze token accounts',
    'bulk thaw SPL',
    'freeze thaw holder wallets',
    'holder ATA freeze',
    'mint more SPL tokens',
    'mint additional supply',
    'burn SPL tokens',
    'burn Token-2022',
    'reduce circulating supply',
    'update token metadata',
    'update Metaplex metadata',
    'edit SPL metadata on-chain',
    'lock listing metadata',
    'immutable token metadata',
    'Metaplex immutable metadata',
    'withdraw withheld fees',
    'withdraw transfer fees Token-2022',
    'harvest fees to mint',
    'harvest withheld fees Token-2022',
    'sweep transfer fees',
    'update transfer fee config',
    'Token-2022 transfer fee',
    'transfer fee basis points',
    'withheld fee withdrawal',
  ],

  /** /liquidity — Raydium CPMM */
  raydiumLiquidity: [
    'Raydium',
    'Raydium CPMM',
    'Raydium pool',
    'create Raydium pool',
    'add liquidity Solana',
    'remove liquidity CPMM',
    'burn LP tokens',
    'Raydium liquidity',
    'Solana DEX liquidity',
    'CPMM pool',
    'Solana swap pool',
  ],

  /** /bulk */
  bulkSends: [
    'bulk SOL send',
    'mass SOL transfer Solana',
    'SPL batch send',
    'batch token transfer',
    'multi recipient airdrop',
    'bulk SPL distribution',
    'airdrop tool Solana',
  ],

  /** /create */
  createMint: [
    'create SPL token',
    'Token-2022 mint',
    'launch SPL mint',
    'token decimals',
    'mint authority',
    'freeze authority',
    'token supply',
  ],

  /** Pinata / IPFS paths used in create + metadata tools */
  ipfsMetadata: [
    'Pinata',
    'IPFS metadata',
    'token logo IPFS',
    'JSON metadata SPL',
    'off-chain metadata',
    'gateway Pinata',
  ],

  /** /wallet-generator */
  paperWallet: [
    'Solana paper wallet',
    'Solana paper wallet generator',
    'printable Solana wallet',
    'QR code wallet',
    'QR private key',
    'cold storage Solana',
    'offline Solana wallet',
    'Solana keypair generator',
    'base58 private key',
    'tent fold wallet print',
    'save ink print',
    'Solana wallet QR print',
    'import private key Phantom',
  ],

  /** /contracts, /contracts/vesting */
  vestingTreasury: [
    'Solana vesting',
    'token vesting',
    'linear vesting',
    'cliff vesting',
    'treasury lock',
    'token lock',
    'smart contract Solana',
    'on-chain vesting schedule',
  ],

  /** /token-stats, /ref/[mint] */
  tokenDashboard: [
    'SPL token stats',
    'Solana mint dashboard',
    'token holders Solana',
    'largest token accounts',
    'circulating supply SPL',
    'Jupiter price',
    'token authorities',
    'shareable token page',
  ],

  /** /referrals */
  referralDiscovery: [
    'Solana referral',
    'referral link token tools',
    'ref wallet parameter',
    'affiliate fee SOL',
    'referrer reward',
  ],

  /** /pricing */
  pricingFees: [
    'Solana tool fees',
    'flat SOL fee',
    'token creator pricing',
    'no subscription',
    'transparent pricing SOL',
  ],

  /** /operations wiki cluster */
  operationsWiki: [
    'RootRecord documentation',
    'treasury operations',
    'tokenomics',
    'liquidity schedule',
    'ecosystem pool',
  ],

  /** /dashboard hub */
  hubNav: [
    'Solana tools hub',
    'token toolkit',
    'wallet snapshot',
  ],
} as const;

export type SeoKeywordBucket = keyof typeof SEO_KEYWORDS;

/** Lowercase dedupe; preserves first spelling. */
export function flattenSeoKeywordBuckets(
  ...chunks: ReadonlyArray<readonly string[] | undefined>
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const chunk of chunks) {
    if (!chunk) continue;
    for (const raw of chunk) {
      const k = raw.trim();
      if (!k) continue;
      const lower = k.toLowerCase();
      if (seen.has(lower)) continue;
      seen.add(lower);
      out.push(k);
    }
  }
  return out;
}

/** Merge named buckets for route-level `keywords` metadata. */
export function pickSeoKeywords(...buckets: SeoKeywordBucket[]): string[] {
  return flattenSeoKeywordBuckets(...buckets.map((b) => [...SEO_KEYWORDS[b]]));
}

/** Full merged list for root layout + homepage (all product SEO phrases). */
export const SEO_MASTER_KEYWORDS = pickSeoKeywords(
  ...(Object.keys(SEO_KEYWORDS) as SeoKeywordBucket[]),
);

function canonicalUrl(path: string): string {
  const origin = getPublicSiteOrigin().replace(/\/$/, '');
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${origin}${p === '//' ? '/' : p}`;
}

/**
 * Consistent per-route metadata: canonical, Open Graph, Twitter, optional keywords.
 * Use a **short** `title` segment; root `layout` appends `| RootRecord Solana Tools`.
 */
export function pageSeo(opts: {
  path: string;
  title: string;
  description: string;
  keywords?: readonly string[];
  /** When true, omit from indexes (utility / auth-adjacent). */
  noindex?: boolean;
}): Metadata {
  const url = canonicalUrl(opts.path);
  const ogImage = SEO_OG_IMAGE_PATH;

  return {
    title: opts.title,
    description: opts.description,
    ...(opts.keywords?.length ? { keywords: [...opts.keywords] } : {}),
    alternates: { canonical: url },
    robots: opts.noindex
      ? { index: false, follow: true, googleBot: { index: false, follow: true } }
      : { index: true, follow: true, googleBot: { 'max-image-preview': 'large', 'max-snippet': -1 } },
    openGraph: {
      title: `${opts.title} | ${SITE_NAME}`,
      description: opts.description,
      url,
      siteName: SITE_NAME,
      type: 'website',
      locale: 'en_US',
      images: [{ url: ogImage, alt: SITE_NAME }],
    },
    twitter: {
      card: 'summary_large_image',
      site: '@rootrecord',
      creator: '@rootrecord',
      title: `${opts.title} | ${SITE_NAME}`,
      description: opts.description.slice(0, 200),
      images: [ogImage],
    },
  };
}

/** Static routes for sitemap (no dynamic `[mint]` enumeration). */
export const SEO_STATIC_PATHS: readonly string[] = [
  '/',
  '/dashboard',
  '/create',
  '/liquidity',
  '/tools',
  '/contracts',
  '/contracts/vesting',
  '/token-stats',
  '/operations',
  '/operations/docs',
  '/operations/reference',
  '/operations/ecosystem',
  '/operations/liquidity-timing',
  '/operations/tokenomics',
  '/bulk',
  '/referrals',
  '/pricing',
  '/privacy',
  '/terms',
  '/wallet-generator',
] as const;
