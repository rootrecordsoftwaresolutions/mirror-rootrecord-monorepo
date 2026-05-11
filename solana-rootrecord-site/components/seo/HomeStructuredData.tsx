import { getPublicSiteOrigin } from '@/lib/siteOrigin';

import { SEO_OG_IMAGE_PATH } from '@/lib/seo';

function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}

const FAQ_MAIN_ENTITY = [
  {
    '@type': 'Question',
    name: 'How do I create a Solana token?',
    acceptedAnswer: {
      '@type': 'Answer',
      text:
        'Go to solana.rootrecord.info, connect a wallet (Phantom, Backpack, etc.), open Create, enter token name, symbol, and decimals, then sign the deployment transaction. RootRecord never asks for your seed phrase.',
    },
  },
  {
    '@type': 'Question',
    name: 'Does RootRecord custody my tokens?',
    acceptedAnswer: {
      '@type': 'Answer',
      text:
        'No. You connect a self-custody wallet and sign transactions locally. RootRecord builds standard Solana instructions; keys stay in your wallet except optional features you explicitly enable.',
    },
  },
  {
    '@type': 'Question',
    name: 'Does this work on Solana devnet?',
    acceptedAnswer: {
      '@type': 'Answer',
      text:
        'Yes. With a devnet-capable site configuration and RPC, the same create and tool flows work on Solana devnet for testing.',
    },
  },
  {
    '@type': 'Question',
    name: 'What is Token-2022 vs standard SPL?',
    acceptedAnswer: {
      '@type': 'Answer',
      text:
        'Token-2022 is the SPL Token program extension model (transfer fees, hooks, metadata on-mint, etc.). RootRecord supports both legacy SPL with Metaplex metadata and Token-2022 mints from the create flow.',
    },
  },
  {
    '@type': 'Question',
    name: 'How much does it cost to create a token?',
    acceptedAnswer: {
      '@type': 'Answer',
      text:
        'RootRecord charges a small flat SOL platform fee per action (see Pricing), plus Solana network rent and transaction fees. There are no subscriptions.',
    },
  },
  {
    '@type': 'Question',
    name: 'Where is token image metadata stored?',
    acceptedAnswer: {
      '@type': 'Answer',
      text:
        'Optional logo and JSON metadata are pinned to IPFS via Pinata through server-side routes so secrets stay off the client.',
    },
  },
  {
    '@type': 'Question',
    name: 'Where are canonical definitions for RootRecord Solana tools?',
    acceptedAnswer: {
      '@type': 'Answer',
      text:
        'Use the Reference page at /operations/reference for dated definitions of SPL, Token-2022, Metaplex metadata, Raydium CPMM, each /tools action, bulk sends, and paper wallets, with fee context pointing to /pricing. A short machine-readable summary for crawlers is at /llms.txt.',
    },
  },
  {
    '@type': 'Question',
    name: 'Can I add Raydium CPMM liquidity from RootRecord?',
    acceptedAnswer: {
      '@type': 'Answer',
      text:
        'Yes. The Liquidity section supports creating a Raydium CPMM pool, adding or removing liquidity, and burning LP when you want to exit — you sign with your wallet and pay Raydium program costs plus a small RootRecord launch or action fee where applicable.',
    },
  },
  {
    '@type': 'Question',
    name: 'How do bulk SOL or SPL sends work?',
    acceptedAnswer: {
      '@type': 'Answer',
      text:
        'The Bulk page accepts a list of recipient addresses; RootRecord builds batched transactions for native SOL or an SPL mint you hold. Platform fee scales with the number of destinations; you also pay Solana network fees and any rent to create new recipient token accounts.',
    },
  },
];

/**
 * Home-only: SoftwareApplication + FAQPage for rich results.
 */
export function HomeStructuredData() {
  const base = getPublicSiteOrigin().replace(/\/$/, '');
  const logo = `${base}${SEO_OG_IMAGE_PATH}`;
  const walletGenUrl = `${base}/wallet-generator`;

  const faqMainEntity = [
    ...FAQ_MAIN_ENTITY,
    {
      '@type': 'Question',
      name: 'Does RootRecord have a Solana paper wallet generator?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: `Yes. Open ${walletGenUrl} for a printable tent-fold sheet with public-address and private-key QR codes, base58 text, and a short fingerprint ID. Keys are created in your browser only; the Print menu offers save ink, vivid, premium dark, and warm paper styles.`,
      },
    },
  ];

  const software = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'RootRecord Solana Tools',
    applicationCategory: 'FinanceApplication',
    operatingSystem: 'Web',
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
      description: 'Per-action SOL fees for on-chain tools; see site pricing.',
    },
    description:
      'SPL & Token-2022 token creation (Metaplex + Pinata IPFS), full /tools suite: revoke mint and freeze authority, bulk freeze or thaw ATAs, mint more, burn, update and lock Metaplex listing metadata, Token-2022 withdraw/harvest fees and transfer-fee config, Raydium CPMM create pool and add/remove liquidity, bulk native SOL and SPL sends, public token stats and referral links, cold-storage paper wallet generator.',
    url: `${base}/`,
    image: logo,
    featureList: [
      'Create SPL or Token-2022 mint with optional extensions',
      'Pinata IPFS logo and JSON metadata',
      'Revoke mint authority',
      'Revoke freeze authority',
      'Bulk freeze or thaw holder wallets and token accounts',
      'Mint additional token supply',
      'Burn SPL or Token-2022 balance',
      'Update legacy SPL Metaplex listing metadata',
      'Lock listing metadata immutable',
      'Token-2022 withdraw withheld transfer fees',
      'Token-2022 harvest withheld fees to mint',
      'Token-2022 update transfer fee configuration',
      'Raydium CPMM create pool, add liquidity, remove liquidity',
      'Bulk batched SOL sends',
      'Bulk batched SPL token sends',
      'Shareable mint dashboard with Jupiter price hint',
      'Referral program with on-chain fee share',
      'Printable Solana paper wallet with QR codes',
    ],
    provider: { '@type': 'Organization', name: 'RootRecord', url: base },
  };

  const faq = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqMainEntity,
  };

  return (
    <>
      <JsonLd data={software} />
      <JsonLd data={faq} />
    </>
  );
}
