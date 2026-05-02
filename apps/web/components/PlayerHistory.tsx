"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { useLiveMetrics } from "@/lib/hooks";
import { fmtCompact } from "@/lib/format";
import { PixelFrame } from "./ui/PixelFrame";

const TOKEN_DECIMALS = 6;

function timeAgo(ms: number): string {
  if (!ms) return "—";
  const sec = Math.round((Date.now() - ms) / 1000);
  if (sec < 60) return `${sec}s ago`;
  const m = Math.round(sec / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.round(m / 60)}h ago`;
}

export function PlayerHistory() {
  const { publicKey } = useWallet();
  const { events, loading } = useLiveMetrics();

  if (!publicKey) return null;
  const me = publicKey.toBase58();

  // Anchor's event decoder converts Rust snake_case → TS camelCase.
  // playerA / playerB / paidA / moveA / poolId, NOT player_a etc.
  const games = events
    .filter((e) => e.kind === "Resolved" || e.kind === "TimeoutResolved")
    .map((e) => {
      const a = e.data?.playerA?.toBase58?.();
      const b = e.data?.playerB?.toBase58?.();
      if (a !== me && b !== me) return null;
      const isA = a === me;
      const outcome = Number(e.data?.outcome ?? 2);
      let result: "WIN" | "LOSS" | "TIE";
      if (outcome === 2) result = "TIE";
      else if ((outcome === 0 && isA) || (outcome === 1 && !isA)) result = "WIN";
      else result = "LOSS";
      const paid = isA ? e.data.paidA : e.data.paidB;
      const moveMine = isA ? e.data.moveA : e.data.moveB;
      const moveOther = isA ? e.data.moveB : e.data.moveA;
      return {
        signature: e.signature,
        timestamp: e.timestamp,
        result,
        payout: Number(paid ?? 0) / 10 ** TOKEN_DECIMALS,
        moveMine: Number(moveMine ?? 0),
        moveOther: Number(moveOther ?? 0),
        poolId: Number(e.data?.poolId ?? 0),
      };
    })
    .filter((g): g is NonNullable<typeof g> => g !== null);

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
          {games.slice(0, 12).map((g, i) => (
            <li
              key={i}
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
                POOL_{g.poolId === 0 ? "30K" : g.poolId === 1 ? "100K" : g.poolId === 2 ? "1M" : g.poolId}
              </span>
              <span className="text-ink-dim text-xs">
                {moveName(g.moveMine)} <span className="text-ink-mute">vs</span>{" "}
                {moveName(g.moveOther)}
              </span>
              <span
                className={
                  g.payout > 0 ? "glow-ok text-right" : "text-ink-mute text-right"
                }
              >
                {g.payout > 0 ? `+${fmtCompact(g.payout)}` : "—"}
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

function moveName(n: number): string {
  return n === 1 ? "ROCK" : n === 2 ? "PAPER" : n === 3 ? "SCISSORS" : "?";
}
