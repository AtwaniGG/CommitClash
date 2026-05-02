"use client";

import { PublicKey } from "@solana/web3.js";
import { useLiveMetrics } from "@/lib/hooks";
import { fmtCompact } from "@/lib/format";

function shortAddr(a: string): string {
  if (!a || a.length < 12) return a;
  return `${a.slice(0, 4)}…${a.slice(-4)}`;
}

// Anchor's BorshCoder may decode event fields as either snake_case (matches
// the on-chain IDL definition) or camelCase (legacy versions). Read both
// shapes defensively so a single mismatched event can't crash the marquee.
function pick(obj: any, ...keys: string[]): any {
  if (!obj) return undefined;
  for (const k of keys) if (obj[k] !== undefined) return obj[k];
  return undefined;
}

function pkStr(v: any): string | null {
  if (!v) return null;
  if (typeof v === "string") return v;
  if (typeof v?.toBase58 === "function") return v.toBase58();
  // Some decoders hand back raw byte arrays — reconstruct a PublicKey.
  try {
    return new PublicKey(v).toBase58();
  } catch {
    return null;
  }
}

export function Marquee() {
  const { events, loading, inQueue, matchesActive } = useLiveMetrics();

  const items = events.flatMap((e) => {
    try {
      if (e.kind === "Resolved") {
        const playerA = pkStr(pick(e.data, "playerA", "player_a"));
        const playerB = pkStr(pick(e.data, "playerB", "player_b"));
        const paidA = pick(e.data, "paidA", "paid_a");
        const paidB = pick(e.data, "paidB", "paid_b");
        const burned = pick(e.data, "burned");
        const outcome = pick(e.data, "outcome");
        const winner =
          outcome === 0 ? playerA : outcome === 1 ? playerB : null;
        const out: any[] = [];
        if (winner) {
          out.push({
            dot: "ok",
            tag: "RESOLVED",
            msg: `${shortAddr(winner)} +${fmtCompact(
              Number(outcome === 0 ? paidA : paidB) / 1_000_000
            )} $RPS`,
          });
        } else if (paidA != null && paidB != null) {
          out.push({
            dot: "acid",
            tag: "RESOLVED",
            msg: `TIE — both refunded ${fmtCompact(
              (Number(paidA) + Number(paidB)) / 2 / 1_000_000
            )}`,
          });
        }
        if (burned != null) {
          out.push({
            dot: "burn",
            tag: "BURN",
            msg: `${fmtCompact(Number(burned) / 1_000_000)} $RPS gone forever`,
          });
        }
        return out;
      }
      if (e.kind === "Matched") {
        const playerA = pkStr(pick(e.data, "playerA", "player_a"));
        const playerB = pkStr(pick(e.data, "playerB", "player_b"));
        const pot = pick(e.data, "pot");
        const poolId = pick(e.data, "poolId", "pool_id");
        if (!playerA || !playerB) return [];
        return [
          {
            dot: "magenta",
            tag: `MATCHED // POOL_${poolId}`,
            msg: `${shortAddr(playerA)} ⚔ ${shortAddr(playerB)} for ${fmtCompact(
              Number(pot) / 1_000_000
            )} $RPS`,
          },
        ];
      }
      if (e.kind === "QueueJoined") {
        const player = pkStr(pick(e.data, "player"));
        const poolId = pick(e.data, "poolId", "pool_id");
        if (!player) return [];
        return [
          {
            dot: "cyan",
            tag: `QUEUED // POOL_${poolId}`,
            msg: `${shortAddr(player)} entered the queue`,
          },
        ];
      }
      return [];
    } catch (err) {
      console.warn("[Marquee] failed to render event", e.kind, err);
      return [];
    }
  });

  const display =
    items.length > 0
      ? items
      : [
          {
            dot: "idle",
            tag: "STATUS",
            msg: `${inQueue} in queue · ${matchesActive} active matches · awaiting first event`,
          },
        ];

  // For a seamless loop the track must be at least 2× the viewport width.
  const repetitions = display.length >= 6 ? 2 : Math.max(8, 12 - display.length);
  const tracks = Array.from({ length: repetitions }, () => display).flat();

  return (
    <div className="marquee">
      <div className="marquee__track">
        {tracks.map((item, i) => (
          <span key={i} className="text-pixel-xs flex items-center gap-3 px-4">
            <Dot variant={item.dot as any} />
            <span className="text-ink-mute">[{item.tag}]</span>
            <span
              className={
                item.dot === "ok"
                  ? "glow-ok"
                  : item.dot === "burn"
                  ? "glow-burn"
                  : item.dot === "acid"
                  ? "glow-acid"
                  : item.dot === "magenta"
                  ? "glow-magenta"
                  : item.dot === "cyan"
                  ? "glow-cyan"
                  : "text-ink"
              }
            >
              {item.msg}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

function Dot({
  variant,
}: {
  variant: "ok" | "burn" | "acid" | "magenta" | "cyan" | "idle";
}) {
  const cls =
    variant === "idle"
      ? "status-dot--idle"
      : variant === "burn"
      ? "status-dot--burn"
      : "";
  return <span className={`status-dot ${cls}`} />;
}
