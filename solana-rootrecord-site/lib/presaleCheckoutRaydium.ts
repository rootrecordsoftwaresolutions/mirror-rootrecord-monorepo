import BN from 'bn.js';
import { Percent, Raydium, TxVersion } from '@raydium-io/raydium-sdk-v2';
import type { AddressLookupTableAccount } from '@solana/web3.js';
import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js';

import { coerceRaydiumPoolByIdList, isCpmmPoolItem } from '@/lib/raydiumCpmmLaunch';
import { SOLANA_NETWORK } from '@/lib/solana';

export function raydiumClusterFromNetwork(): 'mainnet' | 'devnet' {
  return SOLANA_NETWORK === 'devnet' ? 'devnet' : 'mainnet';
}

async function loadRaydiumForPresaleTreasury(
  connection: Connection,
  cluster: 'mainnet' | 'devnet',
  treasury: Keypair,
) {
  const signAllTransactions = async <T extends Transaction | VersionedTransaction>(
    txs: T[],
  ): Promise<T[]> => {
    for (const tx of txs) {
      if (tx instanceof VersionedTransaction) {
        tx.sign([treasury]);
      } else {
        tx.partialSign(treasury);
      }
    }
    return txs;
  };
  return Raydium.load({
    connection,
    cluster,
    owner: treasury.publicKey,
    signAllTransactions,
    /** Required for `cpmm.addLiquidity` to resolve treasury WSOL / SPL ATAs and LP rows. */
    disableLoadToken: false,
  });
}

function filterOutComputeBudget(ixs: TransactionInstruction[]): TransactionInstruction[] {
  return ixs.filter((ix) => !ix.programId.equals(ComputeBudgetProgram.programId));
}

/**
 * Decompile Raydium-built v0 txs, strip their compute budget ixs (caller sets CU), concat after presale ixs.
 */
export async function mergePresaleInstructionsWithRaydiumV0(opts: {
  connection: Connection;
  buyer: PublicKey;
  treasury: Keypair;
  presaleInstructions: TransactionInstruction[];
  raydiumTransactions: VersionedTransaction[];
}): Promise<VersionedTransaction> {
  const altByAddr = new Map<string, AddressLookupTableAccount>();
  const rayIxs: TransactionInstruction[] = [];

  for (const vtx of opts.raydiumTransactions) {
    const lookups = vtx.message.addressTableLookups ?? [];
    /** Must include one entry per lookup row — `MessageV0.resolveAddressTableLookups` iterates lookups and calls `.find` by key; omitting a failed fetch led to `undefined.toBase58()` inside web3.js. */
    const altsForDecompile: AddressLookupTableAccount[] = [];
    for (const l of lookups) {
      if (!l?.accountKey) {
        throw new Error(
          'Presale merge: Raydium v0 transaction has an address-table lookup without accountKey.',
        );
      }
      const k = l.accountKey.toBase58();
      let acc = altByAddr.get(k);
      if (!acc) {
        const res = await opts.connection.getAddressLookupTable(l.accountKey, {
          commitment: 'confirmed',
        });
        if (!res.value) {
          throw new Error(
            `Presale merge: address lookup table not found on-chain (${k}). Re-fetch the Raydium tx or check RPC/network.`,
          );
        }
        acc = res.value;
        altByAddr.set(k, acc);
      }
      altsForDecompile.push(acc);
    }
    const inner = TransactionMessage.decompile(vtx.message, {
      addressLookupTableAccounts: altsForDecompile,
    });
    rayIxs.push(...filterOutComputeBudget(inner.instructions));
  }

  const alts = [...altByAddr.values()];
  const { blockhash } = await opts.connection.getLatestBlockhash('confirmed');
  const msg = new TransactionMessage({
    payerKey: opts.buyer,
    recentBlockhash: blockhash,
    instructions: [...opts.presaleInstructions, ...rayIxs],
  })
    // We rebuild a single v0 transaction from extracted instructions; re-compiling with ALTs is optional.
    // In some environments, malformed ALT objects can trigger `undefined.toBase58()` during compile.
    // Building without ALTs trades size for reliability; if this ever exceeds limits, we'll fail with a clear compile error instead.
    .compileToV0Message();

  const tx = new VersionedTransaction(msg);
  tx.sign([opts.treasury]);
  return tx;
}

export async function buildCpmmAddLiquidityVersionedTx(opts: {
  connection: Connection;
  cluster: 'mainnet' | 'devnet';
  treasury: Keypair;
  buyer: PublicKey;
  poolId: string;
  listingMint: string;
  /** Raw listing-token amount for the pool leg (mint A or B per baseIn). */
  rootsSideRaw: bigint;
  slippageBps?: number;
}): Promise<{ instructions: TransactionInstruction[]; signers: Keypair[] }> {
  const trimmed = opts.poolId.trim();
  if (!trimmed) throw new Error('poolId empty');
  const rootsMint = opts.listingMint.trim();

  const raydium = await loadRaydiumForPresaleTreasury(opts.connection, opts.cluster, opts.treasury);
  await raydium.account.fetchWalletTokenAccounts({ forceUpdate: true });
  const list = coerceRaydiumPoolByIdList(await raydium.api.fetchPoolById({ ids: trimmed }));
  const poolInfo = list.find(isCpmmPoolItem);
  if (!poolInfo) {
    throw new Error('Presale pool: not found or not Raydium CPMM on this cluster');
  }

  const isRootsA = poolInfo.mintA.address === rootsMint;
  const isRootsB = poolInfo.mintB.address === rootsMint;
  if (!isRootsA && !isRootsB) {
    throw new Error('Presale pool: must include the listing mint as mint A or B');
  }

  if (opts.rootsSideRaw <= 0n) {
    throw new Error('Presale pool: roots deposit amount must be positive');
  }

  const bps = Math.min(2_000, Math.max(50, opts.slippageBps ?? 200));
  const slippage = new Percent(new BN(bps), new BN(10_000));
  const inputAmount = new BN(opts.rootsSideRaw.toString());
  const baseIn = isRootsA;

  const built = await raydium.cpmm.addLiquidity({
    poolInfo,
    inputAmount,
    baseIn,
    slippage,
    // Build legacy tx to avoid Raydium's v0 compile path (which has been crashing with `undefined.toBase58()`
    // inside web3.js during ALT compilation in some serverless runtimes).
    txVersion: TxVersion.LEGACY,
    payer: opts.treasury.publicKey,
    feePayer: opts.buyer,
  });

  return {
    // Use the built legacy `Transaction`'s instructions rather than the builder's instruction list.
    // The builder may contain partially-resolved metas in some environments, which later blow up
    // as `undefined.toBase58()` during compile.
    instructions: filterOutComputeBudget(built.transaction.instructions),
    signers: (built.signers ?? []).filter((s): s is Keypair => s instanceof Keypair),
  };
}
