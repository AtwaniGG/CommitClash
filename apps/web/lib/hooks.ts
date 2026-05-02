"use client";

import { useEffect, useRef, useState } from "react";
import { useConnection } from "@solana/wallet-adapter-react";
import { Connection } from "@solana/web3.js";
import { EventParser, BorshCoder } from "@coral-xyz/anchor";
import bs58 from "bs58";
import { PROGRAM_ID, poolPda, solPoolPda, RPS_IDL } from "./anchor";

const KNOWN_POOL_IDS = [0, 1, 2];

// Pool struct layout (raw bytes after discriminator):
//   pool_id u64      → bytes  8-15
//   entry_amount u64 → bytes 16-23
//   queue_head u64   → bytes 24-31
//   queue_tail u64   → bytes 32-39
const POOL_HEAD_OFFSET = 8 + 8 + 8;
const POOL_TAIL_OFFSET = POOL_HEAD_OFFSET + 8;

// Base58-encoded discriminators used as memcmp filters for filtered
// getProgramAccounts — returns only matching accounts with zero data,
// keeping the payload tiny enough for Helius free-tier browser requests.
const MATCH_DISC = bs58.encode(
  Uint8Array.from([236, 63, 169, 38, 15, 56, 196, 162])
);
const PLAYER_STATS_DISC = bs58.encode(
  Uint8Array.from([169, 146, 242, 176, 102, 118, 231, 172])
);

export interface FeedEvent {
  kind:
    | "Matched"
    | "Resolved"
    | "TimeoutResolved"
    | "QueueJoined"
    | "EntryCancelled"
    | "PoolInitialized"
    | "Revealed";
  signature: string;
  slot: number;
  data: any;
  timestamp: number;
}

export interface LiveMetrics {
  inQueue: number;
  matchesActive: number;
  totalPlayers: number;
  events: FeedEvent[];
  loading: boolean;
}

// Heavy getProgramAccounts runs only every 5 min — those count as "heavy"
// on Helius free tier. Light pool reads + events run every 30s.
const POLL_MS = 30_000;
const HEAVY_POLL_MS = 5 * 60_000;
const SIG_LIMIT = 6;

// ─── Module-level shared state ────────────────────────────────────────────
// The poller is a singleton but the `connection` object it should use must
// always be the latest one from the wallet-adapter context. We store it in
// a mutable ref rather than closing over it at mount time, so any tick
// invocation uses the current connection regardless of when the poller was
// started.
let __connection: Connection | null = null;
let __metricsCache: LiveMetrics = {
  inQueue: 0,
  matchesActive: 0,
  totalPlayers: 0,
  events: [],
  loading: true,
};
const __subscribers = new Set<(m: LiveMetrics) => void>();
let __pollerStarted = false;
let __lastHeavyAt = 0;
let __ticking = false; // prevents concurrent overlapping ticks

