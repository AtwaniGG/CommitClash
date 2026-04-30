/**
 * One-shot devnet initialization:
 *   1. Calls program.initialize(reveal_timeout_slots, treasury)
 *   2. Calls program.initializePool(0, 30_000 * 10^6) — POOL_30K
 *
 * Run with: pnpm exec tsx scripts/init-devnet.ts
 */

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey, clusterApiUrl } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

const PROGRAM_ID = new PublicKey("DymxJfPVGFD3BD1DWk6KeXaj7uPQhSFo2xXB3A8LuBFG");
const MINT = new PublicKey("AyKZ2a5CRZX3sMihAQ6CbBJJPjoYqwL9dneaAS7GFGRL");
const REVEAL_TIMEOUT_SLOTS = 1500; // ~10 min
const POOL_ID = 0;
const ENTRY_AMOUNT = 30_000n * 1_000_000n; // 30k tokens × 6 decimals

const u64Le = (n: number | bigint) => {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(typeof n === "bigint" ? n : BigInt(n), 0);
  return buf;
};

(async () => {
  // Load admin wallet
  const walletPath = path.join(os.homedir(), ".config/solana/id.json");
  const secretKey = Uint8Array.from(JSON.parse(fs.readFileSync(walletPath, "utf-8")));
  const admin = Keypair.fromSecretKey(secretKey);
  console.log("Admin:", admin.publicKey.toBase58());

  // Connect to devnet
  const connection = new Connection(
    process.env.RPC_URL ?? clusterApiUrl("devnet"),
    "confirmed"
  );

  const wallet = new anchor.Wallet(admin);
  const provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
  anchor.setProvider(provider);

  // Load IDL from target/
  const idlPath = path.join(__dirname, "..", "target/idl/rps_onchain.json");
  const idl = JSON.parse(fs.readFileSync(idlPath, "utf-8"));
  const program = new Program(idl, provider) as Program<any>;
  console.log("Program:", program.programId.toBase58());

  // Treasury = admin's ATA for the mint
  const treasury = getAssociatedTokenAddressSync(MINT, admin.publicKey);
  console.log("Treasury ATA:", treasury.toBase58());

  // ───── Step 1: initialize ─────
  const [configPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("config")],
    PROGRAM_ID
  );
  const configAcc = await connection.getAccountInfo(configPda);
  if (configAcc) {
    console.log("Config already initialized at", configPda.toBase58(), "— skipping");
  } else {
    console.log("Calling initialize…");
    const sig = await program.methods
      .initialize(new anchor.BN(REVEAL_TIMEOUT_SLOTS))
      .accounts({
        admin: admin.publicKey,
        mint: MINT,
        treasury,
      } as any)
      .signers([admin])
      .rpc();
    console.log("  ✓ Config + GlobalStats created. tx:", sig);
  }

  // ───── Step 2: initialize POOL_30K ─────
  const [poolPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("pool"), u64Le(POOL_ID)],
    PROGRAM_ID
  );
  const poolAcc = await connection.getAccountInfo(poolPda);
  if (poolAcc) {
    console.log("Pool", POOL_ID, "already initialized — skipping");
  } else {
    console.log("Calling initializePool(", POOL_ID, ",", ENTRY_AMOUNT.toString(), ")…");
    const sig = await program.methods
      .initializePool(new anchor.BN(POOL_ID), new anchor.BN(ENTRY_AMOUNT.toString()))
      .accounts({
        admin: admin.publicKey,
        mint: MINT,
      } as any)
      .signers([admin])
      .rpc();
    console.log("  ✓ Pool", POOL_ID, "+ Vault + PoolStats created. tx:", sig);
  }

  console.log("\n=== ON-CHAIN STATE ===");
  const config = await program.account.config.fetch(configPda);
  console.log("Config:", {
    admin: config.admin.toBase58(),
    mint: config.mint.toBase58(),
    treasury: config.treasury.toBase58(),
    revealTimeoutSlots: config.revealTimeoutSlots.toString(),
  });
  const pool = await program.account.pool.fetch(poolPda);
  console.log("Pool[0]:", {
    poolId: pool.poolId.toString(),
    entryAmount: pool.entryAmount.toString(),
    queueHead: pool.queueHead.toString(),
    queueTail: pool.queueTail.toString(),
  });

  console.log("\n✓ Devnet initialized.");
  console.log("Next: paste this into apps/web/.env.local:");
  console.log(`  NEXT_PUBLIC_RPS_MINT=${MINT.toBase58()}`);
})().catch((err) => {
  console.error("ERROR:", err);
  process.exit(1);
});
