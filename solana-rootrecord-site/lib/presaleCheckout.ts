import {
  ComputeBudgetProgram,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js';
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  createMintToInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
  getMint,
} from '@solana/spl-token';

import {
  ECOSYSTEM_OTC_TOKEN_MINT,
  OTC_PRESALE_MATCHED_FEE_RESERVE_BPS,
  OTC_PRESALE_POOL_SOL_BPS,
  OTC_PRESALE_POOL_USDC_BPS,
  OTC_PRESALE_USD_PEG,
  PRESALE_MARKET_OPEN_AT_MS,
} from '@/lib/ecosystemOtcConstants';
import { fetchJupiterSolUsd } from '@/lib/ecosystemJupUsd';
import { getConnection } from '@/lib/solana';
import { loadListingTreasuryKeypair } from '@/lib/listingTreasury';
import {
  buildCpmmAddLiquidityVersionedTx,
  raydiumClusterFromNetwork,
} from '@/lib/presaleCheckoutRaydium';

/** Mainnet USDC (legacy SPL). Override with NEXT_PUBLIC_MAINNET_USDC_MINT. */
export const MAINNET_USDC_MINT =
  process.env.NEXT_PUBLIC_MAINNET_USDC_MINT?.trim() ||
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

const USDC_DECIMALS = 6;

export function isPresaleCheckoutActive(): boolean {
  if (process.env.NEXT_PUBLIC_PRESALE_CHECKOUT_DISABLED === 'true') return false;
  if (process.env.NEXT_PUBLIC_PRESALE_CHECKOUT_FORCE === 'true') return true;
  return Date.now() < PRESALE_MARKET_OPEN_AT_MS;
}

export function presaleMinUsd(): number {
  const n = parseFloat(process.env.PRESALE_MIN_USD ?? '1');
  return Number.isFinite(n) && n > 0 ? n : 1;
}

export function presaleMaxUsd(): number {
  const n = parseFloat(process.env.PRESALE_MAX_USD ?? '250000');
  return Number.isFinite(n) && n > 0 ? n : 250000;
}

export function rootsAmountRaw(usd: number, decimals: number): bigint {
  const peg = OTC_PRESALE_USD_PEG;
  if (!Number.isFinite(usd) || usd <= 0 || !Number.isFinite(peg) || peg <= 0) return 0n;
  const factor = 10 ** decimals;
  const raw = Math.round((usd / peg) * factor);
  if (!Number.isFinite(raw) || raw <= 0) return 0n;
  return BigInt(raw);
}

export async function getListingMintMeta(): Promise<{
  mintPk: PublicKey;
  mintDecimals: number;
  tokenProgramId: PublicKey;
}> {
  const connection = getConnection();
  const mintPk = new PublicKey(ECOSYSTEM_OTC_TOKEN_MINT.trim());
  const mintAcc = await connection.getAccountInfo(mintPk, 'confirmed');
  if (!mintAcc) throw new Error('Listing mint not found on-chain');
  const tokenProgramId = mintAcc.owner.equals(TOKEN_2022_PROGRAM_ID)
    ? TOKEN_2022_PROGRAM_ID
    : TOKEN_PROGRAM_ID;
  const mintData = await getMint(connection, mintPk, 'confirmed', tokenProgramId);
  return {
    mintPk,
    mintDecimals: mintData.decimals,
    tokenProgramId,
  };
}

export type PresaleCurrency = 'SOL' | 'USDC';

function formatRootsDisplay(raw: bigint, decimals: number): string {
  const d = BigInt(10) ** BigInt(decimals);
  const ip = raw / d;
  const fp = raw % d;
  if (fp === 0n) return ip.toString();
  const frac = fp
    .toString()
    .padStart(decimals, '0')
    .replace(/0+$/, '');
  return `${ip}.${frac}`;
}

