"use client";

import { useState } from "react";
import { MatchFoundBanner } from "@/components/MatchFoundBanner";
import { ClashSequence } from "@/components/ClashSequence";
import { ResultDisplay } from "@/components/ResultDisplay";
import { StreakAnimation } from "@/components/StreakAnimation";
import { PixelFrame } from "@/components/ui/PixelFrame";
import type { Move } from "@/components/sprites/MoveSprite";

type Outcome = "win" | "loss" | "tie";

const SCENARIOS: { label: string; mine: Move; theirs: Move; outcome: Outcome }[] = [
  { label: "WIN — Rock crushes Scissors", mine: "rock", theirs: "scissors", outcome: "win" },
  { label: "WIN — Paper covers Rock", mine: "paper", theirs: "rock", outcome: "win" },
  { label: "WIN — Scissors cuts Paper", mine: "scissors", theirs: "paper", outcome: "win" },
  { label: "LOSS — Scissors loses to Rock", mine: "scissors", theirs: "rock", outcome: "loss" },
  { label: "LOSS — Rock loses to Paper", mine: "rock", theirs: "paper", outcome: "loss" },
  { label: "LOSS — Paper loses to Scissors", mine: "paper", theirs: "scissors", outcome: "loss" },
  { label: "TIE — Rock vs Rock", mine: "rock", theirs: "rock", outcome: "tie" },
  { label: "TIE — Paper vs Paper", mine: "paper", theirs: "paper", outcome: "tie" },
];

const ENTRY = 30_000;

export default function PreviewAnimationPage() {
  const [bannerKey, setBannerKey] = useState(0);
  const [clash, setClash] = useState<{ key: number; idx: number } | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [streakKey, setStreakKey] = useState(0);
  const [streak, setStreak] = useState(2);

  function triggerBanner() {
    setBannerKey((k) => k + 1);
  }

  function triggerScenario(idx: number) {
    setShowResult(false);
    setClash({ key: Date.now(), idx });
  }

  function triggerStreak() {
    setStreak(3);
    setStreakKey((k) => k + 1);
    // reset after a beat so it can re-fire
    setTimeout(() => setStreak(2), 2600);
  }

  const sc = clash ? SCENARIOS[clash.idx] : null;

  return (
    <div className="mx-auto max-w-4xl px-6 py-10 space-y-8">
      <div>
        <div className="text-pixel-xs text-ink-mute">PREVIEW.SOL // ANIMATIONS</div>
        <h1 className="text-pixel-xl glow-cyan mt-2">{">"} ANIMATION_PREVIEW</h1>
        <p className="font-body text-xl text-ink-dim mt-2 max-w-2xl">
          Trigger any sequence below to see it in isolation. Each replays from scratch.
          The actual play flow strings these together: banner → reveal → clash → result.
        </p>
      </div>

      {/* Streak overlay (separate viewport-fixed, runs over everything) */}
      <StreakAnimation key={streakKey} streak={streak} />

      {/* Match-found banner (separate viewport-fixed) */}
      <MatchFoundBanner key={bannerKey} active={bannerKey > 0} />

      <PixelFrame title="01 // MATCH_FOUND_BANNER" tone="magenta">
        <div className="space-y-4">
          <p className="font-body text-base text-ink-dim leading-relaxed">
            Slams in when phase first becomes <span className="font-mono">matched</span>. Three magenta
            shockwave rings expand outward, a label drops in from above with a glow border, auto-dismisses after ~1.4s.
          </p>
          <button
            onClick={triggerBanner}
            className="pixel-btn pixel-btn--magenta"
          >
            ▶ TRIGGER BANNER
          </button>
        </div>
      </PixelFrame>

      <PixelFrame title="02 // CLASH_SEQUENCE" tone="acid">
        <div className="space-y-4">
          <p className="font-body text-base text-ink-dim leading-relaxed">
            The dramatic outcome reveal. ~2.4s sequence: sprites slide in → slam center → white flash + 3
            colored shockwave rings + 12 spark particles → winner pulses, loser dims → verdict text drops in.
            Pick a scenario:
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {SCENARIOS.map((s, i) => (
              <button
                key={i}
                onClick={() => triggerScenario(i)}
                className={`pixel-btn text-left ${
                  s.outcome === "win"
                    ? "pixel-btn"
                    : s.outcome === "loss"
                    ? "pixel-btn"
                    : "pixel-btn"
                }`}
                style={{ justifyContent: "flex-start" }}
              >
                <span
                  className={
                    s.outcome === "win"
                      ? "glow-ok"
                      : s.outcome === "loss"
                      ? "glow-burn"
                      : "glow-acid"
                  }
                >
                  ▶
                </span>{" "}
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </PixelFrame>

      {/* Live render area for clash + result */}
      {sc && (
        <PixelFrame title="LIVE_PREVIEW" tone="cyan">
          {!showResult ? (
            <ClashSequence
              key={clash!.key}
              myMove={sc.mine}
              theirMove={sc.theirs}
              outcome={sc.outcome}
              onComplete={() => setShowResult(true)}
            />
          ) : (
            <div className="space-y-4">
              <ResultDisplay
                myMove={sc.mine}
                theirMove={sc.theirs}
                outcome={sc.outcome}
                payout={
                  sc.outcome === "win"
                    ? ENTRY * 1.7
                    : sc.outcome === "tie"
                    ? ENTRY * 0.85
                    : 0
                }
                burned={ENTRY * 0.15}
                toTreasury={ENTRY * 0.15}
              />
              <button
                onClick={() => setClash(null)}
                className="pixel-btn w-full"
              >
                ▶ CLEAR
              </button>
            </div>
          )}
        </PixelFrame>
      )}

      <PixelFrame title="03 // STREAK_ANIMATION" tone="default">
        <div className="space-y-4">
          <p className="font-body text-base text-ink-dim leading-relaxed">
            Full-viewport pixel fire-burst when <span className="font-mono">current_streak</span> crosses 3,
            5, or 10. Click to simulate going from streak 2 → 3.
          </p>
          <button
            onClick={triggerStreak}
            className="pixel-btn pixel-btn--acid"
          >
            ▶ TRIGGER STREAK ×3
          </button>
        </div>
      </PixelFrame>
    </div>
  );
}
