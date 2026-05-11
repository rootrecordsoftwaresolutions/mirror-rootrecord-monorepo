import type { Metadata } from 'next';
import Link from 'next/link';

import { ReferencePageJsonLd } from '@/components/seo/ReferencePageJsonLd';
import { flattenSeoKeywordBuckets, pageSeo, pickSeoKeywords } from '@/lib/seo';
import { BULK_FEE_PER_ADDRESS_SOL } from '@/lib/bulkSol';
import {
  ACTION_FEE_SOL,
  ADD_LIQUIDITY_FEE_SOL,
  CREATE_FEE_SOL,
  FREEZE_THAW_FEE_PER_ADDRESS_SOL,
  LAUNCH_FEE_SOL,
  RAYDIUM_MAINNET_CPMM_POOL_CREATE_FEE_SOL,
  REMOVE_LIQUIDITY_FEE_SOL,
} from '@/lib/solana';

const AS_OF = 'May 2026';
const CHAIN = 'Solana mainnet (devnet when your deployment and RPC support it)';

function fee(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0 SOL';
  return `${n.toFixed(6).replace(/\.?0+$/, '')} SOL`;
}

export const metadata: Metadata = pageSeo({
  path: '/operations/reference',
  title: 'Reference — definitions & product pillars',
  description: `Authoritative definitions for ${AS_OF}: SPL, Token-2022, Metaplex metadata, Raydium CPMM, RootRecord /tools actions, bulk sends, paper wallets, and live fee context (see /pricing).`,
  keywords: flattenSeoKeywordBuckets(
    pickSeoKeywords('core', 'toolActions', 'createMint', 'ipfsMetadata', 'raydiumLiquidity', 'bulkSends', 'paperWallet', 'pricingFees', 'operationsWiki'),
    [
      'Generative Engine Optimization',
      'GEO',
      'SPL token definition',
      'Token-2022 definition',
      'Metaplex metadata',
    ],
  ),
});