export async function quotePresalePayment(
  usd: number,
  currency: PresaleCurrency,
): Promise<{
  roots_raw: string;
  roots_whole_display: string;
  lamports: number | null;
  usdc_raw: string | null;
  sol_usd: number;
}> {
  const { mintDecimals } = await getListingMintMeta();
  const raw = rootsAmountRaw(usd, mintDecimals);
  if (raw <= 0n) throw new Error('Invalid ROOTS amount');

  const roots_whole_display = formatRootsDisplay(raw, mintDecimals);

  const solUsd = await fetchJupiterSolUsd({ cache: 'no-store' });

  if (currency === 'SOL') {
    const lamports = Math.ceil((usd / solUsd) * LAMPORTS_PER_SOL);
    if (!Number.isFinite(lamports) || lamports <= 0) throw new Error('Invalid SOL payment amount');
    return {
      roots_raw: raw.toString(),
      roots_whole_display,
      lamports,
      usdc_raw: null,
      sol_usd: solUsd,
    };
  }

  const usdcMicro = BigInt(Math.round(usd * 10 ** USDC_DECIMALS));
  return {
    roots_raw: raw.toString(),
    roots_whole_display,
    lamports: null,
    usdc_raw: usdcMicro.toString(),
    sol_usd: solUsd,
  };
}

async function accountExists(pk: PublicKey): Promise<boolean> {
  const connection = getConnection();
  const i = await connection.getAccountInfo(pk, 'confirmed');
  return i !== null;
}

function assertMintAuthorityMatchesTreasury(
  treasuryPk: PublicKey,
  mintAuthority: PublicKey | null,
): void {
  if (!mintAuthority || !mintAuthority.equals(treasuryPk)) {
    throw new Error(
      'Mint authority must match ECOSYSTEM_OTC_TREASURY_PRIVATE_KEY pubkey — cannot sign mint.',
    );
  }
}

/** Matched tranche (same ROOTS count as buyer at peg), split for pool + fee reserve (tokenomics bps). */
function splitMatchedRootsRootsRaw(rootsRaw: bigint): {
  poolUsdc: bigint;
  poolSol: bigint;
  feeReserve: bigint;
  total: bigint;
} {
  const total = rootsRaw;
  if (total <= 0n) {
    return { poolUsdc: 0n, poolSol: 0n, feeReserve: 0n, total: 0n };
  }
  const poolUsdc = (total * BigInt(OTC_PRESALE_POOL_USDC_BPS)) / 10000n;
  const poolSol = (total * BigInt(OTC_PRESALE_POOL_SOL_BPS)) / 10000n;
  const feeReserve = (total * BigInt(OTC_PRESALE_MATCHED_FEE_RESERVE_BPS)) / 10000n;
  const remainder = total - poolUsdc - poolSol - feeReserve;
  return {
    poolUsdc,
    poolSol,
    feeReserve: feeReserve + remainder,
    total,
  };
}

/**
 * Build partially signed transaction (treasury signed); buyer signs + submits.
 */
