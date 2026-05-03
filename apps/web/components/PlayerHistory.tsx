"use client";

import { useEffect, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey, Connection } from "@solana/web3.js";
import { fmtCompact } from "@/lib/format";
import { fetchPlayerHistory } from "@/lib/program";
import { PixelFrame } from "./ui/PixelFrame";

interface Game {
  signature: string;
  timestamp: number;
  result: "WIN" | "LOSS" | "TIE";
  payout: number;
  moveMine: number;
  moveOther: number;
  poolId: number;
  currency: "rps" | "sol";
}

function timeAgo(ms: number): string {
  if (!ms) return "—";
  const sec = Math.round((Date.now() - ms) / 1000);
  if (sec < 60) return `${sec}s ago`;
  const m = Math.round(sec / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.round(m / 60)}h ago`;
}

function moveName(n: number): string {
  return n === 1 ? "ROCK" : n === 2 ? "PAPER" : n === 3 ? "SCISSORS" : "?";
}

// ─── Module-level singleton: shared cache + manual refresh hook ───────────
// PlayPanel imports `refreshHistory()` and calls it the moment a match
// resolves on chain. That way the user sees their just-played game immediately
// instead of waiting up to 3 min for the next interval tick.
let __conn: Connection | null = null;
let __player: PublicKey | null = null;
let __cache: Game[] = [];
let __loading = true;
const __subs = new Set<(games: Game[], loading: boolean) => void>();
let __ticking = false;

async function runFetch() {
  if (!__conn || !__player || __ticking) return;
  __ticking = true;
  try {
    const history = (await fetchPlayerHistory(__conn, __player, 50)) as Game[];
    __cache = history;
    __loading = false;
    __subs.forEach((cb) => cb(__cache, __loading));
  } catch (err) {
    console.warn("[PlayerHistory] fetch failed:", err);
    __loading = false;
    __subs.forEach((cb) => cb(__cache, __loading));
  } finally {
    __ticking = false;
  }
}

/** Call this after a match resolves (or any chain action that may have added
 *  a new game) to push a fresh fetch immediately. Singleton-debounced via
 *  `__ticking`, so spamming it is harmless. */
export function refreshHistory() {
  runFetch();
}

export function PlayerHistory() {
  const { publicKey } = useWallet();
  const { connection } = useConnection();
  const [games, setGames] = useState<Game[]>(__cache);
  const [loading, setLoading] = useState(__loading);

  // Keep module-level connection + player refs current so refreshHistory()
  // always uses the latest values regardless of which component triggered it.
  useEffect(() => {
    __conn = connection;
    __player = publicKey ?? null;
  }, [connection, publicKey]);

  useEffect(() => {
    if (!publicKey) {
      __cache = [];
      __loading = false;
      setGames([]);
      setLoading(false);
      return;
    }
    const cb = (g: Game[], l: boolean) => {
      setGames(g);
      setLoading(l);
    };
    __subs.add(cb);
    setGames(__cache);
    setLoading(__loading);

    // Kick off an immediate fetch on mount / wallet change
    runFetch();

    // Slow background refresh as a safety net (3 min, visibility-paused)
    const timer = setInterval(() => {
      if (typeof document === "undefined" || !document.hidden) runFetch();
    }, 180_000);

    // Refresh whenever the tab becomes visible again
    const onVisibility = () => {
      if (typeof document !== "undefined" && !document.hidden) runFetch();
    };
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVisibility);
    }

    return () => {
      __subs.delete(cb);
      clearInterval(timer);
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVisibility);
      }
    };
  }, [publicKey, connection]);

  if (!publicKey) return null;

  return (
    <PixelFrame title="MY HISTORY" tone="cyan">
      {loading && games.length === 0 ? (
        <div className="text-pixel-xs text-ink-mute py-4 text-center">
          SCANNING ON-CHAIN…
        </div>
      ) : games.length === 0 ? (
        <div className="text-pixel-xs text-ink-mute py-4 text-center">
          NO GAMES YET — RESOLVE YOUR FIRST MATCH ABOVE.
        </div>
      ) : (
        <ul className="space-y-2 font-mono text-sm">
          {games.slice(0, 20).map((g, i) => (
            <li
              key={g.signature + i}
              className="grid grid-cols-[64px_72px_1fr_auto_64px] items-center gap-3 border-b border-edge/30 last:border-0 py-1.5"
            >
              <span
                className={
                  g.result === "WIN"
                    ? "glow-ok text-pixel-xs"
                    : g.result === "LOSS"
                    ? "glow-burn text-pixel-xs"
                    : "glow-acid text-pixel-xs"
                }
              >
                {g.result}
              </span>
              <span className="text-ink-mute text-pixel-xs">
                POOL_
                {g.poolId === 0
                  ? "30K"
                  : g.poolId === 1
                  ? "100K"
                  : g.poolId === 2
                  ? "1M"
                  : g.poolId}
              </span>
              <span className="text-ink-dim text-xs">
                {moveName(g.moveMine)}{" "}
                <span className="text-ink-mute">vs</span>{" "}
                {moveName(g.moveOther)}
              </span>
              <span
                className={
                  g.payout > 0
                    ? "glow-ok text-right"
                    : "text-ink-mute text-right"
                }
              >
                {g.payout > 0
                  ? g.currency === "sol"
                    ? `+${g.payout.toFixed(3)} SOL`
                    : `+${fmtCompact(g.payout)} $RPS`
                  : "—"}
              </span>
              <span className="text-ink-mute text-xs text-right">
                {timeAgo(g.timestamp)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </PixelFrame>
  );
}
