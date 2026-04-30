/**
 * High-level program interactions. Wraps Anchor calls + PDA derivation
 * + tx signing into ergonomic functions for the UI.
 */

import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  getAccount,
  getMint,
} from "@solana/spl-token";
import { type AnchorWallet } from "@solana/wallet-adapter-react";
import {
  PROGRAM_ID,
  RPS_MINT,
  TREASURY,
  getProgram,
} from "./anchor";
import {
  configPda,
  globalStatsPda,
  poolPda,
  poolStatsPda,
  vaultPda,
  queueEntryPda,
  matchPda,
  playerStatsPda,
} from "./anchor";

// ────────── Read helpers ──────────

export async function fetchPool(
  connection: Connection,
  poolId: number
): Promise<{
  poolId: number;
  entryAmount: bigint;
  queueHead: bigint;
  queueTail: bigint;
  nextMatchId: bigint;
  vaultBalance: bigint;
} | null> {
  const program = getProgram(connection);
  try {
    const acc = await (program.account as any).pool.fetch(poolPda(poolId)[0]);
    const vault = await getAccount(connection, vaultPda(poolId)[0]);
    return {
      poolId: Number(acc.poolId),
      entryAmount: BigInt(acc.entryAmount.toString()),
      queueHead: BigInt(acc.queueHead.toString()),
      queueTail: BigInt(acc.queueTail.toString()),
      nextMatchId: BigInt(acc.nextMatchId.toString()),
      vaultBalance: vault.amount,
    };
  } catch {
    return null;
  }
}

export async function fetchGlobalStats(connection: Connection): Promise<{
  roundsPlayed: bigint;
  totalBurned: bigint;
  totalToTreasury: bigint;
  totalVolume: bigint;
} | null> {
  const program = getProgram(connection);
  try {
    const acc = await (program.account as any).globalStats.fetch(
      globalStatsPda()[0]
    );
    return {
      roundsPlayed: BigInt(acc.roundsPlayed.toString()),
      totalBurned: BigInt(acc.totalBurned.toString()),
      totalToTreasury: BigInt(acc.totalToTreasury.toString()),
      totalVolume: BigInt(acc.totalVolume.toString()),
    };
  } catch {
    return null;
  }
}

export async function fetchPlayerStats(
  connection: Connection,
  player: PublicKey
): Promise<{
  wins: number;
  losses: number;
  ties: number;
  currentStreak: number;
  bestStreak: number;
  totalWagered: bigint;
  totalWon: bigint;
} | null> {
  const program = getProgram(connection);
  try {
    const acc = await (program.account as any).playerStats.fetch(
      playerStatsPda(player)[0]
    );
    return {
      wins: Number(acc.wins),
      losses: Number(acc.losses),
      ties: Number(acc.ties),
      currentStreak: Number(acc.currentStreak),
      bestStreak: Number(acc.bestStreak),
      totalWagered: BigInt(acc.totalWagered.toString()),
      totalWon: BigInt(acc.totalWon.toString()),
    };
  } catch {
    return null;
  }
}

export async function fetchSupplyInfo(connection: Connection): Promise<{
  supply: bigint;
  decimals: number;
}> {
  const m = await getMint(connection, RPS_MINT);
  return { supply: m.supply, decimals: m.decimals };
}

// ────────── Write helpers ──────────

/**
 * Joins the pool. Reads queue state to choose joinSolo vs joinAndMatch.
 * Returns the matchId IF we matched, or null if we just queued.
 */
export async function joinPool({
  connection,
  wallet,
  poolId,
  commitment,
  sessionPubkey,
}: {
  connection: Connection;
  wallet: AnchorWallet;
  poolId: number;
  commitment: Uint8Array;
  sessionPubkey: PublicKey;
}): Promise<{ tx: string; matchId: bigint | null }> {
  const program = getProgram(connection, wallet);

  // Read pool to decide joinSolo vs joinAndMatch
  const pool = await (program.account as any).pool.fetch(poolPda(poolId)[0]);
  const head = BigInt(pool.queueHead.toString());
  const tail = BigInt(pool.queueTail.toString());
  const player = wallet.publicKey;
  const playerAta = getAssociatedTokenAddressSync(RPS_MINT, player);

  if (head === tail) {
    // Queue empty → joinSolo
    const tx = await (program.methods as any)
      .joinSolo(new (await import("@coral-xyz/anchor")).BN(poolId), Array.from(commitment), sessionPubkey)
      .accounts({
        player,
        playerTokenAccount: playerAta,
      })
      .rpc();
    return { tx, matchId: null };
  } else {
    // Queue non-empty → joinAndMatch (consumes head)
    const headEntry = await (program.account as any).queueEntry.fetch(
      queueEntryPda(poolId, Number(head))[0]
    );
    const matchId = BigInt(pool.nextMatchId.toString());
    const tx = await (program.methods as any)
      .joinAndMatch(new (await import("@coral-xyz/anchor")).BN(poolId), Array.from(commitment), sessionPubkey)
      .accounts({
        player,
        headPlayer: headEntry.player,
        playerTokenAccount: playerAta,
      })
      .rpc();
    return { tx, matchId };
  }
}

