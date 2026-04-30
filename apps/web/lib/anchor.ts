/**
 * Anchor program client wiring. Live on Solana devnet.
 *   Program: DymxJfPVGFD3BD1DWk6KeXaj7uPQhSFo2xXB3A8LuBFG
 *   Mint:    AyKZ2a5CRZX3sMihAQ6CbBJJPjoYqwL9dneaAS7GFGRL  (devnet test stand-in for $RPS)
 */

import { AnchorProvider, Program, type Idl } from "@coral-xyz/anchor";
import { type Connection, PublicKey } from "@solana/web3.js";
import type {
  AnchorWallet,
} from "@solana/wallet-adapter-react";
import idlJson from "./idl/rps_onchain.json";

export const PROGRAM_ID = new PublicKey(
  process.env.NEXT_PUBLIC_PROGRAM_ID ??
    "DymxJfPVGFD3BD1DWk6KeXaj7uPQhSFo2xXB3A8LuBFG"
);

export const RPS_MINT = new PublicKey(
  process.env.NEXT_PUBLIC_RPS_MINT ??
    "AyKZ2a5CRZX3sMihAQ6CbBJJPjoYqwL9dneaAS7GFGRL"
);

export const TREASURY = new PublicKey(
  process.env.NEXT_PUBLIC_TREASURY ??
    "8WzgAJPVNDBDQQ5Y1WyVAR7w7q9Y3EvSogZk1rDvhwJC"
);

export const RPS_IDL = idlJson as Idl;

/**
 * Build a read-only or wallet-backed Anchor Program client.
 * Pass undefined wallet for read-only.
 */
export function getProgram(
  connection: Connection,
  wallet?: AnchorWallet
): Program {
  const provider = wallet
    ? new AnchorProvider(connection, wallet, { commitment: "confirmed" })
    : new AnchorProvider(
        connection,
        // Read-only stub wallet — never signs.
        {
          publicKey: PublicKey.default,
          signTransaction: () => Promise.reject(new Error("read-only")),
          signAllTransactions: () => Promise.reject(new Error("read-only")),
        } as unknown as AnchorWallet,
        { commitment: "confirmed" }
      );
  return new Program(RPS_IDL, provider);
}

// ------ PDA derivers (mirror the seeds used in the Rust program) ------

export function configPda(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([Buffer.from("config")], PROGRAM_ID);
}

export function globalStatsPda(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([Buffer.from("stats")], PROGRAM_ID);
}

export function poolPda(poolId: number | bigint): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("pool"), u64Le(poolId)],
    PROGRAM_ID
  );
}

export function poolStatsPda(poolId: number | bigint): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("pool_stats"), u64Le(poolId)],
    PROGRAM_ID
  );
}

export function vaultPda(poolId: number | bigint): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), u64Le(poolId)],
    PROGRAM_ID
  );
}

export function queueEntryPda(
  poolId: number | bigint,
  index: number | bigint
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("entry"), u64Le(poolId), u64Le(index)],
    PROGRAM_ID
  );
}

export function matchPda(
  poolId: number | bigint,
  matchId: number | bigint
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("match"), u64Le(poolId), u64Le(matchId)],
    PROGRAM_ID
  );
}

export function playerStatsPda(player: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("player"), player.toBuffer()],
    PROGRAM_ID
  );
}

// Cross-platform u64 LE encoder. Browser Buffer polyfills don't reliably
// ship writeBigUInt64LE, so we use DataView which works everywhere.
function u64Le(n: number | bigint): Uint8Array {
  const buf = new Uint8Array(8);
  new DataView(buf.buffer).setBigUint64(
    0,
    typeof n === "bigint" ? n : BigInt(n),
    true // little-endian
  );
  return buf;
}