export async function buildPresaleTransaction(opts: {
  buyer: PublicKey;
  usd: number;
  currency: PresaleCurrency;
}): Promise<{ serialized: Uint8Array; roots_raw: string }> {
  const { buyer, usd, currency } = opts;
  const connection = getConnection();
  const treasury = loadListingTreasuryKeypair();
  const treasuryPk = treasury.publicKey;

  const { mintPk, mintDecimals, tokenProgramId } = await getListingMintMeta();
  const mintData = await getMint(connection, mintPk, 'confirmed', tokenProgramId);
  assertMintAuthorityMatchesTreasury(treasuryPk, mintData.mintAuthority);

  const rootsRaw = rootsAmountRaw(usd, mintDecimals);
  if (rootsRaw <= 0n) throw new Error('Invalid purchase amount');

  const solUsd = await fetchJupiterSolUsd({ cache: 'no-store' });

  const ixs = [
    ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 50_000 }),
  ];

  const buyerRootsAta = getAssociatedTokenAddressSync(
    mintPk,
    buyer,
    false,
    tokenProgramId,
    ASSOCIATED_TOKEN_PROGRAM_ID,
  );

  if (!(await accountExists(buyerRootsAta))) {
    ixs.push(
      createAssociatedTokenAccountInstruction(
        buyer,
        buyerRootsAta,
        buyer,
        mintPk,
        tokenProgramId,
        ASSOCIATED_TOKEN_PROGRAM_ID,
      ),
    );
  }

  if (currency === 'SOL') {
    const lamports = Math.ceil((usd / solUsd) * LAMPORTS_PER_SOL);
    if (!Number.isFinite(lamports) || lamports <= 0) throw new Error('Invalid SOL payment');
    ixs.push(
      SystemProgram.transfer({
        fromPubkey: buyer,
        toPubkey: treasuryPk,
        lamports,
      }),
    );
  } else {
    const usdcMint = new PublicKey(MAINNET_USDC_MINT);
    const buyerUsdcAta = getAssociatedTokenAddressSync(
      usdcMint,
      buyer,
      false,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID,
    );
    const treasuryUsdcAta = getAssociatedTokenAddressSync(
      usdcMint,
      treasuryPk,
      false,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID,
    );

    if (!(await accountExists(buyerUsdcAta))) {
      ixs.push(
        createAssociatedTokenAccountInstruction(
          buyer,
          buyerUsdcAta,
          buyer,
          usdcMint,
          TOKEN_PROGRAM_ID,
          ASSOCIATED_TOKEN_PROGRAM_ID,
        ),
      );
    }

    const amountRaw = BigInt(Math.round(usd * 10 ** USDC_DECIMALS));
    ixs.push(
      createTransferCheckedInstruction(
        buyerUsdcAta,
        usdcMint,
        treasuryUsdcAta,
        buyer,
        amountRaw,
        USDC_DECIMALS,
        [],
        TOKEN_PROGRAM_ID,
      ),
    );
  }

  ixs.push(
    createMintToInstruction(
      mintPk,
      buyerRootsAta,
      treasuryPk,
      rootsRaw,
      [],
      tokenProgramId,
    ),
  );

  const matched = splitMatchedRootsRootsRaw(rootsRaw);
  const matchedMintTotal = matched.total;
  if (matchedMintTotal > 0n) {
    const treasuryRootsAta = getAssociatedTokenAddressSync(
      mintPk,
      treasuryPk,
      false,
      tokenProgramId,
      ASSOCIATED_TOKEN_PROGRAM_ID,
    );
    if (!(await accountExists(treasuryRootsAta))) {
      ixs.push(
        createAssociatedTokenAccountInstruction(
          buyer,
          treasuryRootsAta,
          treasuryPk,
          mintPk,
          tokenProgramId,
          ASSOCIATED_TOKEN_PROGRAM_ID,
        ),
      );
    }
    ixs.push(
      createMintToInstruction(
        mintPk,
        treasuryRootsAta,
        treasuryPk,
        matchedMintTotal,
        [],
        tokenProgramId,
      ),
    );
  }

  const wsolPool = process.env.PRESALE_CP_MM_POOL_WSOL?.trim();
  const usdcPool = process.env.PRESALE_CP_MM_POOL_USDC?.trim();
  const listingMint = ECOSYSTEM_OTC_TOKEN_MINT.trim();
  const cluster = raydiumClusterFromNetwork();
  const raydiumIxs: TransactionInstruction[] = [];
  const raydiumExtraSigners: Keypair[] = [];

  if (currency === 'SOL' && wsolPool && matched.poolSol > 0n) {
    const built = await buildCpmmAddLiquidityVersionedTx({
      connection,
      cluster,
      treasury,
      buyer,
      poolId: wsolPool,
      listingMint,
      rootsSideRaw: matched.poolSol,
      slippageBps: 300,
    });
    raydiumIxs.push(...built.instructions);
    raydiumExtraSigners.push(...built.signers);
  }
  if (currency === 'USDC' && usdcPool && matched.poolUsdc > 0n) {
    const built = await buildCpmmAddLiquidityVersionedTx({
      connection,
      cluster,
      treasury,
      buyer,
      poolId: usdcPool,
      listingMint,
      rootsSideRaw: matched.poolUsdc,
      slippageBps: 300,
    });
    raydiumIxs.push(...built.instructions);
    raydiumExtraSigners.push(...built.signers);
  }

  const { blockhash } = await connection.getLatestBlockhash('confirmed');
  const msg = new TransactionMessage({
    payerKey: buyer,
    recentBlockhash: blockhash,
    instructions: [...ixs, ...raydiumIxs],
  }).compileToV0Message();
  const tx = new VersionedTransaction(msg);
  tx.sign([treasury, ...raydiumExtraSigners]);

  return {
    serialized: tx.serialize(),
    roots_raw: rootsRaw.toString(),
  };
}
