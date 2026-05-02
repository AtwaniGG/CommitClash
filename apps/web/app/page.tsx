import Link from "next/link";
import { PixelFrame } from "@/components/ui/PixelFrame";
import { MoveSprite } from "@/components/sprites/MoveSprite";
import { LiveStatsGrid } from "@/components/LiveStatsGrid";
import { SolEquivalent } from "@/components/SolEquivalent";

const POOLS = [
  {
    id: 0,
    name: "POOL_30K",
    entry: 30_000,
    pot: 60_000,
    queue_length: 1,
    rounds: 8_312,
    burned: 62_340_000,
    usd: "$2.07",
    status: "LIVE",
    tone: "magenta" as const,
  },
  {
    id: 1,
    name: "POOL_100K",
    entry: 100_000,
    pot: 200_000,
    queue_length: 0,
    rounds: 3_421,
    burned: 25_657_500,
    usd: "$6.90",
    status: "LIVE",
    tone: "cyan" as const,
  },
  {
    id: 2,
    name: "POOL_1M",
    entry: 1_000_000,
    pot: 2_000_000,
    queue_length: 1,
    rounds: 1_114,
    burned: 8_355_000,
    usd: "$69.00",
    status: "LIVE",
    tone: "acid" as const,
  },
];

const RECENT = [
  { time: "12s", winner: "9xQF…7m2P", a: "rock", b: "scissors", pot: 60_000, pool: "30K" },
  { time: "47s", winner: "Ai3W…hKp1", a: "paper", b: "rock", pot: 60_000, pool: "30K" },
  { time: "1m", winner: null, a: "scissors", b: "scissors", pot: 200_000, pool: "100K" },
  { time: "2m", winner: "2Nmf…rT4e", a: "scissors", b: "paper", pot: 60_000, pool: "30K" },
  { time: "3m", winner: "Rh8E…zMuq", a: "rock", b: "scissors", pot: 2_000_000, pool: "1M" },
  { time: "4m", winner: "Qvbb…6oF8", a: "paper", b: "rock", pot: 60_000, pool: "30K" },
] as const;

