import { Keypair } from "@solana/web3.js";

/**
 * Generates an ephemeral Ed25519 keypair held only in browser memory + localStorage.
 * The on-chain `join_*` instruction registers the public key as the authorized
 * reveal-signer for the next match. The secret key never leaves the browser.
 *
 * Compromise of the session key cannot drain funds — its only on-chain
 * authority is to call `reveal` on a match where the player's wallet has
 * already escrowed entry tokens.
 */
export function generateSessionKey(): Keypair {
  return Keypair.generate();
}

export function exportSessionSecret(kp: Keypair): string {
  return Buffer.from(kp.secretKey).toString("base64");
}

export function importSessionSecret(b64: string): Keypair {
  const secret = Uint8Array.from(Buffer.from(b64, "base64"));
  return Keypair.fromSecretKey(secret);
}
