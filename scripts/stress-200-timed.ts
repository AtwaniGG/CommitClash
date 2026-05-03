/**
 * 200-game stress test with reveal-time instrumentation.
 *
 * Runs sequential RPS games and tracks per-game timing breakdown:
 *   - join time (joinSolo or joinAndMatch)
 *   - reveal time (both reveal calls until match settles)
 *   - total time (join → resolved)
 *
 * Reports min / median / p95 / max for each phase + per-pool aggregates,
 * so we can verify the new SOL rent guard hasn't changed game settle time
 * AND confirm what duration the in-app "waiting" sound should be capped at.
 */
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import {
  Connection, Keypair, PublicKey, SystemProgram, Transaction,
  sendAndConfirmTransaction, LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  getAccount, getAssociatedTokenAddressSync,
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferInstruction,
} from "@solana/spl-token";
import { keccak_256 } from "@noble/hashes/sha3.js";
import * as fs from "fs"; import * as os from "os"; import * as path from "path";

const RPC = "https://devnet.helius-rpc.com/?api-key=71628f63-3f6b-4076-b2ff-4d7ed3fece0f";
const PROGRAM_ID = new PublicKey("DymxJfPVGFD3BD1DWk6KeXaj7uPQhSFo2xXB3A8LuBFG");
const RPS_MINT = new PublicKey("AyKZ2a5CRZX3sMihAQ6CbBJJPjoYqwL9dneaAS7GFGRL");
const RPS_TREASURY_ATA = new PublicKey("8WzgAJPVNDBDQQ5Y1WyVAR7w7q9Y3EvSogZk1rDvhwJC");
const SOL_TREASURY = new PublicKey("8WzgAJPVNDBDQQ5Y1WyVAR7w7q9Y3EvSogZk1rDvhwJC");
const SOL_BURN_WALLET = new PublicKey("DQ4NGW79Vs8DNqyJniMbx8E1v3ZEvarsHB7m1N6pNNUJ");

type Kind = "rps" | "sol";
const POOLS: { kind: Kind; id: number; entry: bigint; games: number; label: string }[] = [
  { kind: "rps", id: 0, entry: 30_000n * 1_000_000n, games: 100, label: "RPS_30K" },
  { kind: "rps", id: 1, entry: 100_000n * 1_000_000n, games: 50, label: "RPS_100K" },
  { kind: "rps", id: 2, entry: 1_000_000n * 1_000_000n, games: 30, label: "RPS_1M" },
  { kind: "sol", id: 0, entry: 15_000_000n, games: 20, label: "SOL_0.015" },
];

const u64Le = (n: number | bigint) => {
  const b = Buffer.alloc(8); b.writeBigUInt64LE(typeof n === "bigint" ? n : BigInt(n), 0); return b;
};
const seedPda = (s: string, ...e: Buffer[]) =>
  PublicKey.findProgramAddressSync([Buffer.from(s), ...e], PROGRAM_ID)[0];
const computeCommit = (m: number, n: Uint8Array, p: PublicKey) => {
  const d = new Uint8Array(65); d[0] = m; d.set(n, 1); d.set(p.toBytes(), 33);
  return keccak_256(d);
};
const randomNonce = () => { const b = new Uint8Array(32); for (let i = 0; i < 32; i++) b[i] = Math.floor(Math.random()*256); return b; };
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

interface Timing { join: number; reveal: number; total: number; pool: string; outcome: string }
const timings: Timing[] = [];

