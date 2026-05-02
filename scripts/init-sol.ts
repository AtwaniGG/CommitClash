/**
 * Initialize the SOL parallel world after the program upgrade has shipped.
 *
 *   1. SolConfig + SolGlobalStats — admin sets sol_treasury + sol_burn_wallet
 *   2. SolPool 0  — 0.015 SOL entry  (≈ $2 with SOL ~ $130)
 *   3. SolPool 1  — 0.05 SOL entry   (≈ $6.50)
 *   4. SolPool 2  — 0.5 SOL entry    (≈ $65)
 *
 * Pool IDs match the existing RPS pool IDs so the frontend can show RPS and
 * SOL options on the same /play/[poolId] page.
 *
 * Re-runnable: skips anything that already exists on chain.
 *
 * Run with:  pnpm exec tsx scripts/init-sol.ts
 */
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

const PROGRAM_ID = new PublicKey("DymxJfPVGFD3BD1DWk6KeXaj7uPQhSFo2xXB3A8LuBFG");

// ─── Configure these for your deploy ───
const SOL_TREASURY = new PublicKey("8WzgAJPVNDBDQQ5Y1WyVAR7w7q9Y3EvSogZk1rDvhwJC");
const SOL_BURN_WALLET = new PublicKey("DQ4NGW79Vs8DNqyJniMbx8E1v3ZEvarsHB7m1N6pNNUJ");
const REVEAL_TIMEOUT_SLOTS = 1500n; // ~10 min

const RPC = "https://devnet.helius-rpc.com/?api-key=71628f63-3f6b-4076-b2ff-4d7ed3fece0f";

// Lamports per pool. All values must be multiples of 20 lamports for clean
// 7.5/85% splits. 0.015 SOL = 15_000_000 lamports → divisible by 20 ✓.
const POOLS_TO_INIT: [number, bigint, string][] = [
  [0, BigInt(Math.round(0.015 * LAMPORTS_PER_SOL)), "SOL_POOL_0 (0.015 SOL ~ $2)"],
  [1, BigInt(Math.round(0.05 * LAMPORTS_PER_SOL)), "SOL_POOL_1 (0.05 SOL ~ $6.50)"],
  [2, BigInt(Math.round(0.5 * LAMPORTS_PER_SOL)), "SOL_POOL_2 (0.5 SOL ~ $65)"],
];

const u64Le = (n: number | bigint) => {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(typeof n === "bigint" ? n : BigInt(n), 0);
  return buf;
};

(async () => {
  const walletPath = path.join(os.homedir(), ".config/solana/id.json");
  const admin = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(walletPath, "utf-8")))
  );
  const connection = new Connection(RPC, "confirmed");
  const provider = new anchor.AnchorProvider(
    connection,
    new anchor.Wallet(admin),
    { commitment: "confirmed" }
  );
  anchor.setProvider(provider);
  const idlPath = path.join(__dirname, "..", "target/idl/rps_onchain.json");
  const idl = JSON.parse(fs.readFileSync(idlPath, "utf-8"));
  const program = new Program(idl, provider) as Program<any>;

  // 1. SolConfig
  const [solConfigPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("sol_config")],
    PROGRAM_ID
  );
  const existingConfig = await connection.getAccountInfo(solConfigPda);
  if (existingConfig) {
    console.log(`✓ SolConfig already exists at ${solConfigPda.toBase58()}`);
  } else {
    console.log(`Initializing SolConfig...`);
    console.log(`  sol_treasury     = ${SOL_TREASURY.toBase58()}`);
    console.log(`  sol_burn_wallet  = ${SOL_BURN_WALLET.toBase58()}`);
    const sig = await program.methods
      .initializeSolConfig(
        SOL_TREASURY,
        SOL_BURN_WALLET,
        new anchor.BN(REVEAL_TIMEOUT_SLOTS.toString())
      )
      .accounts({ admin: admin.publicKey } as any)
      .signers([admin])
      .rpc();
    console.log(`  ✓ tx: ${sig}`);
  }

  // 2. SolPools
  for (const [id, entryLamports, label] of POOLS_TO_INIT) {
    const [solPoolPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("sol_pool"), u64Le(id)],
      PROGRAM_ID
    );
    const existing = await connection.getAccountInfo(solPoolPda);
    if (existing) {
      console.log(`✓ ${label} already initialized at ${solPoolPda.toBase58()}`);
      continue;
    }
    console.log(`Initializing ${label}...`);
    const sig = await program.methods
      .initializeSolPool(new anchor.BN(id), new anchor.BN(entryLamports.toString()))
      .accounts({ admin: admin.publicKey } as any)
      .signers([admin])
      .rpc();
    console.log(`  ✓ tx: ${sig}`);
  }

  console.log("\nDone. SOL world is live.");
})().catch((e) => {
  console.error("ERROR:", e?.message ?? e);
  process.exit(1);
});
