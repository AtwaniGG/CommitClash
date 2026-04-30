"use client";

import { motion } from "framer-motion";
import { MoveSprite, type Move } from "./sprites/MoveSprite";
import { fmtCompact } from "@/lib/format";

type Outcome = "win" | "loss" | "tie";

export function ResultDisplay({
  myMove,
  theirMove,
  outcome,
  payout,
  burned,
  toTreasury,
}: {
  myMove: Move;
  theirMove: Move;
  outcome: Outcome;
  payout: number;
  burned: number;
  toTreasury: number;
}) {
  const headline =
    outcome === "win" ? "▶ VICTORY" : outcome === "loss" ? "▶ DEFEAT" : "▶ TIE";
  const headlineGlow =
    outcome === "win"
      ? "glow-ok"
      : outcome === "loss"
      ? "glow-burn"
      : "glow-acid";

  return (
    <motion.div
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="space-y-6"
    >
      <div className="flex items-center justify-between">
        <div className={`text-pixel-xl ${headlineGlow}`}>{headline}</div>
        <div className="text-pixel-xs text-ink-mute">RESOLVED ON-CHAIN</div>
      </div>

      <div className="grid grid-cols-3 items-center gap-6">
        <PlayerSide label="YOU" move={myMove} highlight={outcome === "win"} />
        <div className="text-center">
          <motion.div
            className="text-pixel-xl text-ink-dim"
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: [0.5, 1.4, 1], opacity: 1 }}
            transition={{ delay: 0.2, duration: 0.5 }}
          >
            VS
          </motion.div>
        </div>
        <PlayerSide
          label="OPPONENT"
          move={theirMove}
          highlight={outcome === "loss"}
        />
      </div>

      <div className="grid grid-cols-3 gap-3 border-t border-edge pt-4">
        <Pile label="YOU GET" value={payout} tone={outcome === "win" ? "ok" : outcome === "tie" ? "acid" : "default"} />
        <Pile label="BURNED" value={burned} tone="burn" />
        <Pile label="TREASURY" value={toTreasury} tone="acid" />
      </div>
    </motion.div>
  );
}

function PlayerSide({
  label,
  move,
  highlight,
}: {
  label: string;
  move: Move;
  highlight?: boolean;
}) {
  return (
    <motion.div
      className="flex flex-col items-center gap-2"
      animate={highlight ? { scale: [1, 1.08, 1] } : undefined}
      transition={{ duration: 0.6, repeat: highlight ? 2 : 0 }}
    >
      <span className="text-pixel-xs text-ink-mute">{label}</span>
      <MoveSprite move={move} size={120} glow={highlight} />
      <span className="text-pixel-md">{move.toUpperCase()}</span>
    </motion.div>
  );
}

function Pile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "default" | "burn" | "acid" | "ok";
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
      <div className={`text-pixel-md mt-1 ${glow}`}>
        {fmtCompact(value)} <span className="text-ink-dim text-pixel-xs">$RPS</span>
      </div>
    </div>
  );
}
