/**
 * Drain any stranded queue entries across all 6 pools by calling joinAndMatch
 * (or joinSolAndMatch) from a fresh keypair. The match created is intentionally
 * abandoned (no reveal); it'll time out in ~10 min. After this, queues are
 * clean and a stress test can run without hitting QueueNotEmpty cascades.
 */
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import {
  Connection, Keypair, PublicKey, SystemProgram, Transaction,
  sendAndConfirmTransaction, LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferInstruction,
} from "@solana/spl-token";
import { keccak_256 } from "@noble/hashes/sha3.js";
import * as fs from "fs"; import * as os from "os"; import * as path from "path";

const RPC = "https://devnet.helius-rpc.com/?api-key=71628f63-3f6b-4076-b2ff-4d7ed3fece0f";
const PROGRAM_ID = new PublicKey("DymxJfPVGFD3BD1DWk6KeXaj7uPQhSFo2xXB3A8LuBFG");
const RPS_MINT = new PublicKey("AyKZ2a5CRZX3sMihAQ6CbBJJPjoYqwL9dneaAS7GFGRL");

const RPS_POOLS = [
  { id: 0, entry: 30_000n * 1_000_000n, label: "RPS_30K" },
  { id: 1, entry: 100_000n * 1_000_000n, label: "RPS_100K" },
  { id: 2, entry: 1_000_000n * 1_000_000n, label: "RPS_1M" },
];
const SOL_POOLS = [
  { id: 0, entry: 15_000_000n,  label: "SOL_0.015" },
  { id: 1, entry: 50_000_000n,  label: "SOL_0.05" },
  { id: 2, entry: 500_000_000n, label: "SOL_0.5" },
];

const u64Le = (n: number | bigint) => {
  const b = Buffer.alloc(8); b.writeBigUInt64LE(typeof n === "bigint" ? n : BigInt(n), 0); return b;
};
const computeCommitment = (move: number, nonce: Uint8Array, player: PublicKey) => {
  const data = new Uint8Array(65); data[0] = move; data.set(nonce, 1); data.set(player.toBytes(), 33);
  return keccak_256(data);
};
const randomNonce = () => { const b = new Uint8Array(32); for (let i = 0; i < 32; i++) b[i] = Math.floor(Math.random()*256); return b; };