/**
 * Reveals the move via session key. Builds tx with sessionKp as fee payer + signer.
 * If both players have revealed at this point, settlement happens atomically in the same tx.
 */
export async function revealMove({
  connection,
  sessionKp,
  poolId,
  matchId,
  move,
  nonce,
  playerA,
  playerB,
}: {
  connection: Connection;
  sessionKp: Keypair;
  poolId: number;
  matchId: bigint;
  move: number;
  nonce: Uint8Array;
  playerA: PublicKey;
  playerB: PublicKey;
}): Promise<string> {
  // Build a bare-bones provider where session is the wallet
  const fakeWallet = {
    publicKey: sessionKp.publicKey,
    signTransaction: async (tx: Transaction) => {
      tx.partialSign(sessionKp);
      return tx;
    },
    signAllTransactions: async (txs: Transaction[]) => {
      txs.forEach((tx) => tx.partialSign(sessionKp));
      return txs;
    },
  } as AnchorWallet;
  const program = getProgram(connection, fakeWallet);

  const playerATok = getAssociatedTokenAddressSync(RPS_MINT, playerA);
  const playerBTok = getAssociatedTokenAddressSync(RPS_MINT, playerB);

  const tx = await (program.methods as any)
    .reveal(
      new (await import("@coral-xyz/anchor")).BN(poolId),
      new (await import("@coral-xyz/anchor")).BN(matchId.toString()),
      move,
      Array.from(nonce)
    )
    .accounts({
      signer: sessionKp.publicKey,
      mint: RPS_MINT,
      treasuryToken: TREASURY,
      playerAToken: playerATok,
      playerBToken: playerBTok,
    })
    .signers([sessionKp])
    .rpc();
  return tx;
}

export async function getCurrentNextMatchId(
  connection: Connection,
  poolId: number
): Promise<bigint> {
  const program = getProgram(connection);
  const pool = await (program.account as any).pool.fetch(poolPda(poolId)[0]);
  return BigInt(pool.nextMatchId.toString());
}

/**
 * After a reveal, waits for both reveals to land + match state = Resolved.
 * Returns the opponent's move number, or null on timeout.
 */
export async function pollMatchUntilResolved(
  connection: Connection,
  poolId: number,
  matchId: bigint,
  imSideA: boolean,
  timeoutMs = 60_000,
  intervalMs = 1500
): Promise<number | null> {
  const program = getProgram(connection);
  const start = Date.now();
  const matchAccPda = matchPda(poolId, Number(matchId))[0];
  while (Date.now() - start < timeoutMs) {
    try {
      const acc = await (program.account as any).match.fetch(matchAccPda);
      const otherReveal = imSideA ? acc.revealB : acc.revealA;
      if (otherReveal !== null && otherReveal !== undefined) {
        return Number(otherReveal);
      }
    } catch {
      // Match account closed (resolved-and-closed) — read events instead
      // For now, treat as resolved via timeout
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return null;
}

/**
 * Polls for a Match account where this user is one of the players.
 * Returns once found OR after timeoutMs.
 */
export async function pollForMatch({
  connection,
  poolId,
  player,
  startMatchId,
  timeoutMs = 60_000,
  intervalMs = 2000,
}: {
  connection: Connection;
  poolId: number;
  player: PublicKey;
  startMatchId: bigint;
  timeoutMs?: number;
  intervalMs?: number;
}): Promise<{
  matchId: bigint;
  playerA: PublicKey;
  playerB: PublicKey;
  imSideA: boolean;
} | null> {
  const program = getProgram(connection);
  const start = Date.now();
  let probe = startMatchId;
  while (Date.now() - start < timeoutMs) {
    try {
      const acc = await (program.account as any).match.fetch(
        matchPda(poolId, Number(probe))[0]
      );
      const a = new PublicKey(acc.playerA);
      const b = new PublicKey(acc.playerB);
      if (a.equals(player) || b.equals(player)) {
        return {
          matchId: probe,
          playerA: a,
          playerB: b,
          imSideA: a.equals(player),
        };
      }
      probe = probe + 1n;
    } catch {
      // No match yet at this id — wait + retry
      await new Promise((r) => setTimeout(r, intervalMs));
    }
  }
  return null;
}