async function runTick() {
  if (!__connection || __ticking) return;
  __ticking = true;
  const conn = __connection;
  try {
    // ─── inQueue: lightweight multi-account read ───────────────────────
    // 3 pool accounts in a single getMultipleAccountsInfo call — well under
    // any payload limit. inQueue = Σ(queue_tail − queue_head) across pools.
    // Read both RPS and SOL pool PDAs (mirrors of each other) in one
    // multi-account call. SolPool has the same head/tail layout as Pool.
    const rpsPoolKeys = KNOWN_POOL_IDS.map((id) => poolPda(id)[0]);
    const solPoolKeys = KNOWN_POOL_IDS.map((id) => solPoolPda(id)[0]);
    const poolInfos = await conn.getMultipleAccountsInfo([
      ...rpsPoolKeys,
      ...solPoolKeys,
    ]);
    let inQueue = 0;
    for (const info of poolInfos) {
      if (!info) continue;
      // Browser Buffer polyfill lacks readBigUInt64LE — use DataView instead.
      const bytes = new Uint8Array(info.data as unknown as ArrayBuffer);
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      const head = view.getBigUint64(POOL_HEAD_OFFSET, true);
      const tail = view.getBigUint64(POOL_TAIL_OFFSET, true);
      if (tail > head) inQueue += Number(tail - head);
    }

    // ─── matchesActive + totalPlayers: heavy, refreshed slowly ────────
    let matches = __metricsCache.matchesActive;
    let totalPlayers = __metricsCache.totalPlayers;
    const now = Date.now();
    if (now - __lastHeavyAt >= HEAVY_POLL_MS) {
      __lastHeavyAt = now;
      try {
        const [matchAccs, playerAccs] = await Promise.all([
          conn.getProgramAccounts(PROGRAM_ID, {
            dataSlice: { offset: 0, length: 0 },
            filters: [{ memcmp: { offset: 0, bytes: MATCH_DISC } }],
          }),
          conn.getProgramAccounts(PROGRAM_ID, {
            dataSlice: { offset: 0, length: 0 },
            filters: [{ memcmp: { offset: 0, bytes: PLAYER_STATS_DISC } }],
          }),
        ]);
        matches = matchAccs.length;
        totalPlayers = playerAccs.length;
      } catch (e) {
        console.warn("[useLiveMetrics] heavy refresh failed:", e);
      }
    }

    // ─── Recent events ─────────────────────────────────────────────────
    // getTransactions() (plural) sends a JSON-RPC batch — blocked on Helius
    // free tier (-32403). Fetch each tx individually in parallel instead.
    const sigs = await conn.getSignaturesForAddress(PROGRAM_ID, { limit: SIG_LIMIT });
    const opts = { commitment: "confirmed" as const, maxSupportedTransactionVersion: 0 };
    const txs = await Promise.all(
      sigs.map((s) => conn.getTransaction(s.signature, opts).catch(() => null))
    );
    const parser = new EventParser(PROGRAM_ID, new BorshCoder(RPS_IDL as any));
    const events: FeedEvent[] = [];
    for (let i = 0; i < txs.length; i++) {
      const tx = txs[i];
      const sig = sigs[i];
      if (!tx?.meta?.logMessages) continue;
      try {
        for (const event of parser.parseLogs(tx.meta.logMessages)) {
          events.push({
            kind: event.name as FeedEvent["kind"],
            signature: sig.signature,
            slot: tx.slot,
            data: event.data,
            timestamp: (sig.blockTime ?? 0) * 1000,
          });
        }
      } catch { /* CPI noise — skip */ }
    }

    console.log(`[useLiveMetrics] OK · inQueue=${inQueue} matches=${matches} players=${totalPlayers}`);
    __metricsCache = { inQueue, matchesActive: matches, totalPlayers, events, loading: false };
    __subscribers.forEach((cb) => cb(__metricsCache));
  } catch (err) {
    console.error("[useLiveMetrics] tick FAILED:", err);
    __metricsCache = { ...__metricsCache, loading: false };
    __subscribers.forEach((cb) => cb(__metricsCache));
  } finally {
    __ticking = false;
  }
}

// Call this from PlayPanel after a successful queue join / match resolution
// to show updated counts immediately without waiting for the next interval.
export function refreshMetrics() {
  runTick();
}

function ensurePoller() {
  if (__pollerStarted) return;
  __pollerStarted = true;

  const visibleTick = () => {
    if (typeof document !== "undefined" && document.hidden) return;
    runTick();
  };

  visibleTick();
  setInterval(visibleTick, POLL_MS);

  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) visibleTick();
    });
  }
}

export function useLiveMetrics(): LiveMetrics {
  const { connection } = useConnection();
  const [m, setM] = useState<LiveMetrics>(__metricsCache);

  // Keep the module-level connection ref current so runTick() always uses
  // the latest RPC endpoint (important when wallet or provider changes).
  useEffect(() => {
    __connection = connection;
  }, [connection]);

  useEffect(() => {
    __subscribers.add(setM);
    setM(__metricsCache);
    ensurePoller();
    return () => { __subscribers.delete(setM); };
  }, []);

  return m;
}

export function useGlobalStats() {
  const { connection } = useConnection();
  const [data, setData] = useState<{
    roundsPlayed: bigint;
    totalBurned: bigint;
    totalToTreasury: bigint;
    totalVolume: bigint;
    supply: bigint;
    decimals: number;
    treasuryBal: bigint;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval>;
    async function tick() {
      try {
        const { fetchGlobalStats, fetchSupplyInfo } = await import("./program");
        const { TREASURY } = await import("./anchor");
        const { getAccount } = await import("@solana/spl-token");
        const stats = await fetchGlobalStats(connection);
        const supplyInfo = await fetchSupplyInfo(connection);
        const treasuryAcc = await getAccount(connection, TREASURY).catch(() => null);
        if (!cancelled && stats) {
          setData({ ...stats, ...supplyInfo, treasuryBal: treasuryAcc?.amount ?? 0n });
        }
      } catch { /* ignore */ }
    }
    const visibleTick = () => {
      if (typeof document !== "undefined" && document.hidden) return;
      tick();
    };
    visibleTick();
    timer = setInterval(visibleTick, 60_000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [connection]);

  return data;
}
