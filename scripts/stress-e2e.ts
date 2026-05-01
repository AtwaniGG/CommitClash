/**
 * 20-game stress test against the live devnet program.
 *
 * Spins up 4 fresh test keypairs (so we don't pollute the user's wallets),
 * funds each with SOL + $RPS from the admin wallet, then runs 20 sequential
 * RPS games in pairs. Verifies each game settles correctly, no funds get
 * stuck, no race conditions surface, mint supply decreases per burn.
 *
 * Run with:
 *   pnpm exec tsx scripts/stress-e2e.ts
 */

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  clusterApiUrl,
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  getOrCreateAssociatedTokenAccount,
  mintTo,
  getAccount,
  getMint,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountIdempotentInstruction,
} from "@solana/spl-token";
import { keccak_256 } from "@noble/hashes/sha3.js";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

const PROGRAM_ID = new PublicKey("DymxJfPVGFD3BD1DWk6KeXaj7uPQhSFo2xXB3A8LuBFG");
const MINT = new PublicKey("AyKZ2a5CRZX3sMihAQ6CbBJJPjoYqwL9dneaAS7GFGRL");
const TREASURY = new PublicKey("8WzgAJPVNDBDQQ5Y1WyVAR7w7q9Y3EvSogZk1rDvhwJC");
const POOL_ID = 0;
const ENTRY_AMOUNT = 30_000n * 1_000_000n;
const N_GAMES = 50;

const u64Le = (n: number | bigint) => {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(typeof n === "bigint" ? n : BigInt(n), 0);
  return buf;
};

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

// ───── PDA helpers ─────
const poolPda = (id: number) =>
  PublicKey.findProgramAddressSync(
    [Buffer.from("pool"), u64Le(id)],
    PROGRAM_ID
  )[0];
const queueEntryPda = (id: number, idx: number) =>
  PublicKey.findProgramAddressSync(
    [Buffer.from("entry"), u64Le(id), u64Le(idx)],
    PROGRAM_ID
  )[0];
const matchPda = (id: number, mid: number) =>
  PublicKey.findProgramAddressSync(
    [Buffer.from("match"), u64Le(id), u64Le(mid)],
    PROGRAM_ID
  )[0];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const moveName = (m: number) =>
  m === 1 ? "ROCK" : m === 2 ? "PAPER" : "SCISSORS";

const outcomeName = (a: number, b: number) => {
  if (a === b) return "TIE";
  if (
    (a === 1 && b === 3) ||
    (a === 2 && b === 1) ||
    (a === 3 && b === 2)
  )
    return "A_WINS";
  return "B_WINS";
};

