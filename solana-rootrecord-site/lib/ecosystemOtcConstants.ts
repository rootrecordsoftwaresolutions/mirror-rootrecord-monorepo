/** Official listing SPL mint (override with NEXT_PUBLIC_ECOSYSTEM_TOKEN_MINT). */
export const ECOSYSTEM_OTC_TOKEN_MINT =
  process.env.NEXT_PUBLIC_ECOSYSTEM_TOKEN_MINT?.trim() ||
  '8hwxLN1Q4Yr8xFErErULCqNvcF1cMwGjpRXPz6DAH7gM';

/** Metaplex listing symbol — keep in sync with on-chain metadata. */
export const ECOSYSTEM_LISTING_SYMBOL = 'ROOTS';

/**
 * Symbol shown for earn-program / custodial rewards in Account UI and related wallet copy.
 * Listing OTC and tokenomics use {@link ECOSYSTEM_LISTING_SYMBOL} instead.
 */
export const ECOSYSTEM_EARN_REWARD_SYMBOL =
  process.env.NEXT_PUBLIC_ECOSYSTEM_EARN_REWARD_SYMBOL?.trim() || 'RRTT';

/** Metaplex listing name — keep in sync with on-chain metadata. */
export const ECOSYSTEM_LISTING_NAME = 'Root Record Software Solutions';

const DEFAULT_TREASURY_OPERATOR = '3QG6gVk3fdimzQaKX9zf7J6kCs5DRLKg1RNea3VBosDJ';

/** Treasury / operator wallet (Solscan). */
export const ECOSYSTEM_SOLSCAN_TREASURY =
  process.env.NEXT_PUBLIC_ECOSYSTEM_SOLSCAN_TREASURY?.trim() || DEFAULT_TREASURY_OPERATOR;

/**
 * Optional second explorer pubkey for “developer / ops” copy.
 * Defaults to the treasury when treasury and operator share one wallet.
 */
export const ECOSYSTEM_SOLSCAN_DEVELOPER =
  process.env.NEXT_PUBLIC_ECOSYSTEM_SOLSCAN_DEVELOPER?.trim() || DEFAULT_TREASURY_OPERATOR;

const DEFAULT_POOL_RELATED_ACCOUNTS = [
  'B5AZM1c9oPDUUY4bgyaEYNaGHbnPDXGp1qDqQeU1w9KW',
  'GjFZgWjTBi8CW2KHPgMRXpLMkyUF3squZsnRZi4jLVNV',
  'GjUnPAYqf3NQL5dDBDH2TdmgkSe53AdaXwDggxFKFryz',
] as const;

function parsePoolRelatedAccounts(): readonly string[] {
  const raw = process.env.NEXT_PUBLIC_ECOSYSTEM_POOL_RELATED_ACCOUNTS?.trim();
  if (!raw) return DEFAULT_POOL_RELATED_ACCOUNTS;
  const parts = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length ? parts : DEFAULT_POOL_RELATED_ACCOUNTS;
}

/**
 * Raydium / pool-program accounts tied to official liquidity.
 * Default list matches custodial tooling exclusions (see `freeze-new-token-accounts.mjs` in Worker repo).
 */
export const ECOSYSTEM_POOL_RELATED_ACCOUNTS: readonly string[] =
  parsePoolRelatedAccounts();

export const solscanAccount = (pubkey: string) =>
  `https://solscan.io/account/${pubkey.trim()}`;

export const solscanToken = (mint: string) => `https://solscan.io/token/${mint.trim()}`;

/**
 * USD per whole listing token when Jupiter has no USD mark (feeds down / not listed).
 * Tokenomics fallback only; live marks come from Jupiter when available.
 */
export const OTC_USD_PER_TOKEN = 0.00001;

/** Wrapped SOL mint (Jupiter price id). */
export const WSOL_MINT = 'So11111111111111111111111111111111111111112';

/** OTC pre-sale peg: USD per whole listing token (public tokenomics). */
export const OTC_PRESALE_USD_PEG = 1;

/**
 * Of the **matched** liquidity mint (equal to the buyer tranche at the peg), basis points
 * reserved to accumulate SOL for SPL transfer fees before splitting the rest across pools.
 */
export const OTC_PRESALE_MATCHED_FEE_RESERVE_BPS = 200;

/**
 * Remainder of the matched tranche after {@link OTC_PRESALE_MATCHED_FEE_RESERVE_BPS}, split
 * between USDC-quoted and SOL-quoted pool seeding (each ~49% of the original matched tranche).
 */
export const OTC_PRESALE_POOL_USDC_BPS = 4900;
export const OTC_PRESALE_POOL_SOL_BPS = 4900;

/** Public pool liquidity opens (tradable on Raydium / aggregators). UTC. */
export const PRESALE_MARKET_OPEN_AT_ISO = '2026-06-07T10:00:00.000Z' as const;

export const PRESALE_MARKET_OPEN_AT_MS = new Date(PRESALE_MARKET_OPEN_AT_ISO).getTime();

/** Human-readable open instant (UTC), aligned with countdown copy on marketing surfaces. */
export const PRESALE_MARKET_OPEN_LABEL_EN_UTC = new Date(PRESALE_MARKET_OPEN_AT_ISO).toLocaleString(
  'en-US',
  {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'UTC',
    timeZoneName: 'short',
  },
);

/**
 * Basis points of **total** token supply operators intend to mint to the developer/treasury
 * allocation **after** {@link PRESALE_MARKET_OPEN_AT_ISO} (i.e. once public pool liquidity is live).
 * Immediately afterward, documented intent is to revoke mint authority, Metaplex metadata update
 * authority, and freeze authority. Not enforced by this repo — verify authorities and supply on-chain.
 */
export const POST_MARKET_OPEN_DEVELOPER_MINT_TOTAL_SUPPLY_BPS = 2500;

/**
 * Pool vault accounts that unlock at {@link PRESALE_MARKET_OPEN_AT_ISO} (SOL vs USDC quote legs).
 * Same addresses as custodial freeze exclusions / homepage countdown.
 */
export const PRESALE_POOL_UNLOCK_SOL_ACCOUNT =
  'GjUnPAYqf3NQL5dDBDH2TdmgkSe53AdaXwDggxFKFryz';

export const PRESALE_POOL_UNLOCK_USDC_ACCOUNT =
  'B5AZM1c9oPDUUY4bgyaEYNaGHbnPDXGp1qDqQeU1w9KW';
