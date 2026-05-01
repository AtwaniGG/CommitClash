"use client";

import { useGlobalStats } from "@/lib/hooks";
import { fmtCompact } from "@/lib/format";

const TOTAL_SUPPLY = 1_000_000_000;

export function LiveStatsGrid() {
  const stats = useGlobalStats();

  const supplyTokens = stats ? Number(stats.supply) / 10 ** stats.decimals : null;
  const burnedTokens = stats ? Number(stats.totalBurned) / 10 ** stats.decimals : null;
  const treasuryTokens = stats ? Number(stats.treasuryBal) / 10 ** stats.decimals : null;
  const supplyPct = supplyTokens !== null ? (supplyTokens / TOTAL_SUPPLY) * 100 : null;

  return (
    <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <Tile
        label="ROUNDS PLAYED"
        value={stats ? Number(stats.roundsPlayed).toLocaleString() : "…"}
      />
      <Tile
        label="$RPS BURNED"
        value={burnedTokens !== null ? fmtCompact(burnedTokens) : "…"}
        tone="burn"
      />
      <Tile
        label="TREASURY"
        value={treasuryTokens !== null ? fmtCompact(treasuryTokens) : "…"}
        tone="acid"
      />
      <Tile
        label="SUPPLY REMAINING"
        value={supplyPct !== null ? `${supplyPct.toFixed(2)}%` : "…"}
        sub={
          supplyTokens !== null
            ? `${fmtCompact(supplyTokens)} / 1B`
            : undefined
        }
        tone="ok"
      />
    </section>
  );
}

function Tile({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "burn" | "acid" | "ok";
}) {
  const glow =
    tone === "burn"
      ? "glow-burn"
      : tone === "acid"
      ? "glow-acid"
      : tone === "ok"
      ? "glow-ok"
      : "text-ink";
  return (
    <div className="stat-tile">
      <div className="stat-tile__label">{label}</div>
      <div className={`stat-tile__value ${glow}`}>{value}</div>
      {sub && <div className="text-pixel-xs text-ink-mute mt-2">{sub}</div>}
    </div>
  );
}
