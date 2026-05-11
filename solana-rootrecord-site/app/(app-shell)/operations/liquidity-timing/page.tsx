import Link from 'next/link';

import { ECOSYSTEM_EARN_REWARD_SYMBOL, ECOSYSTEM_LISTING_SYMBOL } from '@/lib/ecosystemOtcConstants';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

export default function LiquidityTimingPage() {
  return (
    <div className="space-y-10">
      <header className="space-y-3">
        <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Automation</div>
        <h1 className="font-display text-4xl md:text-5xl tracking-tight">Liquidity timing</h1>
        <p className="text-muted-foreground leading-relaxed max-w-2xl">
          RootRecord runs treasury checks on a <strong className="text-foreground">fixed UTC schedule</strong> so
          Raydium positions and SPL balances used for operations stay within healthy floors—without tying that work to
          when someone loads this site. Times below are all <strong className="text-foreground">UTC</strong>.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Hourly treasury checks</CardTitle>
          <CardDescription className="text-base leading-relaxed">
            Two windows each hour: first native SOL, then {ECOSYSTEM_LISTING_SYMBOL} SPL balances on the treasury.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm text-left border border-border/80 rounded-lg overflow-hidden">
            <thead className="bg-white/5 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium whitespace-nowrap">When (UTC)</th>
                <th className="px-4 py-3 font-medium">What it does</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/80 text-muted-foreground">
              <tr className="align-top">
                <td className="px-4 py-3 font-medium text-foreground whitespace-nowrap">Each hour at :00</td>
                <td className="px-4 py-3 leading-relaxed">
                  Confirms the treasury wallet holds enough <strong className="text-foreground">native SOL</strong> for
                  fees and custodial flows. If SOL is low, automation can unwind liquidity from the treasury&apos;s{' '}
                  <strong className="text-foreground">SOL-side Raydium pool</strong> (wrapped SOL leg) so lamports are
                  available for operations.
                </td>
              </tr>
              <tr className="align-top">
                <td className="px-4 py-3 font-medium text-foreground whitespace-nowrap">Each hour at :10</td>
                <td className="px-4 py-3 leading-relaxed">
                  Confirms <strong className="text-foreground">{ECOSYSTEM_LISTING_SYMBOL}</strong> on the treasury meets
                  minimum targets for earn, liquidity tooling, and operational inventory. If the leg is short, automation
                  can withdraw liquidity from the treasury&apos;s Raydium positions (see{' '}
                  <Link href="/operations/tokenomics#pools" className="text-sol-green hover:underline">
                    Tokenomics — pool-related accounts
                  </Link>
                  ) or move inventory from a designated reserve wallet when configured.
                </td>
              </tr>
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Daily earn settlement</CardTitle>
          <CardDescription className="text-base leading-relaxed">
            Separate from the hourly Raydium checks above.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-3 leading-relaxed">
          <p>
            <strong className="text-foreground">Once per day at 07:00 UTC</strong>, RootRecord attempts to move owed{' '}
            {ECOSYSTEM_EARN_REWARD_SYMBOL} from program accounting into <strong className="text-foreground">RootRecord Wallets</strong>{' '}
            on Solana and to top up a small SOL reserve on those wallets when needed. That pass covers beta / earn
            rewards—not the shape of Raydium LP in the accounts listed on{' '}
            <Link href="/operations/tokenomics" className="text-sol-green hover:underline">
              Tokenomics
            </Link>
            .
          </p>
          <p>
            Until a run succeeds on-chain, apps may still show balances as settling. RPC or treasury conditions can defer
            an individual payout.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Verify on-chain</CardTitle>
          <CardDescription className="text-base leading-relaxed">
            Explorers show live balances and txs; this page only describes intent and timing.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-3 leading-relaxed">
          <p>
            Use{' '}
            <a href="https://solscan.io" target="_blank" rel="noopener noreferrer" className="text-sol-green hover:underline">
              Solscan
            </a>{' '}
            (or your explorer) for treasury keys, pool state accounts, and reserves. For addresses and how pool-related
            accounts are documented, see{' '}
            <Link href="/operations/ecosystem" className="text-sol-green hover:underline">
              Ecosystem
            </Link>{' '}
            and{' '}
            <Link href="/operations/tokenomics" className="text-sol-green hover:underline">
              Tokenomics &amp; markets
            </Link>
            .
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
