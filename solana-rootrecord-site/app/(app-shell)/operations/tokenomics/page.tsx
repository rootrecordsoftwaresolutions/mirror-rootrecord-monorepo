import type { Metadata } from 'next';
import Link from 'next/link';

import {
  ECOSYSTEM_EARN_REWARD_SYMBOL,
  ECOSYSTEM_LISTING_NAME,
  ECOSYSTEM_LISTING_SYMBOL,
  ECOSYSTEM_OTC_TOKEN_MINT,
  ECOSYSTEM_POOL_RELATED_ACCOUNTS,
  ECOSYSTEM_SOLSCAN_DEVELOPER,
  ECOSYSTEM_SOLSCAN_TREASURY,
  OTC_PRESALE_MATCHED_FEE_RESERVE_BPS,
  OTC_PRESALE_POOL_SOL_BPS,
  OTC_PRESALE_POOL_USDC_BPS,
  OTC_PRESALE_USD_PEG,
  POST_MARKET_OPEN_DEVELOPER_MINT_TOTAL_SUPPLY_BPS,
  PRESALE_MARKET_OPEN_AT_ISO,
  PRESALE_MARKET_OPEN_LABEL_EN_UTC,
  WSOL_MINT,
  solscanAccount,
  solscanToken,
} from '@/lib/ecosystemOtcConstants';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { PresaleMarketCountdown } from '@/components/home/PresaleMarketCountdown';
import { PresaleCheckoutClient } from '@/components/presale/PresaleCheckoutClient';
import { ListingUsdLive } from '@/components/tokenomics/ListingUsdLive';
import { flattenSeoKeywordBuckets, pageSeo, pickSeoKeywords } from '@/lib/seo';

const showSeparateDevWallet =
  ECOSYSTEM_SOLSCAN_DEVELOPER.trim() !== ECOSYSTEM_SOLSCAN_TREASURY.trim();

const BIRDEYE_TV_WIDGET_SRC = (() => {
  const mint = ECOSYSTEM_OTC_TOKEN_MINT.trim();
  const quote = WSOL_MINT.trim();
  const params = new URLSearchParams({
    chain: 'solana',
    viewMode: 'base/quote',
    chartInterval: '1',
    chartType: 'Candle',
    chartTimezone: 'Etc/UTC',
    chartLeftToolbar: 'show',
    theme: 'dark',
  });
  return `https://embed.birdeye.so/tv-widget/${mint}/${quote}?${params.toString()}`;
})();

export const metadata: Metadata = pageSeo({
  path: '/operations/tokenomics',
  title: `Tokenomics & markets — ${ECOSYSTEM_LISTING_SYMBOL}`,
  description: `${ECOSYSTEM_LISTING_NAME} (${ECOSYSTEM_LISTING_SYMBOL}): presale countdown & pool unlock (June 2026 UTC), OTC peg, mint allocation, treasury, pool accounts — descriptive, not investment advice.`,
  keywords: flattenSeoKeywordBuckets(pickSeoKeywords('core', 'operationsWiki', 'raydiumLiquidity', 'tokenDashboard'), [
    ECOSYSTEM_LISTING_SYMBOL,
    'tokenomics',
    'OTC pre-sale',
    'liquidity',
    'treasury token',
    'live price',
    'presale countdown',
  ]),
});

