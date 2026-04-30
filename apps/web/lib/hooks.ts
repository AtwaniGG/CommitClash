"use client";

import { useEffect, useState } from "react";
import { useConnection } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { PROGRAM_ID, getProgram } from "./anchor";

export interface FeedEvent {
  kind: "Matched" | "Resolved" | "QueueJoined" | "Burned" | "Streak";
  signature: string;
  slot: number;
  data: any;
  timestamp: number;
}

export interface LiveMetrics {
  inQueue: number;        // QueueEntry accounts that exist right now
  matchesActive: number;  // Match accounts in AwaitingReveals
  uniqueRecent: number;   // unique players in last ~50 events
  events: FeedEvent[];    // most-recent program events
  loading: boolean;
}

// Free devnet RPC is rate-limited (~100 req/min). Be conservative.
const POLL_MS = 30_000;       // metrics tick
const SIG_LIMIT = 12;          // signatures pulled per tick

// Shared cache so multiple consumers (Header + Marquee) trigger one poll loop, not many.
let __metricsCache: LiveMetrics = {
  inQueue: 0,
  matchesActive: 0,
  uniqueRecent: 0,
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
        const program = getProgram(connection);

        // Live state via getProgramAccounts (cheap because we filter by discriminator size)
        const accs = await connection.getProgramAccounts(PROGRAM_ID, {
          dataSlice: { offset: 0, length: 8 },
        });
        // Discriminators are the first 8 bytes of each account.
        const QUEUE_ENTRY_DISC = (program.account as any).queueEntry.discriminator as Uint8Array;
        const MATCH_DISC = (program.account as any).match.discriminator as Uint8Array;
        const eq = (a: Uint8Array, b: Uint8Array) =>
          a.length === b.length && a.every((v, i) => v === b[i]);

        let inQueue = 0;
        let matches = 0;
        for (const a of accs) {
          if (eq(new Uint8Array(a.account.data), QUEUE_ENTRY_DISC)) inQueue++;
          else if (eq(new Uint8Array(a.account.data), MATCH_DISC)) matches++;
        }

        // Recent events via getSignaturesForAddress + getParsedTransactions
        const sigs = await connection.getSignaturesForAddress(PROGRAM_ID, {
          limit: SIG_LIMIT,
        });
        const txs = await connection.getTransactions(
          sigs.map((s) => s.signature),
          { commitment: "confirmed", maxSupportedTransactionVersion: 0 }
        );

        const events: FeedEvent[] = [];
        const players = new Set<string>();
        for (let i = 0; i < txs.length; i++) {
          const tx = txs[i];
          const sig = sigs[i];
          if (!tx?.meta?.logMessages) continue;
          for (const log of tx.meta.logMessages) {
            // Anchor events appear as "Program data: <base64>"
            if (!log.startsWith("Program data:")) continue;
            try {
              const parsed: any = (program.coder as any).events.decode(
                log.slice("Program data: ".length).trim()
              );
              if (!parsed) continue;
              const kind = parsed.name as FeedEvent["kind"];
              events.push({
                kind,
                signature: sig.signature,
                slot: tx.slot,
                data: parsed.data,
                timestamp: (sig.blockTime ?? 0) * 1000,
              });
              if (parsed.data?.player) players.add(parsed.data.player.toBase58());
              if (parsed.data?.playerA) players.add(parsed.data.playerA.toBase58());
              if (parsed.data?.playerB) players.add(parsed.data.playerB.toBase58());
            } catch {
              // not an anchor event we care about
            }
          }
        }

        if (!cancelled) {
          __metricsCache = {
            inQueue,
            matchesActive: matches,
            uniqueRecent: players.size,
            events,
            loading: false,
          };
          __subscribers.forEach((cb) => cb(__metricsCache));
        }
      } catch (err) {
        // Silent — keep prior state on transient RPC failures
        if (!cancelled) {
          __metricsCache = { ...__metricsCache, loading: false };
          __subscribers.forEach((cb) => cb(__metricsCache));
        }
      }
    }

    // Singleton poller — only one tick loop regardless of consumer count
    if (!__pollerStarted) {
      __pollerStarted = true;
      tick();
      const id = setInterval(tick, POLL_MS);
      // Keep id alive for module lifetime; HMR will reset
      (globalThis as any).__metricsTimer = id;
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
    tick();
    timer = setInterval(tick, 45_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [connection]);

  return data;
}
