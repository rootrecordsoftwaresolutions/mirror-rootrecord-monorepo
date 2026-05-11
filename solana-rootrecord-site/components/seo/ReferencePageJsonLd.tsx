import { getPublicSiteOrigin } from '@/lib/siteOrigin';

function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      // eslint-disable-next-line react/no-danger -- JSON-LD requires raw script
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}

/**
 * GEO: FAQ + HowTo on /operations/reference for generative engines.
 */
export function ReferencePageJsonLd() {
  const base = getPublicSiteOrigin().replace(/\/$/, '');
  const refUrl = `${base}/operations/reference`;
  const createUrl = `${base}/create`;
  const toolsUrl = `${base}/tools`;
  const pricingUrl = `${base}/pricing`;

  const faq = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: 'What is an SPL token on Solana?',
        acceptedAnswer: {
          '@type': 'Answer',
          text:
            'SPL (Solana Program Library) tokens are fungible assets issued by the SPL Token program: each mint has supply, decimals, and optional authorities (mint, freeze). RootRecord create flow can deploy legacy SPL with Metaplex-style metadata or Token-2022 mints with extensions.',
        },
      },
      {
        '@type': 'Question',
        name: 'What is Token-2022 vs legacy SPL?',
        acceptedAnswer: {
          '@type': 'Answer',
          text:
            'Token-2022 is the SPL Token program extension model on Solana (same ecosystem, additional instructions). It supports extensions such as transfer fees and hooks. RootRecord supports Token-2022 in creation and exposes Token-2022-specific tools for withheld fees and fee configuration where applicable.',
        },
      },
      {
        '@type': 'Question',
        name: 'What does “revoke mint authority” mean?',
        acceptedAnswer: {
          '@type': 'Answer',
          text:
            'Revoking mint authority sets the mint’s mint authority to null so no further tokens can be minted—often used as a trust signal. RootRecord charges a flat SOL platform fee for this on-chain action; the user’s wallet must be the current mint authority.',
        },
      },
      {
        '@type': 'Question',
        name: 'How does RootRecord price actions?',
        acceptedAnswer: {
          '@type': 'Answer',
          text:
            'RootRecord charges flat SOL fees per paid action listed at /pricing. There is no subscription. Referrals may split a configured percentage of certain fees with a referrer wallet when ?ref= is used, as described on /referrals.',
        },
      },
      {
        '@type': 'Question',
        name: 'What is Raydium CPMM in this product?',
        acceptedAnswer: {
          '@type': 'Answer',
          text:
            'Raydium’s CPMM (constant-product market maker) pools are used for liquidity features: creating pools, adding liquidity, or removing liquidity. Users pay Raydium program and network costs plus any RootRecord launch or liquidity fee shown on /pricing.',
        },
      },
      {
        '@type': 'Question',
        name: 'How do bulk SOL or SPL sends work?',
        acceptedAnswer: {
          '@type': 'Answer',
          text:
            'The Bulk tool accepts many recipient addresses and builds batched transactions. RootRecord fee scales per recipient line where applicable; users pay Solana network fees and may pay rent when new recipient token accounts are created.',
        },
      },
    ],
  };

  const howTo = {
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    name: 'Create an SPL or Token-2022 token with RootRecord Solana Tools',
    description:
      'High-level steps to launch a mint using the RootRecord web create flow on Solana.',
    totalTime: 'PT15M',
    step: [
      {
        '@type': 'HowToStep',
        position: 1,
        name: 'Open Create',
        text: `Go to ${createUrl} in a modern browser.`,
      },
      {
        '@type': 'HowToStep',
        position: 2,
        name: 'Connect wallet',
        text:
          'Connect a Solana wallet that will pay fees and sign transactions (self-custody).',
      },
      {
        '@type': 'HowToStep',
        position: 3,
        name: 'Choose SPL or Token-2022',
        text:
          'Select legacy SPL with Metaplex metadata or Token-2022 with desired extensions; fill name, symbol, supply, and decimals.',
      },
      {
        '@type': 'HowToStep',
        position: 4,
        name: 'Optional media and metadata',
        text:
          'Upload logo and metadata when Pinata/IPFS is configured; metadata is pinned server-side where applicable.',
      },
      {
        '@type': 'HowToStep',
        position: 5,
        name: 'Sign and confirm',
        text:
          'Approve the transaction in your wallet; verify the mint address on an explorer. See live platform fees on /pricing before signing.',
        url: pricingUrl,
      },
      {
        '@type': 'HowToStep',
        position: 6,
        name: 'Post-create tooling',
        text: `Use ${toolsUrl} for authorities, metadata edits, Token-2022 fee tools, liquidity, or bulk sends as needed.`,
      },
    ],
  };

  const webPage = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    '@id': `${refUrl}#webpage`,
    name: 'Reference — Solana definitions & RootRecord product pillars',
    url: refUrl,
    description:
      'Canonical definitions for SPL, Token-2022, Metaplex metadata, Raydium CPMM usage, bulk sends, and RootRecord fee context.',
    isPartOf: {
      '@type': 'WebSite',
      name: 'RootRecord Solana Tools',
      url: `${base}/`,
    },
  };

  return (
    <>
      <JsonLd data={webPage} />
      <JsonLd data={faq} />
      <JsonLd data={howTo} />
    </>
  );
}
