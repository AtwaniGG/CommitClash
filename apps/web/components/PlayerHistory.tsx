"use client";

import { useEffect, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { fmtCompact } from "@/lib/format";
import { fetchPlayerHistory } from "@/lib/program";
import { PixelFrame } from "./ui/PixelFrame";

interface Game {
  signature: string;
  timestamp: number;
  result: "WIN" | "LOSS" | "TIE";
  payout: number;             // either RPS units OR SOL units, depending on currency
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

export function PlayerHistory() {
  const { publicKey } = useWallet();
  const { connection } = useConnection();
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!publicKey) {
      setGames([]);
      setLoading(false);
      return;
    }
    const me = publicKey; // capture non-null

    let cancelled = false;
    let timer: ReturnType<typeof setInterval>;

    async function load() {
      try {
        // Scan a narrower window (50 sigs) and refresh less often — full scans
        // burn ~30 RPC requests and were a major contributor to 429 bursts.
        const history = await fetchPlayerHistory(connection, me, 50);
        if (!cancelled) {
          setGames(history);
          setLoading(false);
        }
      } catch (err) {
        console.warn("[PlayerHistory] fetch failed:", err);
        if (!cancelled) setLoading(false);
      }
    }

    load();
    // Refresh every 3 min, only when tab is visible
    timer = setInterval(() => {
      if (typeof document === "undefined" || !document.hidden) load();
    }, 180_000);

    return () => {
      cancelled = true;
      clearInterval(timer);
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
