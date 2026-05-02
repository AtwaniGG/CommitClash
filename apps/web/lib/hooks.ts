"use client";

import { useEffect, useState } from "react";
import { useConnection } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { EventParser, BorshCoder } from "@coral-xyz/anchor";
import { PROGRAM_ID, getProgram, RPS_IDL } from "./anchor";

// Read discriminators straight from the IDL JSON. Anchor 0.31 doesn't expose
// them as `program.account.X.discriminator` reliably — going to the source.
const ACCOUNTS_IDL = (RPS_IDL as any).accounts ?? [];
const QUEUE_ENTRY_DISC = new Uint8Array(
  ACCOUNTS_IDL.find((a: any) => a.name === "QueueEntry")?.discriminator ?? []
);
const MATCH_DISC = new Uint8Array(
  ACCOUNTS_IDL.find((a: any) => a.name === "Match")?.discriminator ?? []
);
const PLAYER_STATS_DISC = new Uint8Array(
  ACCOUNTS_IDL.find((a: any) => a.name === "PlayerStats")?.discriminator ?? []
);

function discMatches(data: Uint8Array, disc: Uint8Array): boolean {
  if (disc.length !== 8 || data.length < 8) return false;
  for (let i = 0; i < 8; i++) if (data[i] !== disc[i]) return false;
  return true;
}

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
  inQueue: number;        // QueueEntry accounts that exist right now
  matchesActive: number;  // Match accounts in AwaitingReveals
  totalPlayers: number;   // PlayerStats accounts ever created (all-time players)
  events: FeedEvent[];    // most-recent program events
  loading: boolean;
}

// Free devnet RPC is rate-limited (~100 req/min). Be conservative.
// Set NEXT_PUBLIC_RPC_URL to a private RPC (Helius / QuickNode / Triton)
// to lift this constraint and tighten the intervals.
const POLL_MS = 45_000;        // metrics tick (was 30s)
const SIG_LIMIT = 8;           // signatures pulled per tick (was 12)

// Shared cache so multiple consumers (Header + Marquee) trigger one poll loop, not many.
let __metricsCache: LiveMetrics = {
  inQueue: 0,
  matchesActive: 0,
  totalPlayers: 0,
  events: [],
  loading: true,
};
const __subscribers = new Set<(m: LiveMetrics) => void>();
let __pollerStarted = false;

export function useLiveMetrics(): LiveMetrics {
  const { connection } = useConnection();
  const [m, setM] = useState<LiveMetrics>(__metricsCache);

  useEffect(() => {
    let cancelled = false;
    __subscribers.add(setM);
    setM(__metricsCache);

    async function tick() {
      try {
        // ─── Live counts via getProgramAccounts ───
        const accs = await connection.getProgramAccounts(PROGRAM_ID, {
          dataSlice: { offset: 0, length: 8 },
        });

        let inQueue = 0;
        let matches = 0;
        let totalPlayers = 0;
        for (const a of accs) {
          const data = new Uint8Array(a.account.data);
          if (discMatches(data, QUEUE_ENTRY_DISC)) inQueue++;
          else if (discMatches(data, MATCH_DISC)) matches++;
          else if (discMatches(data, PLAYER_STATS_DISC)) totalPlayers++;
        }

        // ─── Recent events via EventParser (Anchor's official log parser) ───
        const sigs = await connection.getSignaturesForAddress(PROGRAM_ID, {
          limit: SIG_LIMIT,
        });
        const txs = await connection.getTransactions(
          sigs.map((s) => s.signature),
          { commitment: "confirmed", maxSupportedTransactionVersion: 0 }
        );

        const parser = new EventParser(
          PROGRAM_ID,
          new BorshCoder(RPS_IDL as any)
        );

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
          } catch {
            // Some logs may include stack/CPI noise that doesn't decode — skip silently.
          }
        }

        if (!cancelled) {
          __metricsCache = {
            inQueue,
            matchesActive: matches,
            totalPlayers,
            events,
            loading: false,
          };
          __subscribers.forEach((cb) => cb(__metricsCache));
        }
      } catch (err) {
        if (!cancelled) {
          __metricsCache = { ...__metricsCache, loading: false };
          __subscribers.forEach((cb) => cb(__metricsCache));
        }
      }
    }

    // Singleton poller with visibility-pause: only fires when the tab is
    // actually focused. Idle background tabs stop hammering the RPC.
    if (!__pollerStarted) {
      __pollerStarted = true;
      const visibleTick = () => {
        if (typeof document !== "undefined" && document.hidden) return;
        tick();
      };
      visibleTick();
      const id = setInterval(visibleTick, POLL_MS);
      (globalThis as any).__metricsTimer = id;

      // Trigger an immediate tick when the user returns to the tab so they
      // see fresh data right away (instead of waiting up to 45s).
      if (typeof document !== "undefined") {
        document.addEventListener("visibilitychange", () => {
          if (!document.hidden) visibleTick();
        });
      }
    }

    return () => {
      cancelled = true;
      __subscribers.delete(setM);
    };
  }, [connection]);

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
          setData({
            ...stats,
            ...supplyInfo,
            treasuryBal: treasuryAcc?.amount ?? 0n,
          });
        }
      } catch {
        // ignore
      }
    }
    const visibleTick = () => {
      if (typeof document !== "undefined" && document.hidden) return;
      tick();
    };
    visibleTick();
    timer = setInterval(visibleTick, 60_000); // was 45s — bumped to 60s
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [connection]);

  return data;
}
