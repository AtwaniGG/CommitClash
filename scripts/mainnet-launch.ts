/**
 * One-shot MAINNET launch initialization.
 *
 * After the program is deployed (via `anchor deploy --provider.cluster mainnet`)
 * and you've created the $RPS token on pump.fun, run this script ONCE to
 * stand up every PDA the frontend expects:
 *   - Config           (singleton)
 *   - GlobalStats      (singleton)
 *   - Pool 0/1/2       (RPS stake tiers)
 *   - PoolStats 0/1/2
 *   - Vault 0/1/2      (SPL token accounts)
 *   - SolConfig        (singleton, separate world)
 *   - SolGlobalStats   (singleton)
 *   - SolPool 0/1/2    (lamport stake tiers)
 *   - SolPoolStats 0/1/2
 *   - SolVault 0/1/2
 *
 * Re-runnable: skips anything that already exists, so you can resume after
 * any partial failure (e.g. mid-script RPC blip).
 *
 * Usage:
 *   pnpm exec tsx scripts/mainnet-launch.ts
 *
 * Required env (load from .env.mainnet or export inline):
 *   PROGRAM_ID            — mainnet program id from `anchor deploy` output
 *   RPS_MINT              — pump.fun token mint address
 *   TREASURY_ATA          — token account that receives the 7.5% RPS treasury cut (must already exist)
 *   SOL_TREASURY          — wallet address that receives 7.5% SOL treasury cut
 *   SOL_BURN_WALLET       — wallet address for the 7.5% SOL "burn" routing (manual buyback target)
 *   ADMIN_KEYPAIR         — path to admin keypair JSON (defaults to ~/.config/solana/id.json)
 *   RPC_URL               — mainnet RPC (defaults to mainnet-beta public, but use Helius)
 *   REVEAL_TIMEOUT_SLOTS  — defaults to 1500 (~10 min)
 *
 * Pool entry amounts (RPS millionths and lamports) below — adjust if you want
 * different launch tiers. They must satisfy `entry % 20 == 0` so the 7.5%
 * splits land on integer values.
 */
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import {
  Connection, Keypair, PublicKey, LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import * as fs from "fs"; import * as os from "os"; import * as path from "path";

// ─── Required env validation ──────────────────────────────────────────────
function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`✗ Missing required env: ${name}`);
    process.exit(1);
  }
  return v;
}

const PROGRAM_ID = new PublicKey(requireEnv("PROGRAM_ID"));
const RPS_MINT = new PublicKey(requireEnv("RPS_MINT"));
const TREASURY_ATA = new PublicKey(requireEnv("TREASURY_ATA"));
const SOL_TREASURY = new PublicKey(requireEnv("SOL_TREASURY"));
const SOL_BURN_WALLET = new PublicKey(requireEnv("SOL_BURN_WALLET"));
const ADMIN_KEYPAIR_PATH =
  process.env.ADMIN_KEYPAIR ?? path.join(os.homedir(), ".config/solana/id.json");
const RPC_URL = process.env.RPC_URL ?? "https://api.mainnet-beta.solana.com";
const REVEAL_TIMEOUT_SLOTS = BigInt(process.env.REVEAL_TIMEOUT_SLOTS ?? "1500");

// ─── Pool tiers ────────────────────────────────────────────────────────────
// $RPS uses 6 decimals (matches pump.fun default). Adjust these if you want
// different launch entry sizes. Each must be divisible by 20.
const RPS_POOLS: [number, bigint, string][] = [
  [0,   30_000n * 1_000_000n, "POOL_30K"],
  [1,  100_000n * 1_000_000n, "POOL_100K"],
  [2, 1_000_000n * 1_000_000n, "POOL_1M"],
];
// SOL pools — lamports. Match these to current $RPS price at launch time.
const SOL_POOLS: [number, bigint, string][] = [
  [0, BigInt(Math.round(0.015 * LAMPORTS_PER_SOL)), "SOL_0.015"],
  [1, BigInt(Math.round(0.05 * LAMPORTS_PER_SOL)),  "SOL_0.05"],
  [2, BigInt(Math.round(0.5 * LAMPORTS_PER_SOL)),   "SOL_0.5"],
];

const u64Le = (n: number | bigint) => {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(typeof n === "bigint" ? n : BigInt(n), 0);
  return buf;
};

const pda = (seed: string, ...extra: Buffer[]) =>
  PublicKey.findProgramAddressSync([Buffer.from(seed), ...extra], PROGRAM_ID)[0];