(async () => {
  const walletPath = path.join(os.homedir(), ".config/solana/id.json");
  const admin = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(walletPath, "utf-8"))));
  const conn = new Connection(RPC, "confirmed");
  const provider = new anchor.AnchorProvider(conn, new anchor.Wallet(admin), { commitment: "confirmed" });
  anchor.setProvider(provider);
  const idl = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "target/idl/rps_onchain.json"), "utf-8"));
  const program = new Program(idl, provider) as Program<any>;
  const adminAta = getAssociatedTokenAddressSync(RPS_MINT, admin.publicKey);

  const total = POOLS.reduce((s, p) => s + p.games, 0);
  console.log(`╔══════════════════════════════════════════════════╗`);
  console.log(`║  200-GAME TIMED STRESS TEST — ${total} games           ║`);
  console.log(`╚══════════════════════════════════════════════════╝`);
  console.log(`Admin: ${admin.publicKey.toBase58()}`);
  console.log(`Started: ${new Date().toISOString()}\n`);

  const players = Array.from({ length: 4 }, () => Keypair.generate());
  console.log("Funding 4 fresh players...");
  for (const p of players) {
    await sendAndConfirmTransaction(conn, new Transaction().add(
      SystemProgram.transfer({ fromPubkey: admin.publicKey, toPubkey: p.publicKey, lamports: 0.6 * LAMPORTS_PER_SOL })
    ), [admin]);
    const ata = getAssociatedTokenAddressSync(RPS_MINT, p.publicKey);
    await sendAndConfirmTransaction(conn, new Transaction()
      .add(createAssociatedTokenAccountIdempotentInstruction(admin.publicKey, ata, p.publicKey, RPS_MINT))
      .add(createTransferInstruction(adminAta, ata, admin.publicKey, 80_000_000n * 1_000_000n)),
      [admin]);
    process.stdout.write(".");
  }
  console.log(" funded.\n");

  let totalErrors = 0;

  for (const pool of POOLS) {
    console.log(`\n── ${pool.label} : ${pool.games} games ─────`);
    let errs = 0;
    for (let i = 0; i < pool.games; i++) {
      const a = players[i % 2];
      const b = players[(i % 2) + 2];
      const moveA = (1 + Math.floor(Math.random()*3)) as 1|2|3;
      const moveB = (1 + Math.floor(Math.random()*3)) as 1|2|3;
      const nonceA = randomNonce(), nonceB = randomNonce();
      const sessionA = Keypair.generate(), sessionB = Keypair.generate();
      const cA = computeCommit(moveA, nonceA, a.publicKey);
      const cB = computeCommit(moveB, nonceB, b.publicKey);

      try {
        // ─── Pre-fund sessions ───
        await sendAndConfirmTransaction(conn, new Transaction()
          .add(SystemProgram.transfer({ fromPubkey: admin.publicKey, toPubkey: sessionA.publicKey, lamports: 0.001 * LAMPORTS_PER_SOL }))
          .add(SystemProgram.transfer({ fromPubkey: admin.publicKey, toPubkey: sessionB.publicKey, lamports: 0.001 * LAMPORTS_PER_SOL })),
          [admin]);

        const tStart = Date.now();

        // ─── JOIN PHASE ───
        if (pool.kind === "rps") {
          const aTok = getAssociatedTokenAddressSync(RPS_MINT, a.publicKey);
          const bTok = getAssociatedTokenAddressSync(RPS_MINT, b.publicKey);
          const poolBefore = await (program.account as any).pool.fetch(seedPda("pool", u64Le(pool.id)));
          const tail = Number(poolBefore.queueTail);
          await program.methods
            .joinSolo(new anchor.BN(pool.id), Array.from(cA), sessionA.publicKey)
            .accounts({ player: a.publicKey, playerTokenAccount: aTok, queueEntry: seedPda("entry", u64Le(pool.id), u64Le(tail)) })
            .signers([a]).rpc();
          const poolAfter = await (program.account as any).pool.fetch(seedPda("pool", u64Le(pool.id)));
          const head = Number(poolAfter.queueHead);
          const matchId = Number(poolAfter.nextMatchId);
          const headEntry = await (program.account as any).queueEntry.fetch(seedPda("entry", u64Le(pool.id), u64Le(head)));
          await program.methods
            .joinAndMatch(new anchor.BN(pool.id), Array.from(cB), sessionB.publicKey)
            .accounts({
              player: b.publicKey,
              headPlayer: headEntry.player,
              playerTokenAccount: bTok,
              headEntry: seedPda("entry", u64Le(pool.id), u64Le(head)),
              theMatch: seedPda("match", u64Le(pool.id), u64Le(matchId)),
            }).signers([b]).rpc();

          const tJoinDone = Date.now();

          // ─── REVEAL PHASE ───
          await program.methods
            .reveal(new anchor.BN(pool.id), new anchor.BN(matchId), moveA, Array.from(nonceA))
            .accounts({ signer: sessionA.publicKey, mint: RPS_MINT, treasuryToken: RPS_TREASURY_ATA, playerAToken: aTok, playerBToken: bTok })
            .signers([sessionA]).rpc();
          await program.methods
            .reveal(new anchor.BN(pool.id), new anchor.BN(matchId), moveB, Array.from(nonceB))
            .accounts({ signer: sessionB.publicKey, mint: RPS_MINT, treasuryToken: RPS_TREASURY_ATA, playerAToken: aTok, playerBToken: bTok })
            .signers([sessionB]).rpc();

          const tEnd = Date.now();
          const m = await (program.account as any).match.fetch(seedPda("match", u64Le(pool.id), u64Le(matchId)));
          if (!JSON.stringify(m.state).includes("resolved")) throw new Error("not resolved");

          const out = moveA === moveB ? "TIE" : (((moveA===1&&moveB===3)||(moveA===2&&moveB===1)||(moveA===3&&moveB===2)) ? "A" : "B");
          timings.push({ join: tJoinDone - tStart, reveal: tEnd - tJoinDone, total: tEnd - tStart, pool: pool.label, outcome: out });
          process.stdout.write(out === "TIE" ? "=" : ".");
        } else {
          // ── SOL game ──
          const poolBefore = await (program.account as any).solPool.fetch(seedPda("sol_pool", u64Le(pool.id)));
          const tail = Number(poolBefore.queueTail);
          await program.methods
            .joinSolSolo(new anchor.BN(pool.id), Array.from(cA), sessionA.publicKey)
            .accounts({ player: a.publicKey, solQueueEntry: seedPda("sol_entry", u64Le(pool.id), u64Le(tail)) })
            .signers([a]).rpc();
          const poolAfter = await (program.account as any).solPool.fetch(seedPda("sol_pool", u64Le(pool.id)));
          const head = Number(poolAfter.queueHead);
          const matchId = Number(poolAfter.nextMatchId);
          const headEntry = await (program.account as any).solQueueEntry.fetch(seedPda("sol_entry", u64Le(pool.id), u64Le(head)));
          await program.methods
            .joinSolAndMatch(new anchor.BN(pool.id), Array.from(cB), sessionB.publicKey)
            .accounts({
              player: b.publicKey,
              headPlayer: headEntry.player,
              headEntry: seedPda("sol_entry", u64Le(pool.id), u64Le(head)),
              theMatch: seedPda("sol_match", u64Le(pool.id), u64Le(matchId)),
            }).signers([b]).rpc();

          const tJoinDone = Date.now();

          await program.methods
            .revealSol(new anchor.BN(pool.id), new anchor.BN(matchId), moveA, Array.from(nonceA))
            .accounts({ signer: sessionA.publicKey, solTreasury: SOL_TREASURY, solBurnWallet: SOL_BURN_WALLET, playerA: a.publicKey, playerB: b.publicKey })
            .signers([sessionA]).rpc();
          await program.methods
            .revealSol(new anchor.BN(pool.id), new anchor.BN(matchId), moveB, Array.from(nonceB))
            .accounts({ signer: sessionB.publicKey, solTreasury: SOL_TREASURY, solBurnWallet: SOL_BURN_WALLET, playerA: a.publicKey, playerB: b.publicKey })
            .signers([sessionB]).rpc();

          const tEnd = Date.now();
          const m = await (program.account as any).solMatch.fetch(seedPda("sol_match", u64Le(pool.id), u64Le(matchId)));
          if (!JSON.stringify(m.state).includes("resolved")) throw new Error("not resolved");

          const out = moveA === moveB ? "TIE" : (((moveA===1&&moveB===3)||(moveA===2&&moveB===1)||(moveA===3&&moveB===2)) ? "A" : "B");
          timings.push({ join: tJoinDone - tStart, reveal: tEnd - tJoinDone, total: tEnd - tStart, pool: pool.label, outcome: out });
          process.stdout.write(out === "TIE" ? "=" : ".");
        }
      } catch (e: any) {
        errs++; totalErrors++;
        process.stdout.write("✗");
      }
      if ((i + 1) % 20 === 0) process.stdout.write(` ${i+1}\n`);
      await sleep(150);
    }
    console.log(`\n  ${pool.label} done — ${pool.games - errs}/${pool.games} ok`);
  }

  // ─── REPORT ───
  console.log(`\n╔═════════════════════ TIMINGS ═════════════════════╗`);
  console.log(`Total games tracked: ${timings.length}`);
  console.log(`Total errors:        ${totalErrors}`);

  function stats(arr: number[]) {
    if (arr.length === 0) return null;
    const sorted = [...arr].sort((a,b) => a-b);
    return {
      min: sorted[0],
      median: sorted[Math.floor(sorted.length / 2)],
      p95: sorted[Math.floor(sorted.length * 0.95)],
      max: sorted[sorted.length - 1],
      avg: Math.round(arr.reduce((a,b)=>a+b,0) / arr.length),
    };
  }

  console.log(`\nReveal phase (joinAndMatch → resolved):`);
  const allReveal = timings.map(t => t.reveal);
  const r = stats(allReveal);
  if (r) {
    console.log(`  min:    ${r.min}ms`);
    console.log(`  median: ${r.median}ms`);
    console.log(`  p95:    ${r.p95}ms`);
    console.log(`  max:    ${r.max}ms`);
    console.log(`  avg:    ${r.avg}ms`);
  }

  console.log(`\nTotal game time (join → resolved):`);
  const allTotal = timings.map(t => t.total);
  const t = stats(allTotal);
  if (t) {
    console.log(`  min:    ${t.min}ms`);
    console.log(`  median: ${t.median}ms`);
    console.log(`  p95:    ${t.p95}ms`);
    console.log(`  max:    ${t.max}ms`);
    console.log(`  avg:    ${t.avg}ms`);
  }

  console.log(`\nPer-pool reveal timing:`);
  for (const pool of POOLS) {
    const ar = timings.filter(t => t.pool === pool.label).map(t => t.reveal);
    const s = stats(ar);
    if (s) console.log(`  ${pool.label.padEnd(11)} (n=${ar.length}): median ${s.median}ms · p95 ${s.p95}ms · max ${s.max}ms`);
  }

  process.exit(totalErrors > 0 ? 1 : 0);
})().catch(e => { console.error("FATAL:", e?.message ?? e); process.exit(2); });
