/**
 * Tracks pending plays so we can auto-reveal even after a tab close / refresh.
 * Schema: keyed by `wallet:commitmentHex`. One pending entry per wallet/pool at a time.
 */

import type { MoveName } from "./commit";

const STORAGE_PREFIX = "rps-onchain.pending.v1";

export interface PendingPlay {
  walletPubkey: string;
  poolId: number;
  move: MoveName;
  nonceHex: string;
  commitmentHex: string;
  sessionSecretB64: string;
  createdAt: number;
}

function makeKey(wallet: string, commitmentHex: string) {
  return `${STORAGE_PREFIX}:${wallet}:${commitmentHex}`;
}

export function savePendingPlay(p: PendingPlay): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(
    makeKey(p.walletPubkey, p.commitmentHex),
    JSON.stringify(p)
  );
}

export function loadPendingPlaysForWallet(wallet: string): PendingPlay[] {
  if (typeof window === "undefined") return [];
  const out: PendingPlay[] = [];
  const prefix = `${STORAGE_PREFIX}:${wallet}:`;
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k || !k.startsWith(prefix)) continue;
    try {
      const v = localStorage.getItem(k);
      if (v) out.push(JSON.parse(v) as PendingPlay);
    } catch {
      // Ignore corrupted entries
    }
  }
  return out.sort((a, b) => b.createdAt - a.createdAt);
}

export function clearPendingPlay(wallet: string, commitmentHex: string): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(makeKey(wallet, commitmentHex));
}

export function bytesToHex(b: Uint8Array): string {
  return Array.from(b)
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}

export function hexToBytes(h: string): Uint8Array {
  const clean = h.startsWith("0x") ? h.slice(2) : h;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.substr(i * 2, 2), 16);
  }
  return out;
}
