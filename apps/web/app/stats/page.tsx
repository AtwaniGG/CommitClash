"use client";

import { useEffect, useState } from "react";
import { useConnection } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { PixelFrame } from "@/components/ui/PixelFrame";
import { fmtCompact } from "@/lib/format";
import { useGlobalStats, useLiveMetrics } from "@/lib/hooks";
import { PROGRAM_ID, getProgram, playerStatsPda } from "@/lib/anchor";

const TOKEN_DECIMALS = 6;
const SUPPLY_INITIAL = 1_000_000_000;

function shortAddr(s: string) {
  return s ? `${s.slice(0, 4)}…${s.slice(-4)}` : "—";
}

interface PlayerRow {
  player: string;
  wins: number;
  losses: number;
  ties: number;
  currentStreak: number;
  bestStreak: number;
  totalWon: bigint;
}

export default function StatsPage() {
  const stats = useGlobalStats();
  const { events } = useLiveMetrics();
  const [leaderboard, setLeaderboard] = useState<PlayerRow[]>([]);
  const [loadingLb, setLoadingLb] = useState(true);
  const { connection } = useConnection();

  // Fetch all PlayerStats accounts and sort
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const program = getProgram(connection);
        const all = await (program.account as any).playerStats.all();
        if (cancelled) return;
        const rows: PlayerRow[] = all.map((a: any) => ({
          player: a.account.player.toBase58(),
          wins: Number(a.account.wins),
          losses: Number(a.account.losses),
          ties: Number(a.account.ties),
          currentStreak: Number(a.account.currentStreak),
          bestStreak: Number(a.account.bestStreak),
          totalWon: BigInt(a.account.totalWon.toString()),
        }));
        rows.sort((a, b) =>
          b.wins !== a.wins
            ? b.wins - a.wins
            : Number(b.totalWon - a.totalWon)
        );
        setLeaderboard(rows);
      } catch (err) {
        console.error("Leaderboard load failed:", err);
      } finally {
        if (!cancelled) setLoadingLb(false);
      }
    }
    load();
    const t = setInterval(load, 15_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [connection]);

  const supplyTokens = stats ? Number(stats.supply) / 10 ** stats.decimals : 0;
  const burnedTokens = stats ? Number(stats.totalBurned) / 10 ** stats.decimals : 0;
  const treasuryTokens = stats ? Number(stats.treasuryBal) / 10 ** stats.decimals : 0;
  const volumeTokens = stats ? Number(stats.totalVolume) / 10 ** stats.decimals : 0;
  const burnPct = (burnedTokens / SUPPLY_INITIAL) * 100;
  const supplyPct = (supplyTokens / SUPPLY_INITIAL) * 100;

  return (
    <div className="mx-auto max-w-7xl px-6 py-10 space-y-8">
      <div>
        <div className="text-pixel-xs text-ink-mute">DASHBOARD.SOL</div>
        <h1 className="text-pixel-xl glow-cyan mt-2">{">"} GLOBAL_STATS</h1>
        <p className="font-body text-xl text-ink-dim mt-2">
          Live aggregates from <span className="font-mono">GlobalStats</span> PDA on Solana devnet.
          {!stats && " Loading…"}
        </p>
      </div>

      {/* Top KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi
          label="ROUNDS PLAYED"
          value={stats ? Number(stats.roundsPlayed).toLocaleString() : "—"}
        />
        <Kpi
          label="$RPS BURNED FOREVER"
          value={stats ? fmtCompact(burnedTokens) : "—"}
          sub={stats ? `${burnPct.toFixed(4)}% OF SUPPLY` : "—"}
          tone="burn"
        />
        <Kpi
          label="TREASURY"
          value={stats ? fmtCompact(treasuryTokens) : "—"}
          sub="$RPS"
          tone="acid"
        />
        <Kpi
          label="LIFETIME VOLUME"
          value={stats ? fmtCompact(volumeTokens) : "—"}
          sub="$RPS"
          tone="cyan"
        />
      </div>

      {/* Supply */}
      <PixelFrame title="MINT.SUPPLY // ON-CHAIN" tone="burn">
        <div className="space-y-4">
          <div className="flex items-baseline justify-between">
            <div>
              <div className="text-pixel-xs text-ink-mute">CURRENT SUPPLY</div>
              <div className="text-pixel-lg glow-cyan mt-1">
                {stats ? fmtCompact(supplyTokens) : "—"} / 1B
              </div>
            </div>
            <div className="text-right">
              <div className="text-pixel-xs text-ink-mute">DEFLATION</div>
              <div className="text-pixel-lg glow-burn mt-1">
                ▼ {burnPct.toFixed(4)}%
              </div>
            </div>
          </div>
          <SupplyBar pct={burnPct} />
          <div className="text-pixel-xs text-ink-mute leading-relaxed">
            Each game burns 12.5% of pot via real <span className="font-mono">spl_token::burn</span> CPI.
            Mint authority is irrelevant — Vault PDA owns its ATA and burns directly.
          </div>
        </div>
      </PixelFrame>

      {/* Leaderboard + Recent */}
      <div className="grid lg:grid-cols-[1fr_1fr] gap-6">
        <PixelFrame title="LEADERBOARD // PLAYER_STATS" tone="acid">
          {loadingLb ? (
            <div className="text-pixel-xs text-ink-mute py-6 text-center">
              SCANNING ACCOUNTS…
            </div>
          ) : leaderboard.length === 0 ? (
            <div className="text-pixel-xs text-ink-mute py-6 text-center">
              NO GAMES PLAYED YET — BE THE FIRST.
            </div>
          ) : (
            <table className="w-full font-mono text-sm">
              <thead>
                <tr className="text-pixel-xs text-ink-mute border-b border-edge">
                  <th className="text-left py-2 pr-2">#</th>
                  <th className="text-left py-2 pr-2">ADDR</th>
                  <th className="text-right py-2 pr-2">W/L/T</th>
                  <th className="text-right py-2 pr-2">STREAK</th>
                  <th className="text-right py-2">WON</th>
                </tr>
              </thead>
              <tbody>
                {leaderboard.slice(0, 20).map((p, i) => (
                  <tr
                    key={p.player}
                    className="border-b border-edge/30 last:border-0"
                  >
                    <td className="py-2 pr-2 text-ink-mute">{i + 1}</td>
                    <td className="py-2 pr-2 text-cyan">{shortAddr(p.player)}</td>
                    <td className="py-2 pr-2 text-right">
                      <span className="text-ok">{p.wins}</span>/
                      <span className="text-burn">{p.losses}</span>/
                      <span className="text-acid">{p.ties}</span>
                    </td>
                    <td
                      className={`py-2 pr-2 text-right ${
                        p.currentStreak >= 3 ? "glow-acid" : ""
                      }`}
                    >
                      ×{p.currentStreak}
                      <span className="text-ink-mute"> ({p.bestStreak})</span>
                    </td>
                    <td className="py-2 text-right glow-ok">
                      {fmtCompact(Number(p.totalWon) / 10 ** TOKEN_DECIMALS)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </PixelFrame>

        <PixelFrame title="RECENT_EVENTS // PROGRAM_LOG" tone="magenta">
          {events.length === 0 ? (
            <div className="text-pixel-xs text-ink-mute py-6 text-center">
              NO EVENTS YET. CHAIN IDLE.
            </div>
          ) : (
            <ul className="space-y-2 font-mono text-sm">
              {events.slice(0, 12).map((e, i) => (
                <li
                  key={i}
                  className="flex items-center justify-between gap-2 py-1 border-b border-edge/30 last:border-0"
                >
                  <span
                    className={
                      e.kind === "Resolved"
                        ? "glow-ok w-20"
                        : e.kind === "Matched"
                        ? "glow-magenta w-20"
                        : e.kind === "QueueJoined"
                        ? "glow-cyan w-20"
                        : "text-ink-mute w-20"
                    }
                  >
                    {e.kind.toUpperCase()}
                  </span>
                  <span className="text-ink-mute text-xs flex-1 truncate">
                    {e.signature.slice(0, 10)}…
                  </span>
                  <span className="text-ink-mute text-xs">
                    {e.timestamp ? timeAgo(e.timestamp) : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </PixelFrame>
      </div>
    </div>
  );
}

function timeAgo(ms: number): string {
  if (!ms) return "—";
  const sec = Math.round((Date.now() - ms) / 1000);
  if (sec < 60) return `${sec}s ago`;
  const m = Math.round(sec / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.round(m / 60)}h ago`;
}

function Kpi({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "burn" | "acid" | "cyan";
}) {
  const glow =
    tone === "burn"
      ? "glow-burn"
      : tone === "acid"
      ? "glow-acid"
      : tone === "cyan"
      ? "glow-cyan"
      : "text-ink";
  return (
    <div className="stat-tile">
      <div className="stat-tile__label">{label}</div>
      <div className={`stat-tile__value ${glow}`}>{value}</div>
      {sub && <div className="text-pixel-xs text-ink-mute mt-2">{sub}</div>}
    </div>
  );
}

function SupplyBar({ pct }: { pct: number }) {
  // 50 cells; each = 2%
  return (
    <div
      className="grid gap-[2px]"
      style={{ gridTemplateColumns: "repeat(50, 1fr)" }}
    >
      {Array.from({ length: 50 }).map((_, i) => {
        const cellPct = i * 2;
        const burned = cellPct < pct;
        return (
          <div
            key={i}
            className={`h-6 ${
              burned
                ? "bg-burn shadow-glow-burn"
                : "bg-bg-elev border border-edge"
            }`}
          />
        );
      })}
    </div>
  );
}
