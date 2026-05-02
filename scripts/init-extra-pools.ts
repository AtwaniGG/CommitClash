/**
 * Initialize the additional stake-tier pools beyond POOL_30K (already deployed).
 *   POOL_100K (id=1)  — 100,000 $RPS entry
 *   POOL_1M   (id=2)  — 1,000,000 $RPS entry
 *
 * Run with: pnpm exec tsx scripts/init-extra-pools.ts
 */
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey, clusterApiUrl } from "@solana/web3.js";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

const PROGRAM_ID = new PublicKey("DymxJfPVGFD3BD1DWk6KeXaj7uPQhSFo2xXB3A8LuBFG");
const MINT = new PublicKey("AyKZ2a5CRZX3sMihAQ6CbBJJPjoYqwL9dneaAS7GFGRL");

const POOLS_TO_INIT: [number, bigint, string][] = [
  [1, 100_000n * 1_000_000n, "POOL_100K"],
  [2, 1_000_000n * 1_000_000n, "POOL_1M"],
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
  const connection = new Connection(clusterApiUrl("devnet"), "confirmed");
  const provider = new anchor.AnchorProvider(
    connection,
    new anchor.Wallet(admin),
    { commitment: "confirmed" }
  );
  anchor.setProvider(provider);
  const idlPath = path.join(__dirname, "..", "target/idl/rps_onchain.json");
  const idl = JSON.parse(fs.readFileSync(idlPath, "utf-8"));
  const program = new Program(idl, provider) as Program<any>;

  for (const [id, entryAmount, label] of POOLS_TO_INIT) {
    const [poolPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("pool"), u64Le(id)],
      PROGRAM_ID
    );
    const existing = await connection.getAccountInfo(poolPda);
    if (existing) {
      console.log(`✓ ${label} (id=${id}) already initialized at ${poolPda.toBase58()}`);
      continue;
    }
    console.log(
      `Initializing ${label} (id=${id}, entry=${entryAmount} raw)...`
    );
    const sig = await program.methods
      .initializePool(new anchor.BN(id), new anchor.BN(entryAmount.toString()))
      .accounts({ admin: admin.publicKey, mint: MINT } as any)
      .signers([admin])
      .rpc();
    console.log(`  ✓ tx: ${sig}`);
  }

  console.log("\nDone.");
})().catch((e) => {
  console.error("ERROR:", e?.message ?? e);
  process.exit(1);
});
