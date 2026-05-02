/**
 * 500-game pre-launch stress test across ALL 6 pools (3 RPS + 3 SOL).
 *
 * Distribution (chosen to fit a ~8 SOL devnet budget — bumped if you have more):
 *   RPS_30K  : 200 games
 *   RPS_100K : 150 games
 *   RPS_1M   : 100 games
 *   SOL_0.015:  30 games
 *   SOL_0.05 :  17 games
 *   SOL_0.5  :   3 games
 *   ──────────────────
 *   TOTAL    : 500 games
 *
 * Strategy:
 *   - 4 fresh test players generated each run (no pollution).
 *   - Players funded from admin upfront with generous initial reserves.
 *   - Between each game, if either player's relevant balance dipped below
 *     2× entry, admin tops them back up. This makes the test sustainable
 *     even with statistically improbable losing streaks.
 *   - Sequential execution per pool. No race conditions to chase.
 *   - Verifies on-chain Match state transitions to Resolved + RPS mint
 *     supply decreases by exactly the cumulative burn amount.
 *
 * Run:  pnpm exec tsx scripts/stress-all-pools.ts
 */

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  getAccount,
  getMint,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferInstruction,
} from "@solana/spl-token";
import { keccak_256 } from "@noble/hashes/sha3.js";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

// ─── Config ────────────────────────────────────────────────────────────────
const RPC = "https://devnet.helius-rpc.com/?api-key=71628f63-3f6b-4076-b2ff-4d7ed3fece0f";
const PROGRAM_ID = new PublicKey("DymxJfPVGFD3BD1DWk6KeXaj7uPQhSFo2xXB3A8LuBFG");
const RPS_MINT = new PublicKey("AyKZ2a5CRZX3sMihAQ6CbBJJPjoYqwL9dneaAS7GFGRL");
const RPS_TREASURY_ATA = new PublicKey("8WzgAJPVNDBDQQ5Y1WyVAR7w7q9Y3EvSogZk1rDvhwJC");
const SOL_TREASURY = new PublicKey("8WzgAJPVNDBDQQ5Y1WyVAR7w7q9Y3EvSogZk1rDvhwJC");
const SOL_BURN_WALLET = new PublicKey("DQ4NGW79Vs8DNqyJniMbx8E1v3ZEvarsHB7m1N6pNNUJ");

type PoolKind = "rps" | "sol";
interface PoolPlan {
  id: number;
  kind: PoolKind;
  entry: bigint; // RPS millionths or lamports
  games: number;
  label: string;
}

const POOLS: PoolPlan[] = [
  { id: 0, kind: "rps", entry: 30_000n * 1_000_000n,    games: 200, label: "RPS_30K"  },
  { id: 1, kind: "rps", entry: 100_000n * 1_000_000n,   games: 150, label: "RPS_100K" },
  { id: 2, kind: "rps", entry: 1_000_000n * 1_000_000n, games: 100, label: "RPS_1M"   },
  { id: 0, kind: "sol", entry: 15_000_000n,             games:  30, label: "SOL_0.015"},
  { id: 1, kind: "sol", entry: 50_000_000n,             games:  17, label: "SOL_0.05" },
  { id: 2, kind: "sol", entry: 500_000_000n,            games:   3, label: "SOL_0.5"  },
];

// ─── PDA helpers ───────────────────────────────────────────────────────────
const u64Le = (n: number | bigint) => {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(typeof n === "bigint" ? n : BigInt(n), 0);
  return buf;
};

const poolPda = (id: number) => PublicKey.findProgramAddressSync([Buffer.from("pool"), u64Le(id)], PROGRAM_ID)[0];
const queueEntryPda = (id: number, idx: number) => PublicKey.findProgramAddressSync([Buffer.from("entry"), u64Le(id), u64Le(idx)], PROGRAM_ID)[0];
const matchPda = (id: number, mid: number) => PublicKey.findProgramAddressSync([Buffer.from("match"), u64Le(id), u64Le(mid)], PROGRAM_ID)[0];

