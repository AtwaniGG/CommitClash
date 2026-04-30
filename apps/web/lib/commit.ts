import { keccak_256 } from "@noble/hashes/sha3.js";
import { PublicKey } from "@solana/web3.js";

/**
 * commitment = keccak256(move ‖ nonce ‖ wallet_pubkey)
 * Mirrors the on-chain `compute_commitment` helper in state.rs.
 */
export function computeCommitment(
  moveValue: 1 | 2 | 3,
  nonce: Uint8Array,
  wallet: PublicKey
): Uint8Array {
  if (nonce.length !== 32) throw new Error("nonce must be 32 bytes");
  const data = new Uint8Array(1 + 32 + 32);
  data[0] = moveValue;
  data.set(nonce, 1);
  data.set(wallet.toBytes(), 33);
  return keccak_256(data);
}

export function generateNonce(): Uint8Array {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return arr;
}

export const MOVE_VALUE = { rock: 1, paper: 2, scissors: 3 } as const;
export type MoveName = keyof typeof MOVE_VALUE;
