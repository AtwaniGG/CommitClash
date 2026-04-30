"use client";

import { useLiveMetrics } from "@/lib/hooks";
import { fmtCompact } from "@/lib/format";

function shortAddr(a: string): string {
  if (!a || a.length < 12) return a;
  return `${a.slice(0, 4)}…${a.slice(-4)}`;
}

export function Marquee() {
  const { events, loading, inQueue, matchesActive } = useLiveMetrics();

  // Convert events to display strings
  const items = events.flatMap((e) => {
    if (e.kind === "Resolved") {
      const { player_a, player_b, paid_a, paid_b, burned, outcome } = e.data ?? {};
      const winner =
        outcome === 0 ? player_a : outcome === 1 ? player_b : null;
      return [
        {
          dot: winner ? "ok" : "acid",
          tag: "RESOLVED",
          msg: winner
            ? `${shortAddr(winner.toBase58())} +${fmtCompact(
                Number(outcome === 0 ? paid_a : paid_b) / 1_000_000
              )} $RPS`
            : `TIE — both refunded ${fmtCompact(
                (Number(paid_a) + Number(paid_b)) / 2 / 1_000_000
              )}`,
        },
        {
          dot: "burn",
          tag: "BURN",
          msg: `${fmtCompact(Number(burned) / 1_000_000)} $RPS gone forever`,
        },
      ];
    }
    if (e.kind === "Matched") {
      const { player_a, player_b, pot, pool_id } = e.data ?? {};
      return [
        {
          dot: "magenta",
          tag: `MATCHED // POOL_${pool_id}`,
          msg: `${shortAddr(player_a.toBase58())} ⚔ ${shortAddr(
            player_b.toBase58()
          )} for ${fmtCompact(Number(pot) / 1_000_000)} $RPS`,
        },
      ];
    }
    if (e.kind === "QueueJoined") {
      const { player, pool_id } = e.data ?? {};
      return [
        {
          dot: "cyan",
          tag: `QUEUED // POOL_${pool_id}`,
          msg: `${shortAddr(player.toBase58())} entered the queue`,
        },
      ];
    }
    return [];
  });

  // If chain is empty, show metrics + a friendly idle message
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

  // Duplicate for seamless loop
  const tracks = [...display, ...display];

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