const solPoolPda = (id: number) => PublicKey.findProgramAddressSync([Buffer.from("sol_pool"), u64Le(id)], PROGRAM_ID)[0];
const solQueueEntryPda = (id: number, idx: number) => PublicKey.findProgramAddressSync([Buffer.from("sol_entry"), u64Le(id), u64Le(idx)], PROGRAM_ID)[0];
const solMatchPda = (id: number, mid: number) => PublicKey.findProgramAddressSync([Buffer.from("sol_match"), u64Le(id), u64Le(mid)], PROGRAM_ID)[0];

// ─── Crypto + outcome helpers ──────────────────────────────────────────────
const computeCommitment = (move: number, nonce: Uint8Array, player: PublicKey) => {
  const data = new Uint8Array(1 + 32 + 32);
  data[0] = move;
  data.set(nonce, 1);
  data.set(player.toBytes(), 33);
  return keccak_256(data);
};
const randomNonce = () => {
  const b = new Uint8Array(32);
  for (let i = 0; i < 32; i++) b[i] = Math.floor(Math.random() * 256);
  return b;
};
const moveName = (m: number) => (m === 1 ? "R" : m === 2 ? "P" : "S");
const outcomeName = (a: number, b: number) =>
  a === b ? "TIE" : ((a === 1 && b === 3) || (a === 2 && b === 1) || (a === 3 && b === 2)) ? "A" : "B";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Generic retry for transient errors. Free-tier RPC noise → one quick retry,
// then bail. Long retry chains were turning a 1-sec game into a 40-sec slog.
async function withRetry<T>(label: string, fn: () => Promise<T>, attempts = 2): Promise<T> {
  let lastErr: any;
  for (let i = 0; i < attempts; i++) {
    try { return await fn(); }
    catch (err: any) {
      lastErr = err;
      const msg = (err?.message ?? String(err)).toLowerCase();
      const transient =
        msg.includes("429") || msg.includes("blockhash") || msg.includes("timeout") ||
        msg.includes("rate") || msg.includes("etimedout") || msg.includes("econnreset");
      if (!transient) throw err;
      await sleep(300 * (i + 1));
    }
  }
  throw lastErr;
}

// ─── Funding helpers ───────────────────────────────────────────────────────
async function fundSol(conn: Connection, admin: Keypair, to: PublicKey, lamports: number) {
  const tx = new Transaction().add(
    SystemProgram.transfer({ fromPubkey: admin.publicKey, toPubkey: to, lamports })
  );
  await sendAndConfirmTransaction(conn, tx, [admin]);
}
async function fundRps(conn: Connection, admin: Keypair, adminAta: PublicKey, to: PublicKey, amount: bigint) {
  const ata = getAssociatedTokenAddressSync(RPS_MINT, to);
  const tx = new Transaction()
    .add(createAssociatedTokenAccountIdempotentInstruction(admin.publicKey, ata, to, RPS_MINT))
    .add(createTransferInstruction(adminAta, ata, admin.publicKey, amount));
  await sendAndConfirmTransaction(conn, tx, [admin]);
}
async function rpsBalance(conn: Connection, owner: PublicKey): Promise<bigint> {
  const ata = getAssociatedTokenAddressSync(RPS_MINT, owner);
  try { return (await getAccount(conn, ata)).amount; } catch { return 0n; }
}