export default function TokenomicsPage() {
  return (
    <div className="space-y-12">
      <header className="space-y-4">
        <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
          Pools · tokenomics · markets
        </div>
        <h1 className="font-display text-4xl md:text-5xl tracking-tight">
          {ECOSYSTEM_LISTING_SYMBOL} tokenomics &amp; market context
        </h1>
        <p className="text-muted-foreground leading-relaxed max-w-3xl">
          One place for the official listing mint, treasury / operator wallet, pool-related program
          accounts RootRecord documents for {ECOSYSTEM_LISTING_NAME}, and a practical framework for
          reading markets. This page is{' '}
          <strong className="text-foreground">descriptive documentation</strong> — not a price
          target, not investment advice, and not a promise of returns. On-chain balances and prices
          change continuously; verify live state on{' '}
          <a
            href="https://solscan.io"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sol-green hover:underline"
          >
            Solscan
          </a>
          , Raydium, or your aggregator of choice.
        </p>
        <p className="text-sm text-muted-foreground">
          <Link href="#presale-market" className="text-sol-green hover:underline font-medium">
            Presale countdown &amp; pool unlock
          </Link>
          {' · '}
          <Link href="#presale-checkout" className="text-sol-green hover:underline font-medium">
            Presale checkout
          </Link>
          {' · '}
          For treasury Raydium maintenance (native SOL and {ECOSYSTEM_LISTING_SYMBOL} SPL floors), see{' '}
          <Link href="/operations/liquidity-timing" className="text-sol-green hover:underline font-medium">
            Liquidity timing
          </Link>
          . For a mint dashboard, see{' '}
          <Link href="/token-stats" className="text-sol-green hover:underline font-medium">
            Token Stats
          </Link>
          .
        </p>
      </header>

      <PresaleMarketCountdown hideTokenomicsLink />

      <section id="presale-checkout" className="scroll-mt-24">
        <PresaleCheckoutClient />
      </section>

      <div className="grid scroll-mt-24 gap-8 lg:grid-cols-2 lg:items-start">
        <Card id="otc-presale" className="border-sol-green/40 lg:min-w-0">
        <CardHeader>
          <CardTitle className="text-xl md:text-2xl">OTC pre-sale</CardTitle>
          <CardDescription className="leading-relaxed text-base">
            Primary allocation mechanics for early supporters: fixed USD peg, mint-based fulfillment (no inventory
            transfer), and paired liquidity seeding. Buyer allocations are minted to normal unlocked token accounts.
            This section describes operator intent for the current program — not a binding contract, not investment
            advice, and not an offer to sell securities in any jurisdiction.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-6 leading-relaxed">
          <section className="space-y-3">
            <h2 className="text-base font-semibold text-foreground">Price &amp; payment</h2>
            <p>
              Each whole <strong className="text-foreground">{ECOSYSTEM_LISTING_SYMBOL}</strong> token is offered at a{' '}
              <strong className="text-foreground">${OTC_PRESALE_USD_PEG.toFixed(2)} USD</strong> reference peg for this
              pre-sale. Payment is accepted in <strong className="text-foreground">native SOL</strong> or{' '}
              <strong className="text-foreground">USDC</strong>. The USD value of SOL at settlement follows the same
              pricing sources operators use for treasury accounting (typically a short-lived Jupiter / index-style USD
              mark at execution time — confirm in your purchase instructions).
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-semibold text-foreground">Mint, don&apos;t transfer</h2>
            <p>
              Buyer allocations are <strong className="text-foreground">minted</strong> by the mint authority — existing
              treasury inventory is not simply moved from an operator wallet. Net new supply increases by the amounts
              below for each filled subscription.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-semibold text-foreground">Allocation (matched mint + pools)</h2>
            <p>
              For each purchase at the peg, total mint is structured as{' '}
              <strong className="text-foreground">buyer tokens + an equal matched tranche</strong> for liquidity and
              operations. Example at <strong className="text-foreground">$100</strong> notion (
              <strong className="text-foreground">100 {ECOSYSTEM_LISTING_SYMBOL}</strong> to the buyer at{' '}
              ${OTC_PRESALE_USD_PEG}/token):
            </p>
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm text-left">
                <thead className="bg-white/5 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Destination</th>
                    <th className="px-4 py-3 font-medium text-right whitespace-nowrap">{ECOSYSTEM_LISTING_SYMBOL}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/80">
                  <tr>
                    <td className="px-4 py-3 text-foreground">Buyer ATA (minted, transferable)</td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-foreground align-top">100</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3">
                      USDC-quoted pool seed (minted + paired with quote inventory from proceeds)
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-foreground">49</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3">
                      SOL-quoted pool seed (minted + paired with quote inventory from proceeds)
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-foreground">49</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3">
                      SOL reserve for SPL transfer fees ({OTC_PRESALE_MATCHED_FEE_RESERVE_BPS / 100}% of matched tranche)
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-foreground">2</td>
                  </tr>
                  <tr className="bg-white/[0.04] font-medium text-foreground">
                    <td className="px-4 py-3">Total minted in example</td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums">200</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="text-xs">
              The <strong className="text-foreground">matched tranche</strong> (100 tokens in the example) routes{' '}
              <strong className="text-foreground">{OTC_PRESALE_MATCHED_FEE_RESERVE_BPS / 100}%</strong> (
              {OTC_PRESALE_MATCHED_FEE_RESERVE_BPS} bps) to accumulating SOL so ongoing mint-and-transfer operations keep
              enough lamports for network fees. The remainder splits{' '}
              <strong className="text-foreground">
                {OTC_PRESALE_POOL_USDC_BPS / 100}% / {OTC_PRESALE_POOL_SOL_BPS / 100}%
              </strong>{' '}
              toward USDC- and SOL-quoted liquidity seeding ({OTC_PRESALE_POOL_USDC_BPS} / {OTC_PRESALE_POOL_SOL_BPS}{' '}
              bps of the matched tranche respectively in the illustration above).
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-semibold text-foreground">Quote-side balancing (SOL vs USDC)</h2>
            <p>
              Proceeds are deployed alongside the minted {ECOSYSTEM_LISTING_SYMBOL} into the two pool rails. If the buyer
              pays entirely in <strong className="text-foreground">USDC</strong>, operators swap roughly{' '}
              <strong className="text-foreground">half</strong> of that USDC into SOL (or otherwise rebalance) so both
              the USDC- and SOL-quoted legs can be funded for deposit. If they pay entirely in{' '}
              <strong className="text-foreground">SOL</strong>, the mirror applies: swap roughly half into USDC for the
              stable-quoted side before seeding. Exact swap paths and timing are operational — Jupiter or similar
              routing is typical.
            </p>
          </section>

          <section className="space-y-2 rounded-lg border border-border/80 bg-white/[0.03] p-4 text-xs">
            <p className="font-medium text-foreground">Participation</p>
            <p>
              When the presale window is open, use{' '}
              <Link href="#presale-checkout" className="text-sol-green hover:underline font-medium">
                presale checkout
              </Link>{' '}
              above for wallet-based SOL or USDC payment (mint settles in one transaction). Otherwise, OTC subscriptions
              are arranged directly with RootRecord operators and may require KYC / eligibility checks depending on
              jurisdiction.
            </p>
          </section>
        </CardContent>
      </Card>

        <div id="birdeye-tv" className="scroll-mt-24 lg:min-w-0">
          <div className="rounded-xl border border-border bg-black/30 p-3 md:p-4">
            <p className="mb-3 text-xs text-muted-foreground">
              Live chart — <strong className="text-foreground">{ECOSYSTEM_LISTING_SYMBOL}</strong> / SOL (
              <span className="font-mono text-[11px] text-foreground/80">{ECOSYSTEM_OTC_TOKEN_MINT.trim()}</span>
              ). Embedded via{' '}
              <a
                href="https://birdeye.so"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sol-green hover:underline"
              >
                Birdeye
              </a>
              ; third-party interface — verify prices against your venues.
            </p>
            <div className="overflow-hidden rounded-lg border border-border/80 bg-black/40">
              <iframe
                title={`${ECOSYSTEM_LISTING_SYMBOL} price chart (Birdeye)`}
                width="100%"
                height={600}
                src={BIRDEYE_TV_WIDGET_SRC}
                className="block min-h-[400px] w-full border-0 md:min-h-[600px]"
                allowFullScreen
              />
            </div>
          </div>
        </div>
      </div>

      <Card id="pools" className="scroll-mt-24">
        <CardHeader>
          <CardTitle className="text-xl md:text-2xl">Pool-related accounts</CardTitle>
          <CardDescription className="leading-relaxed text-base">
            These mainnet accounts are tied to official liquidity infrastructure for{' '}
            {ECOSYSTEM_LISTING_SYMBOL}. They are <strong className="text-foreground">not</strong> the
            SPL mint address (see mint section below). Internal custodial scripts default to excluding
            them from certain holder-based passes — same list as freeze/sweep tooling in the Worker
            repo.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm text-left">
              <thead className="bg-white/5 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Account</th>
                  <th className="px-4 py-3 font-medium whitespace-nowrap">Solscan</th>
                  <th className="px-4 py-3 font-medium min-w-[12rem]">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/80 text-muted-foreground">
                {ECOSYSTEM_POOL_RELATED_ACCOUNTS.map((pubkey) => (
                  <tr key={pubkey} className="align-top">
                    <td className="px-4 py-3 font-mono text-xs text-foreground break-all">{pubkey}</td>
                    <td className="px-4 py-3">
                      <a
                        href={solscanAccount(pubkey)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono text-xs text-sol-green hover:underline break-all"
                      >
                        Open
                      </a>
                    </td>
                    <td className="px-4 py-3 leading-relaxed">
                      Pool or vault-style account on mainnet; confirm labels and balances in the explorer
                      before signing transactions that touch program-owned state.
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground border-t border-border/60 pt-4">
            Treasury automation that maintains native SOL and {ECOSYSTEM_LISTING_SYMBOL} inventory runs on the
            schedule in{' '}
            <Link href="/operations/liquidity-timing" className="text-sol-green hover:underline">
              Liquidity timing
            </Link>
            .
          </p>
          <p className="text-xs text-muted-foreground">
            Trade or add liquidity through{' '}
            <a
              href="https://raydium.io/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sol-green hover:underline"
            >
              Raydium
            </a>{' '}
            or an aggregator such as{' '}
            <a
              href="https://jup.ag/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sol-green hover:underline"
            >
              Jupiter
            </a>
            . Always confirm the pool program, mints, and fee tier in the wallet preview before you sign.
          </p>
        </CardContent>
      </Card>

      <Card id="tokenomics" className="scroll-mt-24">
        <CardHeader>
          <CardTitle className="text-xl md:text-2xl">Tokenomics — how the pieces fit</CardTitle>
          <CardDescription className="leading-relaxed text-base">
            High-level map of supply, fees, and treasury. Treat explorer data as the source of truth for live balances.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-8 leading-relaxed">
          <section className="space-y-3" id="mint-and-symbol">
            <h2 className="text-base font-semibold text-foreground">Mint &amp; listing</h2>
            <p>
              <strong className="text-foreground">{ECOSYSTEM_LISTING_NAME}</strong> trades under the symbol{' '}
              <strong className="text-foreground">{ECOSYSTEM_LISTING_SYMBOL}</strong>. The SPL mint address
              (Metaplex metadata + SPL supply) is:
            </p>
            <p>
              <a
                href={solscanToken(ECOSYSTEM_OTC_TOKEN_MINT)}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-xs text-sol-green hover:underline break-all"
              >
                {ECOSYSTEM_OTC_TOKEN_MINT}
              </a>
            </p>
            <p>
              Total supply, decimals, and authorities (mint / freeze) are defined on-chain. Use Solscan or the{' '}
              <Link href="/token-stats" className="text-sol-green hover:underline">
                Token Stats
              </Link>{' '}
              flow for a snapshot; this page does not cache supply.
            </p>
          </section>

          <section className="space-y-3 rounded-lg border border-border/80 bg-white/[0.03] p-4 md:p-5" id="post-open-supply-lock">
            <h2 className="text-base font-semibold text-foreground">After market open — final mint &amp; authority sunset</h2>
            <p>
              Once the presale period ends and{' '}
              <strong className="text-foreground">public pool liquidity is live</strong> (documented unlock:{' '}
              <time dateTime={PRESALE_MARKET_OPEN_AT_ISO} className="text-foreground/90">
                {PRESALE_MARKET_OPEN_LABEL_EN_UTC}
              </time>
              ), operator intent is for the developer to mint a final{' '}
              <strong className="text-foreground">
                {POST_MARKET_OPEN_DEVELOPER_MINT_TOTAL_SUPPLY_BPS / 100}%
              </strong>{' '}
              of <strong className="text-foreground">total supply</strong> to the documented treasury / operator
              allocation, then to{' '}
              <strong className="text-foreground">revoke mint authority</strong>,{' '}
              <strong className="text-foreground">revoke Metaplex metadata update authority</strong> (lock on-chain
              listing metadata), and <strong className="text-foreground">revoke freeze authority</strong>. That sequence
              is <strong className="text-foreground">descriptive intent</strong> — not a smart-contract guarantee from
              this website. Always confirm current minted supply and whether authorities are null in the explorer or{' '}
              <Link href="/token-stats" className="text-sol-green hover:underline">
                Token Stats
              </Link>{' '}
              before relying on it.
            </p>
          </section>

          <section className="space-y-3" id="fees-and-treasury">
            <h2 className="text-base font-semibold text-foreground">Fees, treasury, and LP routing</h2>
            <p>
              RootRecord Solana Tools charge small <strong className="text-foreground">platform fees</strong> on paid
              actions (token creation, authority changes, Raydium liquidity helpers, bulk transfers where applicable,
              and similar). Those flows are designed to stay inexpensive per action while aligning long-term value with
              continued use of the tooling.
            </p>
            <p>
              Proceeds and inventory concentrate in the{' '}
              <a
                href={solscanAccount(ECOSYSTEM_SOLSCAN_TREASURY)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sol-green hover:underline font-medium"
              >
                treasury / operator wallet
              </a>{' '}
              <span className="font-mono text-xs text-foreground/80">({ECOSYSTEM_SOLSCAN_TREASURY})</span>, which funds
              distributions, reserves, and programmatic liquidity adds according to operator policy — not a single
              hard-coded loop you can infer from the front-end alone.
            </p>
            {showSeparateDevWallet ? (
              <p>
                The{' '}
                <a
                  href={solscanAccount(ECOSYSTEM_SOLSCAN_DEVELOPER)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sol-green hover:underline font-medium"
                  >
                  developer / operations wallet
                </a>{' '}
                <span className="font-mono text-xs text-foreground/80">({ECOSYSTEM_SOLSCAN_DEVELOPER})</span> is
                documented for transparency. Verify current behavior on-chain rather than trusting prose.
              </p>
            ) : null}
          </section>

          <section className="space-y-3" id="listing-live-price">
            <ListingUsdLive />
          </section>

          <section className="space-y-3" id="referrals">
            <h2 className="text-base font-semibold text-foreground">Referrals</h2>
            <p>
              The site supports referral links (<code className="text-xs font-mono text-foreground/90">?ref=</code>) so
              a share of certain platform fees can be routed to a referrer in the same transaction, per deployment
              settings. See{' '}
              <Link href="/referrals" className="text-sol-green hover:underline">
                Referrals
              </Link>{' '}
              for mechanics.
            </p>
          </section>

          <section className="space-y-3" id="custodial-settlement">
            <h2 className="text-base font-semibold text-foreground">Earn rewards → RootRecord Wallet (daily UTC)</h2>
            <p>
              Beta / earn-program credits ({ECOSYSTEM_EARN_REWARD_SYMBOL}) are reconciled into{' '}
              <strong className="text-foreground">RootRecord Wallets</strong> (custodial on Solana) by a scheduled job
              that runs <strong className="text-foreground">once per calendar day at 07:00 UTC</strong>. In that pass
              the treasury can send owed whole-token units to each custodial SPL account and add SOL lamports when the
              custodial account is below the fee-reserve floor — so operator-sponsored flows stay viable.
            </p>
            <p>
              That timing is <strong className="text-foreground">not</strong> the same as app session accounting: you
              may see &quot;still settling&quot; in{' '}
              <Link href="/account" className="text-sol-green hover:underline">
                Account
              </Link>{' '}
              until the next successful on-chain batch. Failures (RPC, treasury balance, account state) can skip or
              defer an individual payout until a later run. The same automation can be invoked manually by operators for
              maintenance; the public routine remains 07:00 UTC unless infra config changes.
            </p>
          </section>
        </CardContent>
      </Card>

      <Card id="market-analysis" className="scroll-mt-24">
        <CardHeader>
          <CardTitle className="text-xl md:text-2xl">Market analysis — how to read this setup</CardTitle>
          <CardDescription className="leading-relaxed text-base">
            A framework for thinking about {ECOSYSTEM_LISTING_SYMBOL} across venues, without pretending this site streams
            live order books.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-8 leading-relaxed">
          <section className="space-y-3">
            <h2 className="text-base font-semibold text-foreground">One token, several books</h2>
            <p>
              The same {ECOSYSTEM_LISTING_SYMBOL} may appear in more than one AMM or pool over time. Each venue is its own
              <em> book</em> (plus program-specific mechanics), so implied prices vs SOL, stablecoins, or other quotes can
              differ slightly at the same timestamp after fees and curve shape. Cross-venue gaps are normal: they are
              the fuel for arbitrage and aggregator routing.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-semibold text-foreground">Liquidity depth vs. breadth</h2>
            <p>
              Listing on additional pairs increases <strong className="text-foreground">breadth</strong>: more wallets
              can enter or exit without first swapping through a single quote asset. It does not by itself increase{' '}
              <strong className="text-foreground">depth</strong> unless new capital actually seeds those pools.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-semibold text-foreground">What to watch on-chain</h2>
            <ul className="list-disc pl-5 space-y-2 marker:text-muted-foreground">
              <li>
                <strong className="text-foreground">Per-pool reserves</strong> — vault balances backing each pair; they
                drive immediate slippage for swaps through that pool.
              </li>
              <li>
                <strong className="text-foreground">Volume and trade count</strong> — Solscan and DEX dashboards; use
                them for activity, not for extrapolating future price.
              </li>
              <li>
                <strong className="text-foreground">Implied price vs. external USD marks</strong> — large sustained gaps
                between pools and index-style marks may attract arbitrage, subject to inventory, fees, and execution risk.
              </li>
              <li>
                <strong className="text-foreground">Concentration of LP</strong> — who holds LP tokens matters for
                governance of exit liquidity; public explorers show LP mint holders at a high level.
              </li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-semibold text-foreground">Aggregators and pathing</h2>
            <p>
              Jupiter and similar routers may split a user&apos;s trade across multiple pools and programs. A swap UI
              price is therefore an <em>effective</em> price for a specific size and path, not necessarily the mid of a
              single pool. When comparing venues, compare <strong className="text-foreground">all-in output</strong> after
              fees for the size you intend to trade.
            </p>
          </section>

          <section className="space-y-3 border-t border-border/60 pt-6" id="risks">
            <h2 className="text-base font-semibold text-foreground">Risks (non-exhaustive)</h2>
            <ul className="list-disc pl-5 space-y-2 marker:text-muted-foreground">
              <li>Smart-contract and program risk on every program touched by a transaction.</li>
              <li>
                <strong className="text-foreground">Impermanent loss</strong> for liquidity providers if relative prices
                move against their entry ratio.
              </li>
              <li>Oracle / stablecoin assumptions for stable-quoted pools (tool copy often treats USDC as $1).</li>
              <li>Regulatory and tax considerations in your jurisdiction — self responsibility.</li>
            </ul>
            <p className="text-xs pt-2">
              Nothing here is an offer to sell or solicitation to buy securities. Past or simulated flow on charts does
              not predict future results.
            </p>
          </section>
        </CardContent>
      </Card>
    </div>
  );
}
