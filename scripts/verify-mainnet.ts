/**
 * Sanity-check every mainnet PDA after running mainnet-launch.ts.
 * Reports a green-tick / red-cross checklist; exits non-zero on any miss.
 *
 * Usage: same env as mainnet-launch.ts, then:
 *   pnpm exec tsx scripts/verify-mainnet.ts
 */
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { getMint, getAccount, getAssociatedTokenAddressSync } from "@solana/spl-token";
import * as fs from "fs"; import * as os from "os"; import * as path from "path";

const PROGRAM_ID = new PublicKey(process.env.PROGRAM_ID!);
const RPS_MINT = new PublicKey(process.env.RPS_MINT!);
const TREASURY_ATA = new PublicKey(process.env.TREASURY_ATA!);
const SOL_TREASURY = new PublicKey(process.env.SOL_TREASURY!);
const SOL_BURN_WALLET = new PublicKey(process.env.SOL_BURN_WALLET!);
const RPC_URL = process.env.RPC_URL ?? "https://api.mainnet-beta.solana.com";
const ADMIN_KEYPAIR_PATH =
  process.env.ADMIN_KEYPAIR ?? path.join(os.homedir(), ".config/solana/id.json");

const u64Le = (n: number | bigint) => {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(typeof n === "bigint" ? n : BigInt(n), 0);
  return buf;
};
const pda = (seed: string, ...extra: Buffer[]) =>
  PublicKey.findProgramAddressSync([Buffer.from(seed), ...extra], PROGRAM_ID)[0];

(async () => {
  const admin = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(ADMIN_KEYPAIR_PATH, "utf-8")))
  );
  const conn = new Connection(RPC_URL, "confirmed");
  const provider = new anchor.AnchorProvider(conn, new anchor.Wallet(admin), { commitment: "confirmed" });
  anchor.setProvider(provider);
  const idl = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "target/idl/rps_onchain.json"), "utf-8"));
  const program = new Program(idl, provider) as Program<any>;

  let failed = 0;
  const check = (ok: boolean, label: string) => {
    console.log((ok ? "✓ " : "✗ ") + label);
    if (!ok) failed++;
  };

  console.log(`\n── Program ${PROGRAM_ID.toBase58().slice(0, 8)}…\n`);

  // 1. Program is deployed
  const progAcc = await conn.getAccountInfo(PROGRAM_ID);
  check(!!progAcc?.executable, "Program account exists and is executable");

  // 2. Mint exists, has decimals=6
  const mint = await getMint(conn, RPS_MINT).catch(() => null);
  check(!!mint, "$RPS mint exists");
  if (mint) {
    check(mint.decimals === 6, `$RPS decimals = 6 (got ${mint.decimals})`);
    console.log(`    supply: ${(Number(mint.supply) / 10 ** mint.decimals).toLocaleString()} $RPS`);
  }

  // 3. Treasury ATA matches mint
  const treasuryAcc = await getAccount(conn, TREASURY_ATA).catch(() => null);
  check(!!treasuryAcc, "Treasury ATA exists");
  if (treasuryAcc) {
    check(treasuryAcc.mint.equals(RPS_MINT), "Treasury ATA mint matches $RPS");
  }

  // 4. Config
  try {
    const cfg = await (program.account as any).config.fetch(pda("config"));
    check(cfg.mint.toBase58() === RPS_MINT.toBase58(), "Config.mint matches");
    check(cfg.treasury.toBase58() === TREASURY_ATA.toBase58(), "Config.treasury matches");
    check(cfg.admin.toBase58() === admin.publicKey.toBase58(), "Config.admin matches signer");
  } catch {
    check(false, "Config PDA not initialized");
  }

  // 5. GlobalStats
  try {
    await (program.account as any).globalStats.fetch(pda("stats"));
    check(true, "GlobalStats PDA initialized");
  } catch {
    check(false, "GlobalStats PDA not initialized");
  }

  // 6. RPS pools
  for (const id of [0, 1, 2]) {
    try {
      const pool = await (program.account as any).pool.fetch(pda("pool", u64Le(id)));
      const entry = Number(pool.entryAmount.toString()) / 1e6;
      check(true, `Pool ${id} initialized — entry ${entry} $RPS`);
      // Check vault token account exists with 0 balance + correct mint
      const vault = await getAccount(conn, pda("vault", u64Le(id))).catch(() => null);
      check(!!vault && vault.mint.equals(RPS_MINT), `  Vault ${id} ATA exists with $RPS mint`);
    } catch {
      check(false, `Pool ${id} not initialized`);
    }
  }

  // 7. SolConfig
  try {
    const sc = await (program.account as any).solConfig.fetch(pda("sol_config"));
    check(sc.solTreasury.toBase58() === SOL_TREASURY.toBase58(), "SolConfig.sol_treasury matches");
    check(sc.solBurnWallet.toBase58() === SOL_BURN_WALLET.toBase58(), "SolConfig.sol_burn_wallet matches");
  } catch {
    check(false, "SolConfig not initialized");
  }

  // 8. SolGlobalStats
  try {
    await (program.account as any).solGlobalStats.fetch(pda("sol_stats"));
    check(true, "SolGlobalStats initialized");
  } catch {
    check(false, "SolGlobalStats not initialized");
  }

  // 9. SOL pools
  for (const id of [0, 1, 2]) {
    try {
      const pool = await (program.account as any).solPool.fetch(pda("sol_pool", u64Le(id)));
      const entry = Number(pool.entryAmount.toString()) / LAMPORTS_PER_SOL;
      check(true, `SolPool ${id} initialized — entry ${entry} SOL`);
      const vaultInfo = await conn.getAccountInfo(pda("sol_vault", u64Le(id)));
      check(!!vaultInfo, `  SolVault ${id} PDA exists`);
    } catch {
      check(false, `SolPool ${id} not initialized`);
    }
  }

  console.log();
  if (failed > 0) {
    console.log(`✗ ${failed} check(s) failed`);
    process.exit(1);
  } else {
    console.log("✓ All checks passed — mainnet is healthy.");
  }
})().catch((e) => {
  console.error("FATAL:", e?.message ?? e);
  process.exit(2);
});