// ─── Game runners ──────────────────────────────────────────────────────────
async function runRpsGame(args: {
  conn: Connection;
  admin: Keypair;
  program: Program;
  pool: PoolPlan;
  a: Keypair;
  b: Keypair;
}): Promise<{ ok: true; pot: bigint; outcome: string; sig: string } | { ok: false; err: string }> {
  const { conn, admin, program, pool, a, b } = args;
  const moveA = (1 + Math.floor(Math.random() * 3)) as 1 | 2 | 3;
  const moveB = (1 + Math.floor(Math.random() * 3)) as 1 | 2 | 3;
  const nonceA = randomNonce();
  const nonceB = randomNonce();
  const sessionA = Keypair.generate();
  const sessionB = Keypair.generate();
  const cA = computeCommitment(moveA, nonceA, a.publicKey);
  const cB = computeCommitment(moveB, nonceB, b.publicKey);
  const aTok = getAssociatedTokenAddressSync(RPS_MINT, a.publicKey);
  const bTok = getAssociatedTokenAddressSync(RPS_MINT, b.publicKey);

  try {
    await withRetry("fund sessions", () => {
      const fundTx = new Transaction()
        .add(SystemProgram.transfer({ fromPubkey: admin.publicKey, toPubkey: sessionA.publicKey, lamports: 0.001 * LAMPORTS_PER_SOL }))
        .add(SystemProgram.transfer({ fromPubkey: admin.publicKey, toPubkey: sessionB.publicKey, lamports: 0.001 * LAMPORTS_PER_SOL }));
      return sendAndConfirmTransaction(conn, fundTx, [admin]);
    });

    const poolBefore = await withRetry("read pool", () => (program.account as any).pool.fetch(poolPda(pool.id)));
    const tail = Number(poolBefore.queueTail);
    await withRetry("joinSolo", () =>
      program.methods
        .joinSolo(new anchor.BN(pool.id), Array.from(cA), sessionA.publicKey)
        .accounts({ player: a.publicKey, playerTokenAccount: aTok, queueEntry: queueEntryPda(pool.id, tail) })
        .signers([a]).rpc()
    );

    const poolAfterA = await withRetry("read pool 2", () => (program.account as any).pool.fetch(poolPda(pool.id)));
    const head = Number(poolAfterA.queueHead);
    const matchId = Number(poolAfterA.nextMatchId);
    const headEntry = await withRetry("read head", () => (program.account as any).queueEntry.fetch(queueEntryPda(pool.id, head)));
    await withRetry("joinAndMatch", () =>
      program.methods
        .joinAndMatch(new anchor.BN(pool.id), Array.from(cB), sessionB.publicKey)
        .accounts({
          player: b.publicKey,
          headPlayer: headEntry.player,
          playerTokenAccount: bTok,
          headEntry: queueEntryPda(pool.id, head),
          theMatch: matchPda(pool.id, matchId),
        })
        .signers([b]).rpc()
    );

    await withRetry("reveal A", () =>
      program.methods
        .reveal(new anchor.BN(pool.id), new anchor.BN(matchId), moveA, Array.from(nonceA))
        .accounts({ signer: sessionA.publicKey, mint: RPS_MINT, treasuryToken: RPS_TREASURY_ATA, playerAToken: aTok, playerBToken: bTok })
        .signers([sessionA]).rpc()
    );

    const sig = await withRetry("reveal B", () =>
      program.methods
        .reveal(new anchor.BN(pool.id), new anchor.BN(matchId), moveB, Array.from(nonceB))
        .accounts({ signer: sessionB.publicKey, mint: RPS_MINT, treasuryToken: RPS_TREASURY_ATA, playerAToken: aTok, playerBToken: bTok })
        .signers([sessionB]).rpc()
    );

    const m = await withRetry("verify resolved", () => (program.account as any).match.fetch(matchPda(pool.id, matchId)));
    if (!JSON.stringify(m.state).includes("resolved")) throw new Error("match not Resolved");

    return { ok: true, pot: BigInt(m.pot.toString()), outcome: outcomeName(moveA, moveB), sig };
  } catch (err: any) {
    return { ok: false, err: (err?.message ?? String(err)).slice(0, 200) };
  }
}