(async () => {
  const walletPath = path.join(os.homedir(), ".config/solana/id.json");
  const admin = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(walletPath, "utf-8"))));
  const conn = new Connection(RPC, "confirmed");
  const provider = new anchor.AnchorProvider(conn, new anchor.Wallet(admin), { commitment: "confirmed" });
  anchor.setProvider(provider);
  const idl = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "target/idl/rps_onchain.json"), "utf-8"));
  const program = new Program(idl, provider) as Program<any>;
  const adminAta = getAssociatedTokenAddressSync(RPS_MINT, admin.publicKey);

  for (const p of RPS_POOLS) {
    const [poolPda] = PublicKey.findProgramAddressSync([Buffer.from("pool"), u64Le(p.id)], PROGRAM_ID);
    const acc = await (program.account as any).pool.fetch(poolPda);
    const head = BigInt(acc.queueHead.toString()), tail = BigInt(acc.queueTail.toString());
    if (tail <= head) { console.log(`✓ ${p.label} clean`); continue; }
    console.log(`! ${p.label} has ${tail-head} stranded — draining…`);

    while (true) {
      const acc2 = await (program.account as any).pool.fetch(poolPda);
      const h = BigInt(acc2.queueHead.toString()), t = BigInt(acc2.queueTail.toString());
      if (t <= h) break;
      const [headEntryAddr] = PublicKey.findProgramAddressSync(
        [Buffer.from("entry"), u64Le(p.id), u64Le(Number(h))], PROGRAM_ID);
      const headEntry = await (program.account as any).queueEntry.fetch(headEntryAddr);
      const stranded = new PublicKey(headEntry.player);
      const drainer = Keypair.generate();
      // fund drainer
      await sendAndConfirmTransaction(conn, new Transaction().add(
        SystemProgram.transfer({ fromPubkey: admin.publicKey, toPubkey: drainer.publicKey, lamports: 0.05 * LAMPORTS_PER_SOL })
      ), [admin]);
      const drainerAta = getAssociatedTokenAddressSync(RPS_MINT, drainer.publicKey);
      await sendAndConfirmTransaction(conn, new Transaction()
        .add(createAssociatedTokenAccountIdempotentInstruction(admin.publicKey, drainerAta, drainer.publicKey, RPS_MINT))
        .add(createTransferInstruction(adminAta, drainerAta, admin.publicKey, p.entry * 2n)),
        [admin]);
      const move = 1; const nonce = randomNonce(); const session = Keypair.generate();
      const commit = computeCommitment(move, nonce, drainer.publicKey);
      const matchId = Number(acc2.nextMatchId);
      const [matchAddr] = PublicKey.findProgramAddressSync(
        [Buffer.from("match"), u64Le(p.id), u64Le(matchId)], PROGRAM_ID);
      try {
        await program.methods
          .joinAndMatch(new anchor.BN(p.id), Array.from(commit), session.publicKey)
          .accounts({
            player: drainer.publicKey,
            headPlayer: stranded,
            playerTokenAccount: drainerAta,
            headEntry: headEntryAddr,
            theMatch: matchAddr,
          })
          .signers([drainer]).rpc();
        console.log(`  drained head=${h}`);
      } catch (e: any) {
        console.log(`  drain failed: ${(e?.message ?? String(e)).slice(0, 120)}`);
        break;
      }
    }
  }

  for (const p of SOL_POOLS) {
    const [poolPda] = PublicKey.findProgramAddressSync([Buffer.from("sol_pool"), u64Le(p.id)], PROGRAM_ID);
    const acc = await (program.account as any).solPool.fetch(poolPda);
    const head = BigInt(acc.queueHead.toString()), tail = BigInt(acc.queueTail.toString());
    if (tail <= head) { console.log(`✓ ${p.label} clean`); continue; }
    console.log(`! ${p.label} has ${tail-head} stranded — draining…`);

    while (true) {
      const acc2 = await (program.account as any).solPool.fetch(poolPda);
      const h = BigInt(acc2.queueHead.toString()), t = BigInt(acc2.queueTail.toString());
      if (t <= h) break;
      const [headEntryAddr] = PublicKey.findProgramAddressSync(
        [Buffer.from("sol_entry"), u64Le(p.id), u64Le(Number(h))], PROGRAM_ID);
      const headEntry = await (program.account as any).solQueueEntry.fetch(headEntryAddr);
      const stranded = new PublicKey(headEntry.player);
      const drainer = Keypair.generate();
      const fundLamports = Number(p.entry) * 3 + 0.01 * LAMPORTS_PER_SOL;
      await sendAndConfirmTransaction(conn, new Transaction().add(
        SystemProgram.transfer({ fromPubkey: admin.publicKey, toPubkey: drainer.publicKey, lamports: fundLamports })
      ), [admin]);
      const move = 1; const nonce = randomNonce(); const session = Keypair.generate();
      const commit = computeCommitment(move, nonce, drainer.publicKey);
      const matchId = Number(acc2.nextMatchId);
      const [matchAddr] = PublicKey.findProgramAddressSync(
        [Buffer.from("sol_match"), u64Le(p.id), u64Le(matchId)], PROGRAM_ID);
      try {
        await program.methods
          .joinSolAndMatch(new anchor.BN(p.id), Array.from(commit), session.publicKey)
          .accounts({
            player: drainer.publicKey,
            headPlayer: stranded,
            headEntry: headEntryAddr,
            theMatch: matchAddr,
          })
          .signers([drainer]).rpc();
        console.log(`  drained head=${h}`);
      } catch (e: any) {
        console.log(`  drain failed: ${(e?.message ?? String(e)).slice(0, 120)}`);
        break;
      }
    }
  }

  console.log("\nDone.");
})().catch(e => { console.error("FATAL:", e?.message ?? e); process.exit(1); });