export default function Lobby() {
  return (
    <div className="mx-auto max-w-7xl px-6 py-10 space-y-12">
      {/* HERO */}
      <section className="grid lg:grid-cols-[1fr_420px] gap-8 items-stretch">
        <div className="space-y-6">
          <div className="text-pixel-xs text-ink-mute">
            <span className="status-dot mr-2" />
            CONNECTED // SOLANA-DEVNET // BLOCK 271,440,983
          </div>
          <h1 className="text-pixel-xl leading-[1.1]">
            <span className="glow-magenta">ROCK.</span>
            <br />
            <span className="glow-cyan">PAPER.</span>
            <br />
            <span className="glow-acid">SCISSORS.</span>
            <br />
            <span className="text-ink/80 text-pixel-lg">{">>"} ON-CHAIN.</span>
            <span className="term-cursor" />
          </h1>
          <p className="font-body text-2xl text-ink-dim leading-snug max-w-xl">
            Stake $RPS. Get matched. Winner takes <span className="glow-ok">85%</span>.{" "}
            <span className="glow-burn">7.5% burns</span> forever. <span className="glow-acid">7.5%</span> to treasury. No house, no admin override, no edge.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href="/play/0" className="pixel-btn pixel-btn--magenta">
              ▶ ENTER POOL_30K
            </Link>
            <Link href="/stats" className="pixel-btn">
              VIEW STATS
            </Link>
          </div>
        </div>

        {/* RPS triangle showcase */}
        <PixelFrame title="MOVES // SPECIMEN_DECK" tone="default">
          <div className="grid grid-cols-3 gap-3">
            {(["rock", "paper", "scissors"] as const).map((m) => (
              <div
                key={m}
                className="flex flex-col items-center gap-2 p-3 border border-edge bg-bg-base/50"
              >
                <MoveSprite move={m} size={80} glow />
                <span className="text-pixel-xs text-ink-dim">
                  {m === "rock" ? "0x01" : m === "paper" ? "0x02" : "0x03"}
                </span>
                <span className="text-pixel-sm">{m.toUpperCase()}</span>
              </div>
            ))}
          </div>
          <div className="mt-4 text-pixel-xs text-ink-mute leading-relaxed">
            ROCK ▶ SCISSORS ▶ PAPER ▶ ROCK · COMMIT-REVEAL · KECCAK256
          </div>
        </PixelFrame>
      </section>

      {/* GLOBAL STATS — live from chain */}
      <LiveStatsGrid />

      {/* POOLS + RECENT */}
      <section className="grid lg:grid-cols-[1fr_360px] gap-6">
        <div className="space-y-4">
          <div className="flex items-baseline justify-between">
            <h2 className="text-pixel-md glow-cyan">{">"} ACTIVE_POOLS</h2>
            <span className="text-pixel-xs text-ink-mute">
              FIFO MATCHMAKING · NO HOUSE EDGE
            </span>
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            {POOLS.map((p) => (
              <PoolCard key={p.id} pool={p} />
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-baseline justify-between">
            <h2 className="text-pixel-md glow-magenta">{">"} RECENT</h2>
            <span className="text-pixel-xs text-ink-mute animate-pulse-slow">LIVE</span>
          </div>
          <PixelFrame title="GAME_LOG.TXT" tone="magenta">
            <ul className="space-y-3 font-mono text-sm">
              {RECENT.map((g, i) => (
                <li
                  key={i}
                  className="grid grid-cols-[40px_1fr_140px] items-center gap-2"
                >
                  <span className="text-ink-mute">[{g.time}]</span>
                  <span className="flex items-center gap-1 justify-self-center">
                    <MoveSprite move={g.a} size={20} />
                    <span className="text-ink-mute">vs</span>
                    <MoveSprite move={g.b} size={20} />
                  </span>
                  <span
                    className={`text-right whitespace-nowrap ${
                      g.winner ? "glow-ok text-xs" : "glow-acid text-xs"
                    }`}
                  >
                    {g.winner ? `→ ${g.winner}` : "TIE"}
                  </span>
                </li>
              ))}
            </ul>
          </PixelFrame>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section>
        <h2 className="text-pixel-md glow-acid mb-4">{">"} HOW_IT_WORKS</h2>
        <div className="grid md:grid-cols-4 gap-4">
          {[
            {
              n: "01",
              title: "PICK",
              body:
                "Choose rock, paper, or scissors. Frontend generates a nonce + ephemeral session key, hashes everything locally.",
            },
            {
              n: "02",
              title: "STAKE",
              body:
                "One wallet popup. Tokens lock in the pool's vault. Your move stays sealed via keccak256 commitment.",
            },
            {
              n: "03",
              title: "MATCH",
              body:
                "FIFO queue pairs you with the next entrant. The instant a match exists, the session key auto-reveals — no popup.",
            },
            {
              n: "04",
              title: "PAYOUT",
              body:
                "Atomic settlement. Winner gets 85%, 7.5% real burn (Mint.supply ↓), 7.5% to treasury. On-chain, every time.",
            },
          ].map((step) => (
            <PixelFrame key={step.n} title={`STEP_${step.n}`} tone="cyan">
              <div className="space-y-2">
                <div className="text-pixel-md glow-cyan">{step.title}</div>
                <p className="font-body text-base text-ink-dim leading-snug">
                  {step.body}
                </p>
              </div>
            </PixelFrame>
          ))}
        </div>
      </section>
    </div>
  );
}

/* ============================== */

type Tone = "default" | "magenta" | "cyan" | "acid" | "burn" | "ok";

function StatTile({
  label,
  value,
  sub,
  tone = "default",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: Tone;
}) {
  const glow =
    tone === "magenta"
      ? "glow-magenta"
      : tone === "cyan"
      ? "glow-cyan"
      : tone === "acid"
      ? "glow-acid"
      : tone === "burn"
      ? "glow-burn"
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

function PoolCard({
  pool,
}: {
  pool: {
    id: number;
    name: string;
    entry: number;
    pot: number;
    queue_length: number;
    rounds: number;
    burned: number;
    usd?: string; // legacy field, no longer rendered
    status: string;
    tone: "magenta" | "cyan" | "acid";
  };
}) {
  return (
    <PixelFrame
      title={pool.name}
      tone={pool.tone}
      status={
        <span className="flex items-center gap-2">
          <span className="status-dot" />
          <span>{pool.status}</span>
        </span>
      }
    >
      <div className="space-y-4">
        <div className="flex items-end justify-between">
          <div>
            <div className="text-pixel-xs text-ink-mute mb-1">ENTRY</div>
            <div className="text-pixel-lg">
              {pool.entry.toLocaleString()}
            </div>
            <SolEquivalent rps={pool.entry} className="text-pixel-xs text-ink-dim" />
          </div>
          <div className="text-right">
            <div className="text-pixel-xs text-ink-mute mb-1">POT</div>
            <div className="text-pixel-lg glow-acid">
              {pool.pot.toLocaleString()}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 border-t border-edge pt-3">
          <Cell label="QUEUE" value={pool.queue_length === 0 ? "0 — SOLO" : `${pool.queue_length} ⇝`} />
          <Cell label="ROUNDS" value={pool.rounds.toLocaleString()} />
          <Cell label="BURNED" value={fmtCompact(pool.burned)} tone="burn" />
        </div>

        <Link
          href={`/play/${pool.id}`}
          className="pixel-btn pixel-btn--magenta w-full"
        >
          {pool.queue_length > 0 ? "▶ JOIN MATCH" : "▶ START QUEUE"}
        </Link>
      </div>
    </PixelFrame>
  );
}

function Cell({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
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
    <div>
      <div className="text-pixel-xs text-ink-mute">{label}</div>
      <div className={`text-pixel-sm mt-1 ${glow}`}>{value}</div>
    </div>
  );
}

function fmtCompact(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}