async function runSolGame(args: {
  conn: Connection;
  admin: Keypair;
  program: Program;
  pool: PoolPlan;
  a: Keypair;
  b: Keypair;
}): Promise<{ ok: true; pot: bigint; outcome: string; sig: string } | { ok: false; err: string }> {
  const { conn, admin, program, pool, a, b } = args;
  const moveA = (1 + Math.floor(Math.random() * 3)) as 1 | 2 | 3;
  const moveB = (1 + Math.floor(Math.random() * 3)) as 1 | 2 | 3;
  const nonceA = randomNonce();
  const nonceB = randomNonce();
  const sessionA = Keypair.generate();
  const sessionB = Keypair.generate();
  const cA = computeCommitment(moveA, nonceA, a.publicKey);
  const cB = computeCommitment(moveB, nonceB, b.publicKey);

  try {
    await withRetry("fund sessions sol", () => {
      const fundTx = new Transaction()
        .add(SystemProgram.transfer({ fromPubkey: admin.publicKey, toPubkey: sessionA.publicKey, lamports: 0.001 * LAMPORTS_PER_SOL }))
        .add(SystemProgram.transfer({ fromPubkey: admin.publicKey, toPubkey: sessionB.publicKey, lamports: 0.001 * LAMPORTS_PER_SOL }));
      return sendAndConfirmTransaction(conn, fundTx, [admin]);
    });

    const poolBefore = await withRetry("read solPool", () => (program.account as any).solPool.fetch(solPoolPda(pool.id)));
    const tail = Number(poolBefore.queueTail);
    await withRetry("joinSolSolo", () =>
      program.methods
        .joinSolSolo(new anchor.BN(pool.id), Array.from(cA), sessionA.publicKey)
        .accounts({ player: a.publicKey, solQueueEntry: solQueueEntryPda(pool.id, tail) })
        .signers([a]).rpc()
    );

    const poolAfterA = await withRetry("read solPool 2", () => (program.account as any).solPool.fetch(solPoolPda(pool.id)));
    const head = Number(poolAfterA.queueHead);
    const matchId = Number(poolAfterA.nextMatchId);
    const headEntry = await withRetry("read sol head", () => (program.account as any).solQueueEntry.fetch(solQueueEntryPda(pool.id, head)));
    await withRetry("joinSolAndMatch", () =>
      program.methods
        .joinSolAndMatch(new anchor.BN(pool.id), Array.from(cB), sessionB.publicKey)
        .accounts({
          player: b.publicKey,
          headPlayer: headEntry.player,
          headEntry: solQueueEntryPda(pool.id, head),
          theMatch: solMatchPda(pool.id, matchId),
        })
        .signers([b]).rpc()
    );

    await withRetry("revealSol A", () =>
      program.methods
        .revealSol(new anchor.BN(pool.id), new anchor.BN(matchId), moveA, Array.from(nonceA))
        .accounts({ signer: sessionA.publicKey, solTreasury: SOL_TREASURY, solBurnWallet: SOL_BURN_WALLET, playerA: a.publicKey, playerB: b.publicKey })
        .signers([sessionA]).rpc()
    );

    const sig = await withRetry("revealSol B", () =>
      program.methods
        .revealSol(new anchor.BN(pool.id), new anchor.BN(matchId), moveB, Array.from(nonceB))
        .accounts({ signer: sessionB.publicKey, solTreasury: SOL_TREASURY, solBurnWallet: SOL_BURN_WALLET, playerA: a.publicKey, playerB: b.publicKey })
        .signers([sessionB]).rpc()
    );

    const m = await withRetry("verify sol resolved", () => (program.account as any).solMatch.fetch(solMatchPda(pool.id, matchId)));
    if (!JSON.stringify(m.state).includes("resolved")) throw new Error("sol match not Resolved");

    return { ok: true, pot: BigInt(m.pot.toString()), outcome: outcomeName(moveA, moveB), sig };
  } catch (err: any) {
    return { ok: false, err: (err?.message ?? String(err)).slice(0, 200) };
  }
}

