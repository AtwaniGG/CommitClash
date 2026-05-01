"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";
import { MoveSprite, type Move } from "./sprites/MoveSprite";

type Outcome = "win" | "loss" | "tie";

/**
 * Dramatic outcome reveal:
 *   1. Both sprites slide in from sides
 *   2. They slam together at center
 *   3. Shockwave + outcome verdict
 *   4. Winner pulses, loser dims
 *   5. Calls onComplete after total duration
 *
 * Render this as an overlay or inline above the static ResultDisplay.
 * It fires once per match, immediately after both reveals land.
 */
export function ClashSequence({
  myMove,
  theirMove,
  outcome,
  onComplete,
}: {
  myMove: Move;
  theirMove: Move;
  outcome: Outcome;
  onComplete?: () => void;
}) {
  const [stage, setStage] = useState<0 | 1 | 2 | 3>(0);

  useEffect(() => {
    const t1 = setTimeout(() => setStage(1), 50);    // slide in
    const t2 = setTimeout(() => setStage(2), 700);   // slam center
    const t3 = setTimeout(() => setStage(3), 1100);  // shockwave + verdict
    const tDone = setTimeout(() => onComplete?.(), 2400);
    return () => {
      [t1, t2, t3, tDone].forEach(clearTimeout);
    };
  }, [onComplete]);

  const verdictText =
    outcome === "tie"
      ? "TIE // DEADLOCK"
      : `${moveLabel(myMove).toUpperCase()} ${winVerb(myMove, theirMove)} ${moveLabel(theirMove).toUpperCase()}`;

  const verdictGlow =
    outcome === "win"
      ? "glow-ok"
      : outcome === "loss"
      ? "glow-burn"
      : "glow-acid";

  return (
    <div className="relative w-full h-[260px] flex items-center justify-center overflow-hidden">
      {/* Backdrop pixel-grid intensifies during clash */}
      <motion.div
        className="absolute inset-0 bg-pixel-grid"
        style={{ backgroundSize: "8px 8px" }}
        initial={{ opacity: 0.15 }}
        animate={{ opacity: stage >= 2 ? 0.35 : 0.15 }}
      />

      {/* Player A (you) */}
      <motion.div
        className="absolute"
        initial={{ x: -300, opacity: 0 }}
        animate={
          stage === 0
            ? { x: -300, opacity: 0 }
            : stage === 1
            ? { x: -120, opacity: 1 }
            : stage === 2
            ? { x: -22, opacity: 1, rotate: -8, scale: 1.1 }
            : {
                x: outcome === "win" ? -100 : -160,
                opacity: outcome === "loss" ? 0.35 : 1,
                scale: outcome === "win" ? 1.2 : 0.85,
                rotate: 0,
              }
        }
        transition={{
          duration: stage === 1 ? 0.45 : stage === 2 ? 0.35 : 0.5,
          ease: stage === 2 ? [0.7, 0, 0.84, 0] : "easeOut",
        }}
      >
        <div className="flex flex-col items-center">
          <MoveSprite
            move={myMove}
            size={120}
            glow={stage >= 3 && outcome === "win"}
          />
          <div className="text-pixel-xs text-ink-mute mt-2">YOU</div>
        </div>
      </motion.div>

      {/* Player B (opponent) */}
      <motion.div
        className="absolute"
        initial={{ x: 300, opacity: 0 }}
        animate={
          stage === 0
            ? { x: 300, opacity: 0 }
            : stage === 1
            ? { x: 120, opacity: 1 }
            : stage === 2
            ? { x: 22, opacity: 1, rotate: 8, scale: 1.1 }
            : {
                x: outcome === "loss" ? 100 : 160,
                opacity: outcome === "win" ? 0.35 : 1,
                scale: outcome === "loss" ? 1.2 : 0.85,
                rotate: 0,
              }
        }
        transition={{
          duration: stage === 1 ? 0.45 : stage === 2 ? 0.35 : 0.5,
          ease: stage === 2 ? [0.7, 0, 0.84, 0] : "easeOut",
        }}
      >
        <div className="flex flex-col items-center">
          <MoveSprite
            move={theirMove}
            size={120}
            glow={stage >= 3 && outcome === "loss"}
          />
          <div className="text-pixel-xs text-ink-mute mt-2">OPPONENT</div>
        </div>
      </motion.div>

      {/* Shockwave on impact */}
      <AnimatePresence>
        {stage >= 2 && (
          <>
            {[0, 1, 2].map((i) => (
              <motion.div
                key={i}
                className="absolute h-3 w-3"
                style={{
                  border: `2px solid ${
                    outcome === "win"
                      ? "#00ff88"
                      : outcome === "loss"
                      ? "#ff003c"
                      : "#fffb00"
                  }`,
                }}
                initial={{ scale: 0, opacity: 0.95 }}
                animate={{ scale: 50 + i * 18, opacity: 0 }}
                transition={{
                  duration: 0.9,
                  delay: i * 0.08,
                  ease: "easeOut",
                }}
              />
            ))}

            {/* White impact flash */}
            <motion.div
              className="absolute inset-0 bg-white pointer-events-none"
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 0.5, 0] }}
              transition={{ duration: 0.25 }}
            />
          </>
        )}
      </AnimatePresence>

      {/* Verdict text */}
      <AnimatePresence>
        {stage >= 3 && (
          <motion.div
            className="absolute bottom-2 left-0 right-0 text-center pointer-events-none"
            initial={{ y: 20, opacity: 0, scale: 0.7 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: -10, opacity: 0 }}
            transition={{ duration: 0.4, ease: [0.2, 0.9, 0.3, 1.3] }}
          >
            <div className={`text-pixel-md ${verdictGlow} tracking-wider`}>
              ▶ {verdictText}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Spark particles on clash */}
      {stage >= 2 && (
        <>
          {Array.from({ length: 12 }).map((_, i) => {
            const angle = (i / 12) * Math.PI * 2;
            const dist = 90 + Math.random() * 40;
            return (
              <motion.div
                key={`s-${i}`}
                className="absolute h-1.5 w-1.5"
                style={{
                  background: i % 2 === 0 ? "#fffb00" : "#ff2bd6",
                }}
                initial={{ x: 0, y: 0, opacity: 1 }}
                animate={{
                  x: Math.cos(angle) * dist,
                  y: Math.sin(angle) * dist,
                  opacity: 0,
                  scale: [1, 2, 0.5],
                }}
                transition={{ duration: 0.7, ease: "easeOut" }}
              />
            );
          })}
        </>
      )}
    </div>
  );
}

function moveLabel(m: Move) {
  return m === "rock" ? "Rock" : m === "paper" ? "Paper" : "Scissors";
}

function winVerb(a: Move, b: Move): string {
  if (a === b) return "vs";
  if (a === "rock" && b === "scissors") return "CRUSHES";
  if (a === "paper" && b === "rock") return "COVERS";
  if (a === "scissors" && b === "paper") return "CUTS";
  // a is the loser
  return "LOSES TO";
}