// ─── Main ──────────────────────────────────────────────────────────────────
(async () => {
  const admin = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(ADMIN_KEYPAIR_PATH, "utf-8")))
  );
  const conn = new Connection(RPC_URL, "confirmed");
  const provider = new anchor.AnchorProvider(conn, new anchor.Wallet(admin), {
    commitment: "confirmed",
  });
  anchor.setProvider(provider);
  const idlPath = path.join(__dirname, "..", "target/idl/rps_onchain.json");
  const idl = JSON.parse(fs.readFileSync(idlPath, "utf-8"));
  const program = new Program(idl, provider) as Program<any>;

  console.log("╔════════════════════════════════════════════════════════════╗");
  console.log("║         COMMITCLASH MAINNET LAUNCH INITIALIZATION         ║");
  console.log("╚════════════════════════════════════════════════════════════╝");
  console.log(`Cluster        : ${RPC_URL.includes("mainnet") ? "mainnet-beta" : RPC_URL}`);
  console.log(`Program        : ${PROGRAM_ID.toBase58()}`);
  console.log(`Admin          : ${admin.publicKey.toBase58()}`);
  console.log(`Admin balance  : ${(await conn.getBalance(admin.publicKey)) / LAMPORTS_PER_SOL} SOL`);
  console.log(`$RPS mint      : ${RPS_MINT.toBase58()}`);
  console.log(`Treasury (RPS) : ${TREASURY_ATA.toBase58()}`);
  console.log(`SOL treasury   : ${SOL_TREASURY.toBase58()}`);
  console.log(`SOL burn       : ${SOL_BURN_WALLET.toBase58()}`);
  console.log(`Reveal timeout : ${REVEAL_TIMEOUT_SLOTS} slots\n`);

  // ─ Step 1: Config + GlobalStats ─
  const configPda = pda("config");
  if (await conn.getAccountInfo(configPda)) {
    console.log(`✓ Config already initialized at ${configPda.toBase58()}`);
  } else {
    console.log(`→ Initializing Config...`);
    const sig = await program.methods
      .initialize(new anchor.BN(REVEAL_TIMEOUT_SLOTS.toString()))
      .accounts({ admin: admin.publicKey, mint: RPS_MINT, treasury: TREASURY_ATA } as any)
      .signers([admin])
      .rpc();
    console.log(`  ✓ tx: ${sig}`);
  }

  // ─ Step 2: RPS pools ─
  for (const [id, entry, label] of RPS_POOLS) {
    const poolPda = pda("pool", u64Le(id));
    if (await conn.getAccountInfo(poolPda)) {
      console.log(`✓ ${label} already initialized at ${poolPda.toBase58()}`);
      continue;
    }
    console.log(`→ Initializing ${label} (entry: ${entry} = ${Number(entry)/1e6} $RPS)...`);
    const sig = await program.methods
      .initializePool(new anchor.BN(id), new anchor.BN(entry.toString()))
      .accounts({ admin: admin.publicKey, mint: RPS_MINT } as any)
      .signers([admin])
      .rpc();
    console.log(`  ✓ tx: ${sig}`);
  }

  // ─ Step 3: SolConfig + SolGlobalStats ─
  const solConfigPda = pda("sol_config");
  if (await conn.getAccountInfo(solConfigPda)) {
    console.log(`✓ SolConfig already initialized at ${solConfigPda.toBase58()}`);
  } else {
    console.log(`→ Initializing SolConfig...`);
    const sig = await program.methods
      .initializeSolConfig(SOL_TREASURY, SOL_BURN_WALLET, new anchor.BN(REVEAL_TIMEOUT_SLOTS.toString()))
      .accounts({ admin: admin.publicKey } as any)
      .signers([admin])
      .rpc();
    console.log(`  ✓ tx: ${sig}`);
  }

  // ─ Step 4: SOL pools ─
  for (const [id, entry, label] of SOL_POOLS) {
    const solPoolPda = pda("sol_pool", u64Le(id));
    if (await conn.getAccountInfo(solPoolPda)) {
      console.log(`✓ ${label} already initialized at ${solPoolPda.toBase58()}`);
      continue;
    }
    console.log(`→ Initializing ${label} (entry: ${entry} lamports = ${Number(entry)/LAMPORTS_PER_SOL} SOL)...`);
    const sig = await program.methods
      .initializeSolPool(new anchor.BN(id), new anchor.BN(entry.toString()))
      .accounts({ admin: admin.publicKey } as any)
      .signers([admin])
      .rpc();
    console.log(`  ✓ tx: ${sig}`);
  }

  console.log(`\n╔════════════════════════════════════════════════════════════╗`);
  console.log(`║                    MAINNET LAUNCH COMPLETE                 ║`);
  console.log(`╚════════════════════════════════════════════════════════════╝`);
  console.log(`\nNext steps:`);
  console.log(`  1. Update apps/web/.env.production with the same env vars used here`);
  console.log(`  2. Deploy frontend: vercel --prod`);
  console.log(`  3. Run scripts/verify-mainnet.ts to confirm every PDA is healthy`);
})().catch((e) => {
  console.error("FATAL:", e?.message ?? e);
  process.exit(1);
});