// ─── Pre-game queue cleanup ────────────────────────────────────────────────
// If a previous game errored mid-flow, the queue can be left with a stranded
// entry. We can't reveal it (we don't have the original A's nonce), but we
// CAN clear the queue by calling joinAndMatch from a different player. That
// pops the head entry and creates an abandoned Match (which times out in
// ~10 min — irrelevant for our test). Subsequent games then run cleanly.
async function drainQueueIfNeeded(args: {
  conn: Connection;
  admin: Keypair;
  program: Program;
  pool: PoolPlan;
  adminAta: PublicKey;
  players: Keypair[];
}): Promise<boolean> {
  const { conn, admin, program, pool, adminAta, players } = args;

  let head: bigint, tail: bigint;
  if (pool.kind === "rps") {
    const p = await withRetry("read pool", () =>
      (program.account as any).pool.fetch(poolPda(pool.id))
    );
    head = BigInt(p.queueHead.toString());
    tail = BigInt(p.queueTail.toString());
  } else {
    const p = await withRetry("read solPool", () =>
      (program.account as any).solPool.fetch(solPoolPda(pool.id))
    );
    head = BigInt(p.queueHead.toString());
    tail = BigInt(p.queueTail.toString());
  }
  if (tail <= head) return false; // already clean

  // Pick a drainer that is NOT the stranded player (else self-match would
  // trigger the contract's H1 check and revert).
  const headEntryAddr =
    pool.kind === "rps"
      ? queueEntryPda(pool.id, Number(head))
      : solQueueEntryPda(pool.id, Number(head));
  const headEntryAcc = await withRetry("fetch head entry", () =>
    pool.kind === "rps"
      ? (program.account as any).queueEntry.fetch(headEntryAddr)
      : (program.account as any).solQueueEntry.fetch(headEntryAddr)
  );
  const strandedPlayer = new PublicKey(headEntryAcc.player);
  const strandedSession = new PublicKey(headEntryAcc.sessionKey);
  const drainer = players.find(
    (p) => !p.publicKey.equals(strandedPlayer) && !p.publicKey.equals(strandedSession)
  );
  if (!drainer) return false;

  // Top up the drainer
  if (pool.kind === "rps") {
    const need = pool.entry * 2n;
    const bal = await rpsBalance(conn, drainer.publicKey);
    if (bal < need) await fundRps(conn, admin, adminAta, drainer.publicKey, need * 3n - bal);
  } else {
    const need = Number(pool.entry) * 2;
    const bal = await conn.getBalance(drainer.publicKey);
    if (bal < need) await fundSol(conn, admin, drainer.publicKey, need * 2 - bal);
  }

  // Build a fresh commit + session for the drainer (we won't reveal — the
  // match is intentionally abandoned).
  const move = (1 + Math.floor(Math.random() * 3)) as 1 | 2 | 3;
  const nonce = randomNonce();
  const session = Keypair.generate();
  const commit = computeCommitment(move, nonce, drainer.publicKey);

  const matchId = await (async () => {
    const acc = pool.kind === "rps"
      ? await (program.account as any).pool.fetch(poolPda(pool.id))
      : await (program.account as any).solPool.fetch(solPoolPda(pool.id));
    return Number(acc.nextMatchId);
  })();

  if (pool.kind === "rps") {
    const drainerTok = getAssociatedTokenAddressSync(RPS_MINT, drainer.publicKey);
    await program.methods
      .joinAndMatch(new anchor.BN(pool.id), Array.from(commit), session.publicKey)
      .accounts({
        player: drainer.publicKey,
        headPlayer: strandedPlayer,
        playerTokenAccount: drainerTok,
        headEntry: headEntryAddr,
        theMatch: matchPda(pool.id, matchId),
      })
      .signers([drainer]).rpc();
  } else {
    await program.methods
      .joinSolAndMatch(new anchor.BN(pool.id), Array.from(commit), session.publicKey)
      .accounts({
        player: drainer.publicKey,
        headPlayer: strandedPlayer,
        headEntry: headEntryAddr,
        theMatch: solMatchPda(pool.id, matchId),
      })
      .signers([drainer]).rpc();
  }
  return true;
}

