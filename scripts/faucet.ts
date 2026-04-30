/**
 * Sends $RPS test tokens to a specified address on devnet.
 *
 * Usage:
 *   pnpm exec tsx scripts/faucet.ts <recipient-address> [amount-tokens]
 *
 * Default amount: 100,000 $RPS (enough for 3+ POOL_30K games)
 */

import {
  Connection,
  Keypair,
  PublicKey,
  clusterApiUrl,
  sendAndConfirmTransaction,
  Transaction,
  SystemProgram,
} from "@solana/web3.js";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

const MINT = new PublicKey("AyKZ2a5CRZX3sMihAQ6CbBJJPjoYqwL9dneaAS7GFGRL");
const DECIMALS = 6;

(async () => {
  const recipientStr = process.argv[2];
  if (!recipientStr) {
    console.error("Usage: tsx scripts/faucet.ts <recipient-address> [amount-tokens]");
    process.exit(1);
  }
  const recipient = new PublicKey(recipientStr);
  const tokens = process.argv[3] ? Number(process.argv[3]) : 100_000;
  const rawAmount = BigInt(tokens) * 10n ** BigInt(DECIMALS);

  const walletPath = path.join(os.homedir(), ".config/solana/id.json");
  const admin = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(walletPath, "utf-8")))
  );
  const connection = new Connection(clusterApiUrl("devnet"), "confirmed");

  const adminAta = getAssociatedTokenAddressSync(MINT, admin.publicKey);
  const recipientAta = getAssociatedTokenAddressSync(MINT, recipient);

  // Fund recipient with a tiny bit of SOL so they can transact (if they're brand new)
  const recipientLamports = await connection.getBalance(recipient);
  if (recipientLamports < 100_000_000) {
    console.log(`Sending 0.1 SOL to ${recipient.toBase58()}...`);
    const tx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: admin.publicKey,
        toPubkey: recipient,
        lamports: 100_000_000,
      })
    );
    const sig = await sendAndConfirmTransaction(connection, tx, [admin]);
    console.log("  ✓ SOL tx:", sig);
  }

  console.log(
    `Sending ${tokens.toLocaleString()} $RPS (${rawAmount} raw) to ${recipient.toBase58()}...`
  );
  const tx = new Transaction()
    .add(
      createAssociatedTokenAccountIdempotentInstruction(
        admin.publicKey,
        recipientAta,
        recipient,
        MINT
      )
    )
    .add(
      createTransferInstruction(
        adminAta,
        recipientAta,
        admin.publicKey,
        rawAmount
      )
    );
  const sig = await sendAndConfirmTransaction(connection, tx, [admin]);
  console.log("  ✓ Token tx:", sig);
  console.log(
    `\nDone. Recipient now has at least ${tokens.toLocaleString()} $RPS for testing.`
  );
})().catch((e) => {
  console.error("ERROR:", e);
  process.exit(1);
});
