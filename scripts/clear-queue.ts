/**
 * Clear any stranded queue entry on POOL_30K via cancel_queue_entry.
 * Permissionless — anyone can call after the reveal timeout (1500 slots).
 */
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  PublicKey,
  clusterApiUrl,
} from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

const PROGRAM_ID = new PublicKey("DymxJfPVGFD3BD1DWk6KeXaj7uPQhSFo2xXB3A8LuBFG");
const MINT = new PublicKey("AyKZ2a5CRZX3sMihAQ6CbBJJPjoYqwL9dneaAS7GFGRL");
const POOL_ID = 0;

const u64Le = (n: number) => {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(BigInt(n), 0);
  return b;
};
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
  const idl = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, "..", "target/idl/rps_onchain.json"),
      "utf-8"
    )
  );
  const program = new Program(idl, provider) as Program<any>;

  const pool = await (program.account as any).pool.fetch(poolPda(POOL_ID));
  const head = Number(pool.queueHead);
  const tail = Number(pool.queueTail);
  console.log(`queue: head=${head} tail=${tail}`);
  if (head === tail) {
    console.log("Queue empty — nothing to clear.");
    return;
  }

  const entry = await (program.account as any).queueEntry.fetch(
    queueEntryPda(POOL_ID, head)
  );
  const headPlayer = new PublicKey(entry.player);
  const headPlayerAta = getAssociatedTokenAddressSync(MINT, headPlayer);
  console.log("Stranded entry's player:", headPlayer.toBase58());
  console.log("Calling cancelQueueEntry...");

  const tx = await program.methods
    .cancelQueueEntry(new anchor.BN(POOL_ID))
    .accounts({
      caller: admin.publicKey,
      headPlayer,
      headPlayerToken: headPlayerAta,
    })
    .signers([admin])
    .rpc();
  console.log("✓ Canceled. tx:", tx);

  const poolAfter = await (program.account as any).pool.fetch(poolPda(POOL_ID));
  console.log(
    `queue after: head=${poolAfter.queueHead} tail=${poolAfter.queueTail}`
  );
})().catch((e) => {
  console.error("ERROR:", e?.message ?? e);
  process.exit(1);
});
