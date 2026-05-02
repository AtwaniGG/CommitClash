/**
 * 50-game SOL-only stress test. Closes the gap left by the main stress run
 * which ran out of $RPS funding before reaching the SOL pools.
 *
 * Distribution:  30 games SOL_0.015 + 15 games SOL_0.05 + 5 games SOL_0.5 = 50
 *
 * Run:  pnpm exec tsx scripts/stress-sol-only.ts
 */
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import {
  Connection, Keypair, PublicKey, SystemProgram, Transaction,
  sendAndConfirmTransaction, LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { keccak_256 } from "@noble/hashes/sha3.js";
import * as fs from "fs"; import * as os from "os"; import * as path from "path";

const RPC = "https://devnet.helius-rpc.com/?api-key=71628f63-3f6b-4076-b2ff-4d7ed3fece0f";
const PROGRAM_ID = new PublicKey("DymxJfPVGFD3BD1DWk6KeXaj7uPQhSFo2xXB3A8LuBFG");
const SOL_TREASURY = new PublicKey("8WzgAJPVNDBDQQ5Y1WyVAR7w7q9Y3EvSogZk1rDvhwJC");
const SOL_BURN_WALLET = new PublicKey("DQ4NGW79Vs8DNqyJniMbx8E1v3ZEvarsHB7m1N6pNNUJ");

const POOLS = [
  { id: 0, entry: 15_000_000n,  games: 30, label: "SOL_0.015" },
  { id: 1, entry: 50_000_000n,  games:  8, label: "SOL_0.05"  },
  { id: 2, entry: 500_000_000n, games:  1, label: "SOL_0.5"   },
];

const u64Le = (n: number | bigint) => {
  const b = Buffer.alloc(8); b.writeBigUInt64LE(typeof n === "bigint" ? n : BigInt(n), 0); return b;
};
const solPoolPda = (id: number) => PublicKey.findProgramAddressSync([Buffer.from("sol_pool"), u64Le(id)], PROGRAM_ID)[0];
const solQueueEntryPda = (id: number, idx: number) => PublicKey.findProgramAddressSync([Buffer.from("sol_entry"), u64Le(id), u64Le(idx)], PROGRAM_ID)[0];
const solMatchPda = (id: number, mid: number) => PublicKey.findProgramAddressSync([Buffer.from("sol_match"), u64Le(id), u64Le(mid)], PROGRAM_ID)[0];

const computeCommitment = (move: number, nonce: Uint8Array, player: PublicKey) => {
  const data = new Uint8Array(65); data[0] = move; data.set(nonce, 1); data.set(player.toBytes(), 33);
  return keccak_256(data);
};
const randomNonce = () => { const b = new Uint8Array(32); for (let i = 0; i < 32; i++) b[i] = Math.floor(Math.random()*256); return b; };
const outcomeName = (a: number, b: number) =>
  a === b ? "TIE" : ((a===1&&b===3)||(a===2&&b===1)||(a===3&&b===2)) ? "A" : "B";
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function withRetry<T>(fn: () => Promise<T>, attempts = 2): Promise<T> {
  let last: any;
  for (let i = 0; i < attempts; i++) {
    try { return await fn(); }
    catch (err: any) {
      last = err;
      const m = (err?.message ?? '').toLowerCase();
      if (!(m.includes('429')||m.includes('blockhash')||m.includes('timeout'))) throw err;
      await sleep(300 * (i + 1));
    }
  }
  throw last;
}

(async () => {
  const walletPath = path.join(os.homedir(), ".config/solana/id.json");
  const admin = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(walletPath, "utf-8"))));
  const conn = new Connection(RPC, "confirmed");
  const provider = new anchor.AnchorProvider(conn, new anchor.Wallet(admin), { commitment: "confirmed" });
  anchor.setProvider(provider);
  const idl = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "target/idl/rps_onchain.json"), "utf-8"));
  const program = new Program(idl, provider) as Program<any>;

  console.log(`SOL stress test — ${POOLS.reduce((s,p)=>s+p.games,0)} games across 3 SOL pools`);
  console.log(`Admin balance: ${(await conn.getBalance(admin.publicKey))/1e9} SOL\n`);

  const players = Array.from({ length: 4 }, () => Keypair.generate());
  // Very lean initial funding — per-game top-ups handle the rest. We need
  // admin to keep most of its 1.1 SOL as reserve for the SOL_0.5 game.
  console.log("Funding 4 fresh players (0.1 SOL each)...");
  for (const p of players) {
    await sendAndConfirmTransaction(conn, new Transaction().add(
      SystemProgram.transfer({ fromPubkey: admin.publicKey, toPubkey: p.publicKey, lamports: 0.1 * LAMPORTS_PER_SOL })
    ), [admin]);
    process.stdout.write('.');
  }
  console.log(' funded.\n');

  const stats: Record<string, any> = {};

  for (const pool of POOLS) {
    console.log(`── ${pool.label} : ${pool.games} games ─`);
    const s = { wins: 0, losses: 0, ties: 0, errors: 0, errs: [] as string[] };

    for (let i = 0; i < pool.games; i++) {
      const a = players[i % 2];
      const b = players[(i % 2) + 2];

      // Top up either player if balance dips below 2× entry
      const need = Number(pool.entry) * 2;
      for (const p of [a, b]) {
        const bal = await conn.getBalance(p.publicKey).catch(() => Infinity);
        if (bal < need) {
          const adminBal = await conn.getBalance(admin.publicKey);
          const want = Math.min(need * 2, adminBal - 0.05 * LAMPORTS_PER_SOL);
          if (want > 0) {
            await sendAndConfirmTransaction(conn, new Transaction().add(
              SystemProgram.transfer({ fromPubkey: admin.publicKey, toPubkey: p.publicKey, lamports: want })
            ), [admin]).catch(() => {});
          }
        }
      }

      const moveA = (1 + Math.floor(Math.random()*3)) as 1|2|3;
      const moveB = (1 + Math.floor(Math.random()*3)) as 1|2|3;
      const nonceA = randomNonce(), nonceB = randomNonce();
      const sessionA = Keypair.generate(), sessionB = Keypair.generate();
      const cA = computeCommitment(moveA, nonceA, a.publicKey);
      const cB = computeCommitment(moveB, nonceB, b.publicKey);

      try {
        await withRetry(() => sendAndConfirmTransaction(conn, new Transaction()
          .add(SystemProgram.transfer({ fromPubkey: admin.publicKey, toPubkey: sessionA.publicKey, lamports: 0.001*LAMPORTS_PER_SOL }))
          .add(SystemProgram.transfer({ fromPubkey: admin.publicKey, toPubkey: sessionB.publicKey, lamports: 0.001*LAMPORTS_PER_SOL })),
          [admin]));

        const poolBefore = await withRetry(() => (program.account as any).solPool.fetch(solPoolPda(pool.id)));
        const tail = Number(poolBefore.queueTail);
        await withRetry(() => program.methods
          .joinSolSolo(new anchor.BN(pool.id), Array.from(cA), sessionA.publicKey)
          .accounts({ player: a.publicKey, solQueueEntry: solQueueEntryPda(pool.id, tail) })
          .signers([a]).rpc());

        const poolAfter = await withRetry(() => (program.account as any).solPool.fetch(solPoolPda(pool.id)));
        const head = Number(poolAfter.queueHead);
        const matchId = Number(poolAfter.nextMatchId);
        const headEntry = await withRetry(() => (program.account as any).solQueueEntry.fetch(solQueueEntryPda(pool.id, head)));
        await withRetry(() => program.methods
          .joinSolAndMatch(new anchor.BN(pool.id), Array.from(cB), sessionB.publicKey)
          .accounts({
            player: b.publicKey,
            headPlayer: headEntry.player,
            headEntry: solQueueEntryPda(pool.id, head),
            theMatch: solMatchPda(pool.id, matchId),
          }).signers([b]).rpc());

        await withRetry(() => program.methods
          .revealSol(new anchor.BN(pool.id), new anchor.BN(matchId), moveA, Array.from(nonceA))
          .accounts({ signer: sessionA.publicKey, solTreasury: SOL_TREASURY, solBurnWallet: SOL_BURN_WALLET, playerA: a.publicKey, playerB: b.publicKey })
          .signers([sessionA]).rpc());

        await withRetry(() => program.methods
          .revealSol(new anchor.BN(pool.id), new anchor.BN(matchId), moveB, Array.from(nonceB))
          .accounts({ signer: sessionB.publicKey, solTreasury: SOL_TREASURY, solBurnWallet: SOL_BURN_WALLET, playerA: a.publicKey, playerB: b.publicKey })
          .signers([sessionB]).rpc());

        const m = await withRetry(() => (program.account as any).solMatch.fetch(solMatchPda(pool.id, matchId)));
        if (!JSON.stringify(m.state).includes("resolved")) throw new Error("not resolved");

        const out = outcomeName(moveA, moveB);
        if (out === "TIE") s.ties++;
        else if (out === "A") s.wins++;
        else s.losses++;
        process.stdout.write(out === "TIE" ? "=" : ".");
      } catch (err: any) {
        s.errors++;
        s.errs.push((err?.message ?? String(err)).slice(0, 150));
        process.stdout.write("✗");
      }
      await sleep(200);
    }
    console.log(`\n  → wins:${s.wins} losses:${s.losses} ties:${s.ties} errors:${s.errors}`);
    stats[pool.label] = s;
  }

  let totalGames = 0, totalErrors = 0;
  console.log(`\n═══ RESULTS ═══`);
  for (const pool of POOLS) {
    const s = stats[pool.label];
    const success = s.wins + s.losses + s.ties;
    totalGames += success + s.errors;
    totalErrors += s.errors;
    console.log(`  ${pool.label.padEnd(11)} → ${success}/${pool.games} success (${s.errors} errors)`);
  }
  console.log(`\nTotal: ${totalGames - totalErrors}/${totalGames} successful, ${totalErrors} errors`);
  process.exit(totalErrors > 0 ? 1 : 0);
})().catch(e => { console.error("FATAL:", e?.message ?? e); process.exit(2); });