// ─── Per-pool runner ───────────────────────────────────────────────────────
async function runPool(args: {
  conn: Connection;
  admin: Keypair;
  adminAta: PublicKey;
  program: Program;
  pool: PoolPlan;
  players: Keypair[];
}): Promise<{ wins: number; losses: number; ties: number; errors: number; burned: bigint; errs: string[] }> {
  const { conn, admin, adminAta, program, pool, players } = args;
  const stats = { wins: 0, losses: 0, ties: 0, errors: 0, burned: 0n, errs: [] as string[] };

  console.log(`\n── ${pool.label} : ${pool.games} games ─────────────────────`);

  for (let i = 0; i < pool.games; i++) {
    // Rotate pairs across players so no single wallet drains faster than others.
    const pairs: [Keypair, Keypair][] = [
      [players[0], players[1]],
      [players[2], players[3]],
      [players[0], players[2]],
      [players[1], players[3]],
    ];
    const [a, b] = pairs[i % pairs.length];

    // Per-game top-up
    if (pool.kind === "rps") {
      const need = pool.entry * 2n;
      for (const p of [a, b]) {
        const bal = await rpsBalance(conn, p.publicKey);
        if (bal < need) await fundRps(conn, admin, adminAta, p.publicKey, need * 5n - bal);
      }
    } else {
      const need = Number(pool.entry) * 2;
      for (const p of [a, b]) {
        const bal = await conn.getBalance(p.publicKey);
        if (bal < need) await fundSol(conn, admin, p.publicKey, need * 3 - bal);
      }
    }

    // If a prior game left the queue dirty, drain first
    try {
      const drained = await drainQueueIfNeeded({ conn, admin, program, pool, adminAta, players });
      if (drained) process.stdout.write("d");
    } catch (e: any) {
      // drain failure is non-fatal — main game may still succeed
      stats.errs.push(`#${i + 1} drain: ${(e?.message ?? String(e)).slice(0, 120)}`);
    }

    const r = pool.kind === "rps"
      ? await runRpsGame({ conn, admin, program, pool, a, b })
      : await runSolGame({ conn, admin, program, pool, a, b });

    if (!r.ok) {
      stats.errors++;
      stats.errs.push(`#${i + 1}: ${r.err}`);
      process.stdout.write("✗");
      await sleep(800);
      continue;
    }
    if (r.outcome === "TIE") stats.ties++;
    else if (r.outcome === "A") stats.wins++;
    else stats.losses++;
    stats.burned += (r.pot * 3n) / 40n;
    process.stdout.write(r.outcome === "TIE" ? "=" : ".");
    if ((i + 1) % 50 === 0) process.stdout.write(` ${i + 1}\n`);
    // pause between games to ease Helius free-tier rate limits
    await sleep(180);
  }
  console.log(`\n  ${pool.label} done — wins:${stats.wins} losses:${stats.losses} ties:${stats.ties} errors:${stats.errors}`);
  return stats;
}

