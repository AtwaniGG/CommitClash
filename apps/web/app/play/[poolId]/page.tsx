import Link from "next/link";
import { notFound } from "next/navigation";
import { PlayPanel } from "@/components/PlayPanel";
import { PlayerHistory } from "@/components/PlayerHistory";
import { PixelFrame } from "@/components/ui/PixelFrame";

// Mock pool data — wire to RPC once program is deployed
const POOLS: Record<string, {
  id: number;
  name: string;
  entry: number;
  usd: string;
  rounds: number;
  burned: number;
  queueLength: number;
  tone: "magenta" | "cyan" | "acid";
}> = {
  "0": {
    id: 0,
    name: "POOL_30K",
    entry: 30_000,
    usd: "$2.07",
    rounds: 8312,
    burned: 62_340_000,
    queueLength: 1,
    tone: "magenta",
  },
  "1": {
    id: 1,
    name: "POOL_100K",
    entry: 100_000,
    usd: "$6.90",
    rounds: 3421,
    burned: 25_657_500,
    queueLength: 0,
    tone: "cyan",
  },
  "2": {
    id: 2,
    name: "POOL_1M",
    entry: 1_000_000,
    usd: "$69.00",
    rounds: 1114,
    burned: 8_355_000,
    queueLength: 1,
    tone: "acid",
  },
};

const PROGRAM_DEPLOYED = true; // live on devnet — DymxJfPVGFD3BD1DWk6KeXaj7uPQhSFo2xXB3A8LuBFG

export default async function PlayPage({
  params,
}: {
  params: Promise<{ poolId: string }>;
}) {
  const { poolId } = await params;
  const pool = POOLS[poolId];
  if (!pool) notFound();

  return (
    <div className="mx-auto max-w-6xl px-6 py-10 space-y-6">
      <Link
        href="/"
        className="text-pixel-xs text-ink-mute hover:text-cyan transition-colors"
      >
        ← BACK TO LOBBY
      </Link>

      <div className="grid lg:grid-cols-[1fr_360px] gap-6">
        <div className="space-y-6">
          <PlayPanel
            poolId={pool.id}
            poolName={pool.name}
            entryAmount={pool.entry}
            usdEstimate={pool.usd}
            programDeployed={PROGRAM_DEPLOYED}
          />
          <PlayerHistory />
        </div>

        <div className="space-y-4">
          <PixelFrame title="POOL_INFO" tone={pool.tone}>
            <div className="space-y-3 font-body text-base">
              <Row label="ID" value={`#${pool.id}`} />
              <Row label="ENTRY" value={`${pool.entry.toLocaleString()} $RPS`} />
              <Row label="POT" value={`${(pool.entry * 2).toLocaleString()} $RPS`} glow="acid" />
              <Row label="ROUNDS" value={pool.rounds.toLocaleString()} />
              <Row label="BURNED" value={`${(pool.burned / 1_000_000).toFixed(2)}M`} glow="burn" />
              <Row label="QUEUE" value={pool.queueLength === 0 ? "0 — SOLO" : `${pool.queueLength} ⇝`} />
            </div>
          </PixelFrame>

          <PixelFrame title="DISTRIBUTION" tone="cyan">
            <div className="space-y-3 font-body text-base">
              <Row label="WINNER" value="75%" glow="ok" />
              <Row label="BURN" value="12.5%" glow="burn" />
              <Row label="TREASURY" value="12.5%" glow="acid" />
              <div className="border-t border-edge pt-3 text-pixel-xs text-ink-mute leading-relaxed">
                Tie → 37.5% / 37.5% / 12.5% / 12.5%. <br />
                Streak persists on tie, resets on loss only.
              </div>
            </div>
          </PixelFrame>

          <PixelFrame title="SECURITY" tone="default">
            <ul className="font-body text-base text-ink-dim space-y-2 leading-snug">
              <li>▶ Move sealed via keccak256(move ‖ nonce ‖ pk)</li>
              <li>▶ Session key auto-reveals — never custody-risk</li>
              <li>▶ Burn = real Mint.supply ↓</li>
              <li>▶ Timeout fallback: 10 min</li>
            </ul>
          </PixelFrame>
        </div>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  glow,
}: {
  label: string;
  value: string;
  glow?: "acid" | "burn" | "ok";
}) {
  const cls =
    glow === "acid"
      ? "glow-acid"
      : glow === "burn"
      ? "glow-burn"
      : glow === "ok"
      ? "glow-ok"
      : "text-ink";
  return (
    <div className="flex justify-between items-center">
      <span className="text-pixel-xs text-ink-mute">{label}</span>
      <span className={`font-mono text-lg ${cls}`}>{value}</span>
    </div>
  );
}