export default function OperationsReferencePage() {
  const poolSetupHint = `~${RAYDIUM_MAINNET_CPMM_POOL_CREATE_FEE_SOL.toFixed(2)} SOL Raydium program + network (order of magnitude)`;

  return (
    <>
      <ReferencePageJsonLd />
      <article className="container max-w-3xl py-14 md:py-20 space-y-16">
        <header className="space-y-4 border-b border-border/60 pb-10">
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">GEO · Reference</p>
          <h1 className="font-display text-4xl md:text-5xl tracking-tight">
            Solana definitions &amp; RootRecord product pillars
          </h1>
          <p className="text-muted-foreground leading-relaxed">
            Plain-language definitions for AI summaries and citations. Scope: <strong className="text-foreground">{CHAIN}</strong>.
            Fee amounts cited below match the shipped web configuration as of <strong className="text-foreground">{AS_OF}</strong>; always verify live numbers on{' '}
            <Link href="/pricing" className="text-sol-green hover:underline">
              Pricing
            </Link>{' '}
            before signing transactions.
          </p>
        </header>

        <section id="spl-token" aria-labelledby="h-spl">
          <h2 id="h-spl" className="font-display text-2xl md:text-3xl tracking-tight scroll-mt-24">
            Pillar 1 — SPL token (legacy program)
          </h2>
          <div className="mt-6 space-y-4 text-muted-foreground leading-relaxed">
            <h3 className="text-lg font-medium text-foreground">Definition</h3>
            <p>
              An <strong className="text-foreground">SPL token</strong> is a fungible asset minted under Solana&apos;s SPL Token program.
              Each mint has decimals, current supply, and optional authorities: typically <strong className="text-foreground">mint authority</strong>{' '}
              (who may inflate supply) and <strong className="text-foreground">freeze authority</strong> (who may freeze holder token accounts).
            </p>
            <h3 className="text-lg font-medium text-foreground pt-2">RootRecord surface</h3>
            <p>
              <Link href="/create" className="text-sol-green hover:underline">
                Create
              </Link>{' '}
              can deploy a legacy SPL mint with Metaplex-compatible listing metadata (name, symbol, logo/JSON via Pinata IPFS when configured).
              Platform fee for create is <strong className="text-foreground font-mono">{fee(CREATE_FEE_SOL)}</strong> plus Solana network rent and signatures (see{' '}
              <Link href="/pricing" className="text-sol-green hover:underline">
                /pricing
              </Link>
              ).
            </p>
            <h3 className="text-lg font-medium text-foreground pt-2">Limitations</h3>
            <ul className="list-disc pl-5 space-y-2">
              <li>Metaplex metadata fields and update rules follow on-chain program constraints; not every edge case is exposed in the UI.</li>
              <li>RootRecord does not custody signing keys; your wallet must hold the relevant authority.</li>
            </ul>
          </div>
        </section>

        <section id="token-2022" aria-labelledby="h-t22">
          <h2 id="h-t22" className="font-display text-2xl md:text-3xl tracking-tight scroll-mt-24">
            Pillar 2 — Token-2022 (extensions)
          </h2>
          <div className="mt-6 space-y-4 text-muted-foreground leading-relaxed">
            <h3 className="text-lg font-medium text-foreground">Definition</h3>
            <p>
              <strong className="text-foreground">Token-2022</strong> refers to SPL Token functionality under the Token-2022 program on Solana, including optional{' '}
              <strong className="text-foreground">extensions</strong> (e.g. transfer fees). Instructions and accounts differ from legacy SPL; tooling must target the correct program and mint type.
            </p>
            <h3 className="text-lg font-medium text-foreground pt-2">RootRecord surface</h3>
            <p>
              Create supports Token-2022 mint paths where enabled.{' '}
              <Link href="/tools" className="text-sol-green hover:underline">
                Tools
              </Link>{' '}
              includes Token-2022-specific flows such as withdrawing withheld transfer fees, harvesting withheld amounts toward the mint, and updating transfer fee configuration (effective after epoch delays per on-chain rules).
              Typical paid tool fee: <strong className="text-foreground font-mono">{fee(ACTION_FEE_SOL)}</strong> per applicable action unless listed otherwise on{' '}
              <Link href="/pricing" className="text-sol-green hover:underline">
                /pricing
              </Link>
              .
            </p>
            <h3 className="text-lg font-medium text-foreground pt-2">Limitations</h3>
            <ul className="list-disc pl-5 space-y-2">
              <li>Some Metaplex listing flows are framed as legacy SPL in the UI; Token-2022 metadata shapes may differ—confirm on-chain with an explorer.</li>
              <li>Fee configuration changes may require waiting epochs before taking effect (protocol rule, not RootRecord-specific).</li>
            </ul>
          </div>
        </section>

        <section id="tools-authorities" aria-labelledby="h-tools">
          <h2 id="h-tools" className="font-display text-2xl md:text-3xl tracking-tight scroll-mt-24">
            Pillar 3 — Token management (<code className="text-sm font-mono text-sol-green">/tools</code>)
          </h2>
          <div className="mt-6 space-y-4 text-muted-foreground leading-relaxed">
            <h3 className="text-lg font-medium text-foreground">Definitions</h3>
            <ul className="list-disc pl-5 space-y-3">
              <li>
                <strong className="text-foreground">Revoke mint authority:</strong> instruction that removes mint authority so supply cannot increase—often marketed as &quot;rug protection&quot; signaling.
              </li>
              <li>
                <strong className="text-foreground">Revoke freeze authority:</strong> removes ability to freeze holder accounts under that mint.
              </li>
              <li>
                <strong className="text-foreground">Bulk freeze / thaw:</strong> applies freeze or thaw to many associated token accounts (ATAs) or raw token accounts for a mint; RootRecord charges{' '}
                <strong className="text-foreground font-mono">{fee(FREEZE_THAW_FEE_PER_ADDRESS_SOL)}</strong> per account affected in the signed batch where applicable.
              </li>
              <li>
                <strong className="text-foreground">Mint more / burn:</strong> increase or decrease circulating supply from a wallet that has rights (mint authority for mint-more; burn reduces your balance).
              </li>
              <li>
                <strong className="text-foreground">Update / lock listing metadata (legacy SPL):</strong> Metaplex-oriented listing edits or immutability when authorities still allow updates.
              </li>
            </ul>
            <p className="pt-2">
              Most paid actions use <strong className="text-foreground font-mono">{fee(ACTION_FEE_SOL)}</strong> unless otherwise stated on{' '}
              <Link href="/pricing" className="text-sol-green hover:underline">
                /pricing
              </Link>
              . Burning listed as free beyond network cost where applicable.
            </p>
          </div>
        </section>

        <section id="raydium-cpmm" aria-labelledby="h-ray">
          <h2 id="h-ray" className="font-display text-2xl md:text-3xl tracking-tight scroll-mt-24">
            Pillar 4 — Raydium CPMM liquidity (<code className="text-sm font-mono text-sol-green">/liquidity</code>)
          </h2>
          <div className="mt-6 space-y-4 text-muted-foreground leading-relaxed">
            <h3 className="text-lg font-medium text-foreground">Definition</h3>
            <p>
              <strong className="text-foreground">Raydium CPMM</strong> pools are constant-product style pools used on Solana for swaps and liquidity provision.
              Creating a pool, depositing liquidity, or withdrawing liquidity invokes Raydium&apos;s programs and incurs their fees plus Solana network costs.
            </p>
            <h3 className="text-lg font-medium text-foreground pt-2">RootRecord surface</h3>
            <p>
              Users can create pools, add liquidity, or remove liquidity through the Liquidity UI. RootRecord launch fee for pool creation (as configured):{' '}
              <strong className="text-foreground font-mono">{fee(LAUNCH_FEE_SOL)}</strong> in the same signed transaction context as creation; Raydium&apos;s pool-creation cost on mainnet is on the order of{' '}
              <strong className="text-foreground">{poolSetupHint}</strong>. Add liquidity fee <strong className="text-foreground font-mono">{fee(ADD_LIQUIDITY_FEE_SOL)}</strong>; remove liquidity fee{' '}
              <strong className="text-foreground font-mono">{fee(REMOVE_LIQUIDITY_FEE_SOL)}</strong> — verify on{' '}
              <Link href="/pricing" className="text-sol-green hover:underline">
                /pricing
              </Link>
              .
            </p>
            <h3 className="text-lg font-medium text-foreground pt-2">Limitations</h3>
            <ul className="list-disc pl-5 space-y-2">
              <li>Liquidity provision is not risk-free; impermanent loss and smart-contract risk apply.</li>
              <li>Exact Raydium fees are determined by on-chain programs at execution time.</li>
            </ul>
          </div>
        </section>

        <section id="bulk-sends" aria-labelledby="h-bulk">
          <h2 id="h-bulk" className="font-display text-2xl md:text-3xl tracking-tight scroll-mt-24">
            Pillar 5 — Bulk SOL &amp; SPL sends (<code className="text-sm font-mono text-sol-green">/bulk</code>)
          </h2>
          <div className="mt-6 space-y-4 text-muted-foreground leading-relaxed">
            <h3 className="text-lg font-medium text-foreground">Definition</h3>
            <p>
              <strong className="text-foreground">Bulk send</strong> means sending native SOL or an SPL token to many destination addresses using batched transactions to reduce manual signing overhead.
              Recipients may need associated token accounts created (rent) if they do not already exist.
            </p>
            <p className="pt-2">
              Platform fee per recipient line (as configured):{' '}
              <strong className="text-foreground font-mono">{fee(BULK_FEE_PER_ADDRESS_SOL)}</strong> — confirm on{' '}
              <Link href="/pricing" className="text-sol-green hover:underline">
                /pricing
              </Link>
              .
            </p>
          </div>
        </section>

        <section id="paper-wallet" aria-labelledby="h-paper">
          <h2 id="h-paper" className="font-display text-2xl md:text-3xl scroll-mt-24">
            Pillar 6 — Paper wallet generator (<code className="text-sm font-mono text-sol-green">/wallet-generator</code>)
          </h2>
          <div className="mt-6 space-y-4 text-muted-foreground leading-relaxed">
            <h3 className="text-lg font-medium text-foreground">Definition</h3>
            <p>
              A <strong className="text-foreground">paper wallet</strong> here means a browser-generated Solana keypair printed as QR codes and text for offline storage.
              RootRecord&apos;s generator does not implement BIP-39 HD derivation by default; it produces a standard random keypair suitable for import into wallets that accept raw secret keys.
            </p>
            <h3 className="text-lg font-medium text-foreground pt-2">Limitations</h3>
            <ul className="list-disc pl-5 space-y-2">
              <li>Physical paper can be lost or photographed; treat like cash.</li>
              <li>Keys are generated locally in the browser tab; avoid malware or extensions that scrape clipboards.</li>
            </ul>
          </div>
        </section>

        <section id="stats-referrals" aria-labelledby="h-stats">
          <h2 id="h-stats" className="font-display text-2xl md:text-3xl tracking-tight scroll-mt-24">
            Pillar 7 — Token stats &amp; referrals
          </h2>
          <div className="mt-6 space-y-4 text-muted-foreground leading-relaxed">
            <p>
              <Link href="/token-stats" className="text-sol-green hover:underline">
                Token stats
              </Link>{' '}
              exposes a public dashboard per mint (supply hints, authorities, holder snapshots, Jupiter price where available).{' '}
              <Link href="/referrals" className="text-sol-green hover:underline">
                Referrals
              </Link>{' '}
              route a configured share of certain platform fees to a referrer wallet when <span className="font-mono text-xs">?ref=</span> is present—see that page for mechanics.
            </p>
          </div>
        </section>

        <footer className="border-t border-border/60 pt-10 text-sm text-muted-foreground">
          <p>
            For step-by-step usage, see{' '}
            <Link href="/operations/docs" className="text-sol-green hover:underline">
              Documentation
            </Link>
            . For machine-readable overview for crawlers, see{' '}
            <a href="/llms.txt" className="text-sol-green hover:underline">
              /llms.txt
            </a>
            .
          </p>
        </footer>
      </article>
    </>
  );
}