// ─── Main ──────────────────────────────────────────────────────────────────
(async () => {
  const walletPath = path.join(os.homedir(), ".config/solana/id.json");
  const admin = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(walletPath, "utf-8"))));
  const conn = new Connection(RPC, "confirmed");

  const totalGames = POOLS.reduce((s, p) => s + p.games, 0);
  console.log(`╔══════════════════════════════════════════════════════════════╗`);
  console.log(`║  500-GAME PRE-LAUNCH STRESS TEST — ${totalGames} games across 6 pools  ║`);
  console.log(`╚══════════════════════════════════════════════════════════════╝`);
  console.log(`Admin    : ${admin.publicKey.toBase58()}`);
  console.log(`Program  : ${PROGRAM_ID.toBase58()}`);
  console.log(`Mint     : ${RPS_MINT.toBase58()}`);
  console.log(`Started  : ${new Date().toISOString()}`);
  console.log();

  const wallet = new anchor.Wallet(admin);
  const provider = new anchor.AnchorProvider(conn, wallet, { commitment: "confirmed" });
  anchor.setProvider(provider);
  const idlPath = path.join(__dirname, "..", "target/idl/rps_onchain.json");
  const idl = JSON.parse(fs.readFileSync(idlPath, "utf-8"));
  const program = new Program(idl, provider) as Program<any>;
  const adminAta = getAssociatedTokenAddressSync(RPS_MINT, admin.publicKey);

  // ── 4 fresh players ──
  const players = Array.from({ length: 4 }, () => Keypair.generate());
  console.log("Players (fresh):");
  players.forEach((p, i) => console.log(`  P${i}: ${p.publicKey.toBase58()}`));
  console.log();

  // Initial generous funding so most games skip the per-game top-up step
  console.log("Initial funding...");
  for (const p of players) {
    // 0.5 SOL initial for fees + SOL pool entries
    await fundSol(conn, admin, p.publicKey, 0.5 * LAMPORTS_PER_SOL);
    // 75M $RPS initial — covers all RPS games at largest pool comfortably
    await fundRps(conn, admin, adminAta, p.publicKey, 75_000_000n * 1_000_000n);
    process.stdout.write(".");
  }
  console.log(" funded.\n");

  // ── Snapshot supply for burn verification ──
  const supplyBefore = (await getMint(conn, RPS_MINT)).supply;
  console.log(`Initial RPS supply: ${(Number(supplyBefore) / 1e6).toLocaleString()} $RPS\n`);

  const t0 = Date.now();
  const allStats: Record<string, any> = {};

  for (const pool of POOLS) {
    allStats[pool.label] = await runPool({ conn, admin, adminAta, program, pool, players });
  }

  const elapsedMin = ((Date.now() - t0) / 60_000).toFixed(1);

  // ── Verify burn delta on chain ──
  const supplyAfter = (await getMint(conn, RPS_MINT)).supply;
  const supplyDelta = supplyBefore - supplyAfter;

  let totalGamesRun = 0;
  let totalErrors = 0;
  let expectedRpsBurn = 0n;
  console.log(`\n╔═══════════════════════════ RESULTS ═══════════════════════════╗`);
  for (const pool of POOLS) {
    const s = allStats[pool.label];
    const success = s.wins + s.losses + s.ties;
    totalGamesRun += success + s.errors;
    totalErrors += s.errors;
    if (pool.kind === "rps") expectedRpsBurn += s.burned;
    console.log(
      `  ${pool.label.padEnd(12)} → wins:${String(s.wins).padStart(3)} losses:${String(s.losses).padStart(3)} ties:${String(s.ties).padStart(3)} errors:${String(s.errors).padStart(2)}`
    );
  }
  console.log();
  console.log(`Total games run     : ${totalGamesRun}`);
  console.log(`Total errors        : ${totalErrors}`);
  console.log(`Elapsed             : ${elapsedMin} min`);
  console.log();
  console.log(`Expected RPS burn   : ${(Number(expectedRpsBurn) / 1e6).toLocaleString()} $RPS`);
  console.log(`Actual supply delta : ${(Number(supplyDelta) / 1e6).toLocaleString()} $RPS`);
  console.log(`Burn match?         : ${expectedRpsBurn === supplyDelta ? "✓ YES" : "✗ NO"}`);
  console.log();

  // Dump first few errors per pool for triage
  let printedErrSection = false;
  for (const pool of POOLS) {
    const errs: string[] = allStats[pool.label].errs;
    if (errs.length === 0) continue;
    if (!printedErrSection) {
      console.log("── Sample errors ───────────────────────────────────────");
      printedErrSection = true;
    }
    console.log(`\n[${pool.label}]`);
    errs.slice(0, 3).forEach((e: string) => console.log(`  ${e}`));
    if (errs.length > 3) console.log(`  ...and ${errs.length - 3} more`);
  }

  process.exit(totalErrors > 0 ? 1 : 0);
})().catch((err) => {
  console.error("\nFATAL:", err);
  process.exit(2);
});