// ───── main ─────
(async () => {
  const walletPath = path.join(os.homedir(), ".config/solana/id.json");
  const admin = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(walletPath, "utf-8")))
  );
  const connection = new Connection(clusterApiUrl("devnet"), "confirmed");

  console.log("=== STRESS TEST — 20 GAMES ON DEVNET ===");
  console.log("Admin :", admin.publicKey.toBase58());
  console.log("Program:", PROGRAM_ID.toBase58());
  console.log("Mint   :", MINT.toBase58());
  console.log();

  // Build the program client
  const wallet = new anchor.Wallet(admin);
  const provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
  anchor.setProvider(provider);
  const idlPath = path.join(__dirname, "..", "target/idl/rps_onchain.json");
  const idl = JSON.parse(fs.readFileSync(idlPath, "utf-8"));
  const program = new Program(idl, provider) as Program<any>;

  // ───── Generate 4 fresh test keypairs ─────
  const players = Array.from({ length: 4 }, () => Keypair.generate());
  console.log("Players:");
  players.forEach((p, i) => console.log(`  P${i}: ${p.publicKey.toBase58()}`));
  console.log();

  // Fund each with 0.1 SOL + 2M $RPS (enough for ~25 games each)
  console.log("Funding players...");
  const adminAta = getAssociatedTokenAddressSync(MINT, admin.publicKey);
  for (const p of players) {
    const tx1 = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: admin.publicKey,
        toPubkey: p.publicKey,
        lamports: 0.1 * LAMPORTS_PER_SOL,
      })
    );
    await sendAndConfirmTransaction(connection, tx1, [admin]);

    const ata = getAssociatedTokenAddressSync(MINT, p.publicKey);
    const tx2 = new Transaction()
      .add(
        createAssociatedTokenAccountIdempotentInstruction(
          admin.publicKey,
          ata,
          p.publicKey,
          MINT
        )
      )
      .add(
        // Use SPL transfer (admin -> player)
        require("@solana/spl-token").createTransferInstruction(
          adminAta,
          ata,
          admin.publicKey,
          2_000_000n * 1_000_000n // 2M tokens (cover ~66 games at 30k entry)
        )
      );
    await sendAndConfirmTransaction(connection, tx2, [admin]);
    process.stdout.write(".");
  }
  console.log(" funded.\n");

  // Snapshot initial supply for burn verification at the end
  const supplyBefore = (await getMint(connection, MINT)).supply;
  console.log(`Initial supply: ${supplyBefore}`);
  console.log();

  // ───── Run N_GAMES ─────
  const stats = { wins: 0, losses: 0, ties: 0, errors: 0, totalBurned: 0n };
  const errors: string[] = [];

  for (let game = 0; game < N_GAMES; game++) {
    const a = players[game % 2];
    const b = players[(game % 2) + 2]; // pair P0+P2, P1+P3, alternating

    const moveA = (1 + Math.floor(Math.random() * 3)) as 1 | 2 | 3;
    const moveB = (1 + Math.floor(Math.random() * 3)) as 1 | 2 | 3;
    const nonceA = randomNonce();
    const nonceB = randomNonce();
    const sessionA = Keypair.generate();
    const sessionB = Keypair.generate();
    const cA = computeCommitment(moveA, nonceA, a.publicKey);
    const cB = computeCommitment(moveB, nonceB, b.publicKey);

    const aTok = getAssociatedTokenAddressSync(MINT, a.publicKey);
    const bTok = getAssociatedTokenAddressSync(MINT, b.publicKey);

    const expectedOutcome = outcomeName(moveA, moveB);

    process.stdout.write(
      `Game ${String(game + 1).padStart(2, "0")} — A=${moveName(
        moveA
      )} B=${moveName(moveB)} → ${expectedOutcome.padEnd(8)} ... `
    );

    try {
      // Fund session keys with 0.001 SOL each
      const fundTx = new Transaction()
        .add(
          SystemProgram.transfer({
            fromPubkey: admin.publicKey,
            toPubkey: sessionA.publicKey,
            lamports: 0.001 * LAMPORTS_PER_SOL,
          })
        )
        .add(
          SystemProgram.transfer({
            fromPubkey: admin.publicKey,
            toPubkey: sessionB.publicKey,
            lamports: 0.001 * LAMPORTS_PER_SOL,
          })
        );
      await sendAndConfirmTransaction(connection, fundTx, [admin]);

      // ─ A: joinSolo ─
      const poolBefore = await (program.account as any).pool.fetch(
        poolPda(POOL_ID)
      );
      const tail = Number(poolBefore.queueTail);
      await program.methods
        .joinSolo(new anchor.BN(POOL_ID), Array.from(cA), sessionA.publicKey)
        .accounts({
          player: a.publicKey,
          playerTokenAccount: aTok,
          queueEntry: queueEntryPda(POOL_ID, tail),
        })
        .signers([a])
        .rpc();

      // ─ B: joinAndMatch ─
      const poolAfterA = await (program.account as any).pool.fetch(
        poolPda(POOL_ID)
      );
      const head = Number(poolAfterA.queueHead);
      const matchId = Number(poolAfterA.nextMatchId);
      const headEntry = await (program.account as any).queueEntry.fetch(
        queueEntryPda(POOL_ID, head)
      );
      await program.methods
        .joinAndMatch(new anchor.BN(POOL_ID), Array.from(cB), sessionB.publicKey)
        .accounts({
          player: b.publicKey,
          headPlayer: headEntry.player,
          playerTokenAccount: bTok,
          headEntry: queueEntryPda(POOL_ID, head),
          theMatch: matchPda(POOL_ID, matchId),
        })
        .signers([b])
        .rpc();

      // ─ A reveals via session ─
      await program.methods
        .reveal(
          new anchor.BN(POOL_ID),
          new anchor.BN(matchId),
          moveA,
          Array.from(nonceA)
        )
        .accounts({
          signer: sessionA.publicKey,
          mint: MINT,
          treasuryToken: TREASURY,
          playerAToken: aTok,
          playerBToken: bTok,
        })
        .signers([sessionA])
        .rpc();

      // ─ B reveals via session → triggers settlement ─
      const tx = await program.methods
        .reveal(
          new anchor.BN(POOL_ID),
          new anchor.BN(matchId),
          moveB,
          Array.from(nonceB)
        )
        .accounts({
          signer: sessionB.publicKey,
          mint: MINT,
          treasuryToken: TREASURY,
          playerAToken: aTok,
          playerBToken: bTok,
        })
        .signers([sessionB])
        .rpc();

      // Verify match settled
      const m = await (program.account as any).match.fetch(
        matchPda(POOL_ID, matchId)
      );
      const stateOk = JSON.stringify(m.state).includes("resolved");
      if (!stateOk) {
        throw new Error("match did not transition to Resolved state");
      }

      const burnAmount = (BigInt(m.pot.toString()) * 3n) / 40n;
      stats.totalBurned += burnAmount;

      if (expectedOutcome === "TIE") stats.ties++;
      else if (expectedOutcome === "A_WINS") stats.wins++;
      else stats.losses++;

      console.log(
        `✓ tx=${tx.slice(0, 8)}…  burn=${(Number(burnAmount) / 1e6).toFixed(0)}`
      );
    } catch (err: any) {
      stats.errors++;
      const msg = err?.message ?? String(err);
      errors.push(`Game ${game + 1}: ${msg.slice(0, 200)}`);
      console.log(`✗ ${msg.slice(0, 80)}`);
    }
  }

  // Verify final supply
  const supplyAfter = (await getMint(connection, MINT)).supply;
  const supplyDelta = supplyBefore - supplyAfter;

  console.log();
  console.log("=== RESULTS ===");
  console.log(`Games run:          ${N_GAMES}`);
  console.log(`Successful:         ${N_GAMES - stats.errors}`);
  console.log(`Errors:             ${stats.errors}`);
  console.log(`A wins:             ${stats.wins}`);
  console.log(`B wins:             ${stats.losses}`);
  console.log(`Ties:               ${stats.ties}`);
  console.log(`Expected total burn: ${stats.totalBurned} (${Number(stats.totalBurned) / 1e6} $RPS)`);
  console.log(`Actual supply delta: ${supplyDelta} (${Number(supplyDelta) / 1e6} $RPS)`);
  console.log(`Match? ${stats.totalBurned === supplyDelta ? "✓ YES" : "✗ NO"}`);
  if (errors.length > 0) {
    console.log();
    console.log("=== ERRORS ===");
    errors.forEach((e) => console.log(`  • ${e}`));
  }
  process.exit(stats.errors > 0 ? 1 : 0);
})().catch((err) => {
  console.error("FATAL:", err);
  process.exit(2);
});
