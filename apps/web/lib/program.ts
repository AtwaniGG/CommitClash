/**
 * High-level program interactions. Wraps Anchor calls + PDA derivation
 * + tx signing into ergonomic functions for the UI.
 */

import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
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
  solConfigPda,
  solGlobalStatsPda,
  solPoolPda,
  solPoolStatsPda,
  solVaultPda,
  solQueueEntryPda,
  solMatchPda,
  solPlayerStatsPda,
  SOL_TREASURY,
  SOL_BURN_WALLET,
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
 *
 * Retries up to 3 times if the queue state changes between our local read
 * and the on-chain execution (which would otherwise surface as
 * ConstraintSeeds, QueueNotEmpty, or QueueEmpty errors).
 */
export async function joinPool(args: {
  connection: Connection;
  wallet: AnchorWallet;
  poolId: number;
  commitment: Uint8Array;
  sessionPubkey: PublicKey;
}): Promise<{ tx: string; matchId: bigint | null }> {
  let lastErr: any;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await joinPoolOnce(args);
    } catch (err: any) {
      lastErr = err;
      const msg = (err?.message ?? String(err)).toLowerCase();
      const transient =
        msg.includes("constraintseeds") ||
        msg.includes("queueempty") ||
        msg.includes("queuenotempty") ||
        msg.includes("seeds constraint") ||
        msg.includes("blockhash not found");
      if (!transient) throw err;
      // Brief backoff to let chain state settle, then re-read pool state
      await new Promise((r) => setTimeout(r, 600));
    }
  }
  throw lastErr;
}

