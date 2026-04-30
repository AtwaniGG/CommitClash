"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import Link from "next/link";
import { PixelFrame } from "@/components/ui/PixelFrame";
import { shortAddress, fmtCompact } from "@/lib/format";

// Mock — replace with RPC read of PlayerStats PDA
const MOCK_STATS = {
  wins: 47,
  losses: 31,
  ties: 8,
  current_streak: 4,
  best_streak: 11,
  total_wagered: 2_580_000,
  total_won: 1_932_000,
  rank: 38,
  total_players: 4_217,
};

const RECENT_GAMES = [
  { id: 8312, outcome: "WIN", pot: 60_000, payout: 45_000, t: "2m ago" },
  { id: 8298, outcome: "WIN", pot: 60_000, payout: 45_000, t: "8m ago" },
  { id: 8276, outcome: "WIN", pot: 60_000, payout: 45_000, t: "11m ago" },
  { id: 8251, outcome: "WIN", pot: 60_000, payout: 45_000, t: "23m ago" },
  { id: 8229, outcome: "LOSS", pot: 60_000, payout: 0, t: "1h ago" },
  { id: 8205, outcome: "TIE", pot: 200_000, payout: 75_000, t: "1h ago" },
  { id: 8192, outcome: "WIN", pot: 60_000, payout: 45_000, t: "2h ago" },
  { id: 8174, outcome: "LOSS", pot: 60_000, payout: 0, t: "2h ago" },
];

export default function MePage() {
  const { publicKey, connected } = useWallet();

  if (!connected || !publicKey) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-20">
        <PixelFrame title="ACCESS_DENIED" tone="burn">
          <div className="space-y-3 py-6 text-center">
            <div className="text-pixel-md glow-burn">▶ NO WALLET CONNECTED</div>
            <div className="font-body text-lg text-ink-dim">
              Connect a wallet to view your stats, streak, and game history.
            </div>
          </div>
        </PixelFrame>
      </div>
    );
  }

  const wins = MOCK_STATS.wins;
  const losses = MOCK_STATS.losses;
  const total = wins + losses + MOCK_STATS.ties;
  const winrate = total > 0 ? (wins / total) * 100 : 0;
  const pnl = MOCK_STATS.total_won - MOCK_STATS.total_wagered;

  return (
    <div className="mx-auto max-w-7xl px-6 py-10 space-y-8">
      {/* HEADER STRIP */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-pixel-xs text-ink-mute">PLAYER_PROFILE.SOL</div>
          <div className="text-pixel-xl glow-cyan mt-2">
            {shortAddress(publicKey.toBase58(), 6)}
          </div>
          <div className="text-pixel-xs text-ink-mute mt-1">
            RANK #{MOCK_STATS.rank} OF {MOCK_STATS.total_players.toLocaleString()}
          </div>
        </div>
        <Link href="/play/0" className="pixel-btn pixel-btn--magenta">
          ▶ PLAY NOW
        </Link>
      </div>

      {/* HERO STATS GRID */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <BigStat
          label="CURRENT STREAK"
          value={`×${MOCK_STATS.current_streak}`}
          tone={MOCK_STATS.current_streak >= 3 ? "acid" : "default"}
          sub={`BEST: ×${MOCK_STATS.best_streak}`}
        />
        <BigStat
          label="WIN RATE"
          value={`${winrate.toFixed(1)}%`}
          tone={winrate >= 50 ? "ok" : "burn"}
          sub={`${wins}W / ${losses}L / ${MOCK_STATS.ties}T`}
        />
        <BigStat
          label="P&L"
          value={`${pnl >= 0 ? "+" : ""}${fmtCompact(pnl)}`}
          tone={pnl >= 0 ? "ok" : "burn"}
          sub="$RPS"
        />
        <BigStat
          label="TOTAL WAGERED"
          value={fmtCompact(MOCK_STATS.total_wagered)}
          tone="default"
          sub="$RPS"
        />
      </div>

      {/* DETAILED STATS + HISTORY */}
      <div className="grid lg:grid-cols-[1fr_1fr] gap-6">
        <PixelFrame title="LIFETIME // PLAYER_STATS PDA" tone="cyan">
          <table className="w-full font-body text-lg">
            <tbody>
              <Tr label="WINS" value={wins} glow="ok" />
              <Tr label="LOSSES" value={losses} glow="burn" />
              <Tr label="TIES" value={MOCK_STATS.ties} glow="acid" />
              <Tr label="CURRENT STREAK" value={`×${MOCK_STATS.current_streak}`} />
              <Tr label="BEST STREAK" value={`×${MOCK_STATS.best_streak}`} />
              <Tr
                label="TOTAL WAGERED"
                value={`${fmtCompact(MOCK_STATS.total_wagered)} $RPS`}
              />
              <Tr
                label="TOTAL WON"
                value={`${fmtCompact(MOCK_STATS.total_won)} $RPS`}
                glow="ok"
              />
            </tbody>
          </table>
          <div className="mt-4 pt-4 border-t border-edge text-pixel-xs text-ink-mute leading-relaxed">
            Source: PlayerStats PDA at seeds [b"player", wallet]. Updates atomically with each Resolved match.
          </div>
        </PixelFrame>

        <PixelFrame title="RECENT_GAMES.LOG" tone="magenta">
          <ul className="space-y-2 font-mono text-sm">
            {RECENT_GAMES.map((g) => (
              <li
                key={g.id}
                className="flex items-center justify-between py-1.5 border-b border-edge/30 last:border-0"
              >
                <span className="text-ink-mute w-20">[#{g.id}]</span>
                <span
                  className={
                    g.outcome === "WIN"
                      ? "glow-ok w-16"
                      : g.outcome === "LOSS"
                      ? "glow-burn w-16"
                      : "glow-acid w-16"
                  }
                >
                  {g.outcome}
                </span>
                <span className="text-ink">
                  {g.payout > 0 ? `+${fmtCompact(g.payout)}` : "—"}
                </span>
                <span className="text-ink-mute text-right">{g.t}</span>
              </li>
            ))}
          </ul>
        </PixelFrame>
      </div>
    </div>
  );
}

function BigStat({
  label,
  value,
  sub,
  tone = "default",
}: {
  label: string;
  value: string;
  sub: string;
  tone?: "default" | "ok" | "burn" | "acid";
}) {
  const glow =
    tone === "ok"
      ? "glow-ok"
      : tone === "burn"
      ? "glow-burn"
      : tone === "acid"
      ? "glow-acid"
      : "text-ink";
  return (
    <div className="stat-tile">
      <div className="stat-tile__label">{label}</div>
      <div className={`stat-tile__value ${glow}`}>{value}</div>
      <div className="text-pixel-xs text-ink-mute mt-2">{sub}</div>
    </div>
  );
}

function Tr({
  label,
  value,
  glow,
}: {
  label: string;
  value: string | number;
  glow?: "ok" | "burn" | "acid";
}) {
  const cls =
    glow === "ok"
      ? "glow-ok"
      : glow === "burn"
      ? "glow-burn"
      : glow === "acid"
      ? "glow-acid"
      : "text-ink";
  return (
    <tr>
      <td className="text-pixel-xs text-ink-mute py-2 pr-4 align-middle">
        {label}
      </td>
      <td className={`text-right font-mono py-2 ${cls}`}>{value}</td>
    </tr>
  );
}