async function joinPoolOnce({
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
  const anchor = await import("@coral-xyz/anchor");

  // Re-read pool fresh on each attempt so the PDA derivation uses current state.
  const pool = await (program.account as any).pool.fetch(poolPda(poolId)[0]);
  const head = BigInt(pool.queueHead.toString());
  const tail = BigInt(pool.queueTail.toString());
  const player = wallet.publicKey;
  const playerAta = getAssociatedTokenAddressSync(RPS_MINT, player);

  // Idempotent ATA-create + session-key SOL pre-fund. Both are essential so
  // brand-new wallets and ephemeral session keys can transact.
  const ataIx = createAssociatedTokenAccountIdempotentInstruction(
    player,
    playerAta,
    player,
    RPS_MINT
  );
  const fundSessionIx = SystemProgram.transfer({
    fromPubkey: player,
    toPubkey: sessionPubkey,
    lamports: Math.round(0.001 * LAMPORTS_PER_SOL),
  });

  if (head === tail) {
    // Queue empty → joinSolo. Pass queueEntry explicitly so the seed
    // derivation is deterministic from OUR observed pool.queue_tail.
    const [queueEntryAddr] = queueEntryPda(poolId, Number(tail));
    const tx = await (program.methods as any)
      .joinSolo(
        new anchor.BN(poolId),
        Array.from(commitment),
        sessionPubkey
      )
      .accounts({
        player,
        playerTokenAccount: playerAta,
        queueEntry: queueEntryAddr,
      })
      .preInstructions([ataIx, fundSessionIx])
      .rpc();
    return { tx, matchId: null };
  } else {
    // Queue non-empty → joinAndMatch. Explicitly pass headEntry, theMatch.
    const [headEntryAddr] = queueEntryPda(poolId, Number(head));
    const headEntry = await (program.account as any).queueEntry.fetch(
      headEntryAddr
    );
    const matchId = BigInt(pool.nextMatchId.toString());
    const [theMatchAddr] = matchPda(poolId, Number(matchId));

    const tx = await (program.methods as any)
      .joinAndMatch(
        new anchor.BN(poolId),
        Array.from(commitment),
        sessionPubkey
      )
      .accounts({
        player,
        headPlayer: headEntry.player,
        playerTokenAccount: playerAta,
        headEntry: headEntryAddr,
        theMatch: theMatchAddr,
      })
      .preInstructions([ataIx, fundSessionIx])
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
 * Player's full game history — scans program-wide signatures and filters
 * Resolved/TimeoutResolved events where this player was player_a or player_b.
 *
 * Helius (and most RPCs) reject getTransactions requests with too-large
 * payloads (413). We keep batches small + cap total signatures.
 */
export async function fetchPlayerHistory(
  connection: Connection,
  player: PublicKey,
  limit = 100
): Promise<Array<{
  signature: string;
  timestamp: number;
  result: "WIN" | "LOSS" | "TIE";
  payout: number;             // RPS units (millionths) OR lamports — depends on currency
  moveMine: number;
  moveOther: number;
  poolId: number;
  currency: "rps" | "sol";    // which world the game was played in
}>> {
  const me = player.toBase58();
  const sigs = await connection.getSignaturesForAddress(PROGRAM_ID, { limit });
  if (sigs.length === 0) return [];

  // getTransactions() (plural) sends a JSON-RPC batch — blocked on Helius
  // free tier (-32403). Fetch individually in concurrency windows. Helius
  // tolerates moderate bursts; the 429s we previously hit came from running
  // this concurrently with the live-metrics tick, not from this loop alone.
  const CONCURRENCY = 4;
  const opts = { commitment: "confirmed" as const, maxSupportedTransactionVersion: 0 };
  const allTxs: any[] = [];
  for (let i = 0; i < sigs.length; i += CONCURRENCY) {
    const window = sigs.slice(i, i + CONCURRENCY);
    const txs = await Promise.all(
      window.map((s) => connection.getTransaction(s.signature, opts).catch(() => null))
    );
    allTxs.push(...txs);
  }

  const { EventParser, BorshCoder } = await import("@coral-xyz/anchor");
  const parser = new EventParser(PROGRAM_ID, new BorshCoder(RPS_IDL_FOR_HISTORY as any));

  // Anchor's BorshCoder may decode event fields as snake_case (matching the
  // on-chain IDL) or camelCase (legacy versions). Read both shapes.
  const pick = (o: any, ...keys: string[]) => {
    if (!o) return undefined;
    for (const k of keys) if (o[k] !== undefined) return o[k];
    return undefined;
  };
  const pkStr = (v: any): string | null => {
    if (!v) return null;
    if (typeof v === "string") return v;
    if (typeof v?.toBase58 === "function") return v.toBase58();
    try { return new PublicKey(v).toBase58(); } catch { return null; }
  };

  const RPS_RESOLVE_NAMES = new Set(["Resolved", "TimeoutResolved"]);
  const SOL_RESOLVE_NAMES = new Set(["SolResolved", "SolTimeoutResolved"]);

  const out: Array<any> = [];
  for (let i = 0; i < allTxs.length; i++) {
    const tx = allTxs[i];
    const sig = sigs[i];
    if (!tx?.meta?.logMessages) continue;
    try {
      for (const event of parser.parseLogs(tx.meta.logMessages)) {
        const isRps = RPS_RESOLVE_NAMES.has(event.name);
        const isSol = SOL_RESOLVE_NAMES.has(event.name);
        if (!isRps && !isSol) continue;
        const isTimeout =
          event.name === "TimeoutResolved" || event.name === "SolTimeoutResolved";
        const currency: "rps" | "sol" = isSol ? "sol" : "rps";

        const a = pkStr(pick(event.data, "playerA", "player_a"));
        const b = pkStr(pick(event.data, "playerB", "player_b"));
        if (!a || !b) continue;
        if (a !== me && b !== me) continue;
        const isA = a === me;
        const outcome = Number(pick(event.data, "outcome") ?? 2);
        let result: "WIN" | "LOSS" | "TIE";
        if (isTimeout) {
          const scenario = Number(pick(event.data, "scenario") ?? 2);
          if (scenario === 2) result = "TIE";
          else if ((scenario === 0 && isA) || (scenario === 1 && !isA)) result = "WIN";
          else result = "LOSS";
        } else {
          if (outcome === 2) result = "TIE";
          else if ((outcome === 0 && isA) || (outcome === 1 && !isA)) result = "WIN";
          else result = "LOSS";
        }
        const paid = isA
          ? pick(event.data, "paidA", "paid_a")
          : pick(event.data, "paidB", "paid_b");
        const moveMine = isA
          ? pick(event.data, "moveA", "move_a")
          : pick(event.data, "moveB", "move_b");
        const moveOther = isA
          ? pick(event.data, "moveB", "move_b")
          : pick(event.data, "moveA", "move_a");
        // RPS payout is u64 of token millionths → divide by 1e6 for human units.
        // SOL payout is lamports → divide by LAMPORTS_PER_SOL (1e9).
        const denom = currency === "sol" ? LAMPORTS_PER_SOL : 1_000_000;
        out.push({
          signature: sig.signature,
          timestamp: (sig.blockTime ?? 0) * 1000,
          result,
          payout: Number(paid ?? 0) / denom,
          moveMine: Number(moveMine ?? 0),
          moveOther: Number(moveOther ?? 0),
          poolId: Number(pick(event.data, "poolId", "pool_id") ?? 0),
          currency,
        });
      }
    } catch {
      // skip un-parseable
    }
  }
  return out;
}

// Lazy import of IDL for the player-history scan to avoid circular import.
import RPS_IDL_FOR_HISTORY from "./idl/rps_onchain.json";

/**
 * Returns details about the current queue head, if any. Used by the frontend
 * to detect whether (a) this wallet already has a pending entry, or (b) the
 * head entry belongs to someone else and is stale (likely abandoned).
 */
export async function getQueueHead(
  connection: Connection,
  poolId: number
): Promise<{
  exists: boolean;
  isMine?: boolean;
  player?: PublicKey;
  slotJoined?: bigint;
  ageSlots?: bigint;
} | null> {
  try {
    const program = getProgram(connection);
    const pool = await (program.account as any).pool.fetch(poolPda(poolId)[0]);
    const head = BigInt(pool.queueHead.toString());
    const tail = BigInt(pool.queueTail.toString());
    if (head === tail) return { exists: false };
    const [entryAddr] = queueEntryPda(poolId, Number(head));
    const entry = await (program.account as any).queueEntry.fetch(entryAddr);
    const slotJoined = BigInt(entry.slotJoined.toString());
    const currentSlot = BigInt(await connection.getSlot());
    return {
      exists: true,
      player: new PublicKey(entry.player),
      slotJoined,
      ageSlots: currentSlot - slotJoined,
    };
  } catch {
    return null;
  }
}

/**
 * Reads the on-chain Config and returns the current reveal-timeout slot count.
 * Cached for the page lifetime once read.
 */
let _cachedRevealTimeout: bigint | null = null;
export async function getRevealTimeoutSlots(
  connection: Connection
): Promise<bigint> {
  if (_cachedRevealTimeout !== null) return _cachedRevealTimeout;
  try {
    const program = getProgram(connection);
    const cfg = await (program.account as any).config.fetch(configPda()[0]);
    _cachedRevealTimeout = BigInt(cfg.revealTimeoutSlots.toString());
    return _cachedRevealTimeout;
  } catch {
    return 1500n; // sensible fallback
  }
}

/**
 * Cancels the head queue entry for a pool. The on-chain instruction is
 * permissionless after timeout — useful for auto-recovering a player's own
 * stranded stake on reconnect.
 */
export async function cancelOwnQueueEntry({
  connection,
  wallet,
  poolId,
}: {
  connection: Connection;
  wallet: AnchorWallet;
  poolId: number;
}): Promise<string> {
  const program = getProgram(connection, wallet);
  const player = wallet.publicKey;
  const playerAta = getAssociatedTokenAddressSync(RPS_MINT, player);
  const anchor = await import("@coral-xyz/anchor");

  const tx = await (program.methods as any)
    .cancelQueueEntry(new anchor.BN(poolId))
    .accounts({
      caller: player,
      headPlayer: player,
      headPlayerToken: playerAta,
    })
    .rpc();
  return tx;
}

/**
 * Scan all QueueEntry accounts on the program and return the one belonging
 * to `player` if any. Lets us detect "you have a pending commit" before
 * letting them submit a new one.
 */
export async function findOwnQueueEntry(
  connection: Connection,
  player: PublicKey
): Promise<{
  poolId: number;
  index: bigint;
  commitment: Uint8Array;
  slotJoined: bigint;
} | null> {
  const program = getProgram(connection);
  try {
    const all = await (program.account as any).queueEntry.all([
      {
        memcmp: {
          // QueueEntry layout: 8 (disc) + 8 (pool_id) + 8 (index) + 32 (player) + ...
          // player offset = 8 + 8 + 8 = 24
          offset: 24,
          bytes: player.toBase58(),
        },
      },
    ]);
    if (!all || all.length === 0) return null;
    const a = all[0];
    return {
      poolId: Number(a.account.poolId),
      index: BigInt(a.account.index.toString()),
      commitment: new Uint8Array(a.account.commitment),
      slotJoined: BigInt(a.account.slotJoined.toString()),
    };
  } catch {
    return null;
  }
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
  intervalMs = 800
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

// ═══════════════════════════════════════════════════════════════════════════
// SOL parallel world — same FIFO + commit-reveal semantics, native lamports.
// ═══════════════════════════════════════════════════════════════════════════

export async function fetchSolPool(
  connection: Connection,
  poolId: number
): Promise<{
  poolId: number;
  entryAmount: bigint;        // lamports
  queueHead: bigint;
  queueTail: bigint;
  nextMatchId: bigint;
  vaultBalance: bigint;       // lamports
} | null> {
  const program = getProgram(connection);
  try {
    const acc = await (program.account as any).solPool.fetch(solPoolPda(poolId)[0]);
    const vaultInfo = await connection.getAccountInfo(solVaultPda(poolId)[0]);
    return {
      poolId: Number(acc.poolId),
      entryAmount: BigInt(acc.entryAmount.toString()),
      queueHead: BigInt(acc.queueHead.toString()),
      queueTail: BigInt(acc.queueTail.toString()),
      nextMatchId: BigInt(acc.nextMatchId.toString()),
      vaultBalance: BigInt(vaultInfo?.lamports ?? 0),
    };
  } catch {
    return null;
  }
}

export async function fetchSolGlobalStats(connection: Connection): Promise<{
  roundsPlayed: bigint;
  totalBurned: bigint;
  totalToTreasury: bigint;
  totalVolume: bigint;
} | null> {
  const program = getProgram(connection);
  try {
    const acc = await (program.account as any).solGlobalStats.fetch(
      solGlobalStatsPda()[0]
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

/**
 * Joins a SOL pool. Reads queue state to choose joinSolSolo vs joinSolAndMatch.
 * Returns matchId if matched immediately, or null if just queued.
 */
export async function joinSolPool(args: {
  connection: Connection;
  wallet: AnchorWallet;
  poolId: number;
  commitment: Uint8Array;
  sessionPubkey: PublicKey;
}): Promise<{ tx: string; matchId: bigint | null }> {
  let lastErr: any;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await joinSolPoolOnce(args);
    } catch (err: any) {
      lastErr = err;
      const msg = (err?.message ?? String(err)).toLowerCase();
      const transient =
        msg.includes("constraintseeds") ||
        msg.includes("queueempty") ||
        msg.includes("queuenotempty") ||
        msg.includes("seeds constraint") ||
        msg.includes("blockhash not found");
      if (!transient) throw err;
      await new Promise((r) => setTimeout(r, 600));
    }
  }
  throw lastErr;
}

async function joinSolPoolOnce({
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
  const anchor = await import("@coral-xyz/anchor");

  const pool = await (program.account as any).solPool.fetch(solPoolPda(poolId)[0]);
  const head = BigInt(pool.queueHead.toString());
  const tail = BigInt(pool.queueTail.toString());
  const player = wallet.publicKey;

  // Pre-fund the session key with rent + a couple of fees so it can submit
  // reveal_sol later without holding any other funds.
  const fundSessionIx = SystemProgram.transfer({
    fromPubkey: player,
    toPubkey: sessionPubkey,
    lamports: Math.round(0.001 * LAMPORTS_PER_SOL),
  });

  if (head === tail) {
    const [queueEntryAddr] = solQueueEntryPda(poolId, Number(tail));
    const tx = await (program.methods as any)
      .joinSolSolo(
        new anchor.BN(poolId),
        Array.from(commitment),
        sessionPubkey
      )
      .accounts({
        player,
        solQueueEntry: queueEntryAddr,
      })
      .preInstructions([fundSessionIx])
      .rpc();
    return { tx, matchId: null };
  } else {
    const [headEntryAddr] = solQueueEntryPda(poolId, Number(head));
    const headEntry = await (program.account as any).solQueueEntry.fetch(headEntryAddr);
    const matchId = BigInt(pool.nextMatchId.toString());
    const [theMatchAddr] = solMatchPda(poolId, Number(matchId));

    const tx = await (program.methods as any)
      .joinSolAndMatch(
        new anchor.BN(poolId),
        Array.from(commitment),
        sessionPubkey
      )
      .accounts({
        player,
        headPlayer: headEntry.player,
        headEntry: headEntryAddr,
        theMatch: theMatchAddr,
      })
      .preInstructions([fundSessionIx])
      .rpc();
    return { tx, matchId };
  }
}

export async function revealSolMove({
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
  const anchor = await import("@coral-xyz/anchor");

  const tx = await (program.methods as any)
    .revealSol(
      new anchor.BN(poolId),
      new anchor.BN(matchId.toString()),
      move,
      Array.from(nonce)
    )
    .accounts({
      signer: sessionKp.publicKey,
      solTreasury: SOL_TREASURY,
      solBurnWallet: SOL_BURN_WALLET,
      playerA,
      playerB,
    })
    .signers([sessionKp])
    .rpc();
  return tx;
}

export async function getCurrentNextSolMatchId(
  connection: Connection,
  poolId: number
): Promise<bigint> {
  const program = getProgram(connection);
  const pool = await (program.account as any).solPool.fetch(solPoolPda(poolId)[0]);
  return BigInt(pool.nextMatchId.toString());
}

export async function findOwnSolQueueEntry(
  connection: Connection,
  player: PublicKey
): Promise<{
  poolId: number;
  index: bigint;
  commitment: Uint8Array;
  slotJoined: bigint;
} | null> {
  const program = getProgram(connection);
  try {
    const all = await (program.account as any).solQueueEntry.all([
      {
        memcmp: {
          // SolQueueEntry: 8 (disc) + 8 (pool_id) + 8 (index) + 32 (player) ...
          offset: 24,
          bytes: player.toBase58(),
        },
      },
    ]);
    if (!all || all.length === 0) return null;
    const a = all[0];
    return {
      poolId: Number(a.account.poolId),
      index: BigInt(a.account.index.toString()),
      commitment: new Uint8Array(a.account.commitment),
      slotJoined: BigInt(a.account.slotJoined.toString()),
    };
  } catch {
    return null;
  }
}

export async function cancelOwnSolQueueEntry({
  connection,
  wallet,
  poolId,
}: {
  connection: Connection;
  wallet: AnchorWallet;
  poolId: number;
}): Promise<string> {
  const program = getProgram(connection, wallet);
  const player = wallet.publicKey;
  const anchor = await import("@coral-xyz/anchor");

  const tx = await (program.methods as any)
    .cancelSolQueueEntry(new anchor.BN(poolId))
    .accounts({
      caller: player,
      headPlayer: player,
    })
    .rpc();
  return tx;
}

export async function pollSolMatchUntilResolved(
  connection: Connection,
  poolId: number,
  matchId: bigint,
  imSideA: boolean,
  timeoutMs = 60_000,
  intervalMs = 800
): Promise<number | null> {
  const program = getProgram(connection);
  const start = Date.now();
  const matchAccPda = solMatchPda(poolId, Number(matchId))[0];
  while (Date.now() - start < timeoutMs) {
    try {
      const acc = await (program.account as any).solMatch.fetch(matchAccPda);
      const otherReveal = imSideA ? acc.revealB : acc.revealA;
      if (otherReveal !== null && otherReveal !== undefined) {
        return Number(otherReveal);
      }
    } catch { /* match closed → resolved */ }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return null;
}

export async function pollForSolMatch({
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
      const acc = await (program.account as any).solMatch.fetch(
        solMatchPda(poolId, Number(probe))[0]
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
      await new Promise((r) => setTimeout(r, intervalMs));
    }
  }
  return null;
}

export async function fetchSolPlayerStats(
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
    const acc = await (program.account as any).solPlayerStats.fetch(
      solPlayerStatsPda(player)[0]
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
