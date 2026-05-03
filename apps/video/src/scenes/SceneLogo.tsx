import React from "react";
import {
  AbsoluteFill,
  Audio,
  interpolate,
  Sequence,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { COLORS, FONTS } from "../brand";
import { MoveSprite, type Move } from "../MoveSprite";

/**
 * Scene 1 — CARD GAME TITLE / DEAL (3s @ 30fps = 90 frames)
 *
 * Hearthstone / YuGiOh-style card-battle aesthetic:
 *   00–24  : Title COMMITCLASH "THE CARD GAME" slam
 *   24–60  : Three cards (ROCK / PAPER / SCISSORS) deal out from a deck,
 *            fanning into position with flip animation
 *   60–90  : Cards settle, "DRAW YOUR HAND" prompt
 */
export function SceneLogo() {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const isVert = height > width;

  const phase = frame < 24 ? "title" : frame < 90 ? "deal" : "ready";

  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      {/* ── SFX ── */}
      <Sequence from={0} durationInFrames={20}>
        <Audio src={staticFile("sfx/slam.wav")} volume={0.7} />
      </Sequence>
      <Sequence from={0} durationInFrames={6}>
        <Audio src={staticFile("sfx/zap.wav")} volume={0.55} />
      </Sequence>
      <Sequence from={0} durationInFrames={20}>
        <Audio src={staticFile("sfx/chord.wav")} volume={0.55} />
      </Sequence>
      {/* Card deal sounds */}
      {[28, 38, 48, 58].map((f, i) => (
        <Sequence key={i} from={f} durationInFrames={6}>
          <Audio src={staticFile("sfx/whoosh.wav")} volume={0.5} />
        </Sequence>
      ))}
      {[34, 44, 54, 64].map((f, i) => (
        <Sequence key={i} from={f} durationInFrames={4}>
          <Audio src={staticFile("sfx/click.wav")} volume={0.6} />
        </Sequence>
      ))}
      {[34, 44, 54].map((f, i) => (
        <Sequence key={i} from={f} durationInFrames={6}>
          <Audio src={staticFile("sfx/subhit.wav")} volume={0.55} />
        </Sequence>
      ))}
      <Sequence from={70} durationInFrames={14}>
        <Audio src={staticFile("sfx/arpeggio.wav")} volume={0.5} />
      </Sequence>

      <CardTableBg width={width} height={height} />

      {phase === "title" && <TitleSlam frame={frame} fps={fps} isVert={isVert} />}
      {(phase === "deal" || phase === "ready") && (
        <CardDeal frame={frame - 24} fps={fps} isVert={isVert} width={width} height={height} />
      )}
      {phase === "ready" && (
        <ReadyOverlay frame={frame - 70} fps={fps} isVert={isVert} />
      )}
    </AbsoluteFill>
  );
}

function TitleSlam({ frame, fps, isVert }: { frame: number; fps: number; isVert: boolean }) {
  const s = spring({ frame, fps, config: { damping: 8, stiffness: 280 } });
  const subS = spring({ frame: frame - 8, fps, config: { damping: 11 } });
  const out = interpolate(frame, [20, 24], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <AbsoluteFill
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: isVert ? 24 : 16,
        opacity: out,
      }}
    >
      {/* Logo glyph */}
      <div
        style={{
          opacity: s,
          transform: `scale(${interpolate(s, [0, 1], [1.6, 1])})`,
          filter: `drop-shadow(0 0 14px ${COLORS.magenta}80) drop-shadow(0 0 36px ${COLORS.cyan}40)`,
        }}
      >
        <svg
          width={isVert ? 160 : 140}
          height={isVert ? 160 : 140}
          viewBox="0 0 7 7"
          shapeRendering="crispEdges"
          style={{ imageRendering: "pixelated", display: "block" }}
        >
          <rect x="2" y="0" width="3" height="2" fill={COLORS.magenta} />
          <rect x="0" y="2" width="2" height="3" fill={COLORS.cyan} />
          <rect x="5" y="2" width="2" height="3" fill={COLORS.acid} />
          <rect x="2" y="5" width="3" height="2" fill={COLORS.ok} />
        </svg>
      </div>
      <div
        style={{
          fontFamily: FONTS.display,
          fontSize: isVert ? 96 : 84,
          color: COLORS.magenta,
          letterSpacing: "0.04em",
          textShadow: `0 0 24px ${COLORS.magenta}, 0 0 64px ${COLORS.magenta}80`,
          opacity: s,
          transform: `scale(${interpolate(s, [0, 1], [1.4, 1])})`,
        }}
      >
        COMMITCLASH
      </div>
      <div
        style={{
          fontFamily: FONTS.display,
          fontSize: isVert ? 22 : 18,
          color: COLORS.cyan,
          letterSpacing: "0.25em",
          textShadow: `0 0 8px ${COLORS.cyan}80`,
          opacity: subS,
        }}
      >
        ▶ THE CARD GAME
      </div>
    </AbsoluteFill>
  );
}

function CardDeal({
  frame, fps, isVert, width, height,
}: {
  frame: number; fps: number; isVert: boolean; width: number; height: number;
}) {
  const cards: { move: Move; label: string; color: string; dealAt: number }[] = [
    { move: "rock", label: "ROCK", color: "#a0a4c0", dealAt: 4 },
    { move: "paper", label: "PAPER", color: COLORS.acid, dealAt: 14 },
    { move: "scissors", label: "SCISSORS", color: COLORS.magenta, dealAt: 24 },
  ];
  const cardW = isVert ? 280 : 240;
  const cardH = cardW * 1.4;
  const totalW = cards.length * cardW + (cards.length - 1) * 24;
  const startX = (width - totalW) / 2;
  const targetY = height / 2 - cardH / 2;

  return (
    <>
      {/* Deck stack at top-right */}
      <div
        style={{
          position: "absolute",
          top: isVert ? 100 : 60,
          right: isVert ? 80 : 100,
        }}
      >
        <DeckStack size={isVert ? 80 : 70} />
      </div>

      {cards.map((c, i) => {
        if (frame < c.dealAt) return null;
        const local = frame - c.dealAt;
        // Card flies from deck to its slot, then flips
        const flySpring = spring({ frame: local, fps, config: { damping: 10, stiffness: 200 } });
        const flipSpring = spring({ frame: local - 8, fps, config: { damping: 11, stiffness: 230 } });

        const slotX = startX + i * (cardW + 24);
        const deckX = (isVert ? width - 80 - 80 / 2 : width - 100 - 70 / 2);
        const deckY = isVert ? 100 : 60;
        const x = interpolate(flySpring, [0, 1], [deckX - cardW / 2, slotX]);
        const y = interpolate(flySpring, [0, 1], [deckY, targetY]);
        // Flip: rotateY from 180 → 0 between local 8-20
        const flipDeg = interpolate(flipSpring, [0, 1], [180, 0]);
        const showFront = flipDeg < 90;

        return (
          <div
            key={c.move}
            style={{
              position: "absolute",
              left: x,
              top: y,
              width: cardW,
              height: cardH,
              perspective: 1000,
            }}
          >
            <div
              style={{
                width: "100%",
                height: "100%",
                position: "relative",
                transformStyle: "preserve-3d",
                transform: `rotateY(${flipDeg}deg)`,
              }}
            >
              {/* Back */}
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  backfaceVisibility: "hidden",
                  transform: "rotateY(180deg)",
                }}
              >
                <CardBack />
              </div>
              {/* Front */}
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  backfaceVisibility: "hidden",
                }}
              >
                <CardFront move={c.move} label={c.label} color={c.color} />
              </div>
            </div>
          </div>
        );
      })}
    </>
  );
}

function ReadyOverlay({ frame, fps, isVert }: { frame: number; fps: number; isVert: boolean }) {
  const s = spring({ frame, fps, config: { damping: 9, stiffness: 240 } });
  const pulse = (Math.sin(frame * 0.25) + 1) / 2;
  return (
    <div
      style={{
        position: "absolute",
        bottom: isVert ? 200 : 100,
        left: 0,
        right: 0,
        textAlign: "center",
        opacity: s * (0.5 + pulse * 0.5),
      }}
    >
      <div
        style={{
          fontFamily: FONTS.display,
          fontSize: isVert ? 36 : 28,
          color: COLORS.acid,
          letterSpacing: "0.2em",
          textShadow: `0 0 16px ${COLORS.acid}`,
          display: "inline-block",
          padding: "12px 24px",
          border: `3px solid ${COLORS.acid}`,
          backgroundColor: COLORS.bgElev,
          boxShadow: `0 0 16px ${COLORS.acid}80`,
        }}
      >
        ▶ DRAW YOUR HAND
      </div>
    </div>
  );
}

// ── Card visuals ───────────────────────────────────────────────────────────
export function CardFront({
  move,
  label,
  color,
}: {
  move: Move;
  label: string;
  color: string;
}) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        backgroundColor: COLORS.bgElev,
        border: `4px solid ${color}`,
        boxShadow: `0 0 24px ${color}80, inset 0 0 16px ${color}30`,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "16px 12px",
      }}
    >
      {/* Top bar — name */}
      <div
        style={{
          fontFamily: FONTS.display,
          fontSize: 22,
          color,
          letterSpacing: "0.1em",
          textShadow: `0 0 8px ${color}`,
        }}
      >
        {label}
      </div>
      {/* Center — sprite */}
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: "100%",
          filter: `drop-shadow(0 0 12px ${color}80)`,
        }}
      >
        <MoveSprite move={move} size={140} glow />
      </div>
      {/* Bottom bar — element type, not stats (no HP in commit-clash) */}
      <div
        style={{
          width: "100%",
          textAlign: "center",
          padding: "6px 0",
          fontFamily: FONTS.display,
          fontSize: 14,
          color: "#fff",
          letterSpacing: "0.18em",
          borderTop: `1px solid ${color}80`,
        }}
      >
        {move === "rock" ? "EARTH" : move === "paper" ? "WIND" : "STEEL"}
      </div>
    </div>
  );
}

export function CardBack() {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        backgroundColor: COLORS.bgBase,
        border: `4px solid ${COLORS.magenta}`,
        boxShadow: `0 0 24px ${COLORS.magenta}80, inset 0 0 16px ${COLORS.magenta}30`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        // Diamond / hatch pattern
        backgroundImage: `repeating-linear-gradient(45deg, ${COLORS.magenta}20 0px, ${COLORS.magenta}20 8px, transparent 8px, transparent 16px), repeating-linear-gradient(-45deg, ${COLORS.cyan}20 0px, ${COLORS.cyan}20 8px, transparent 8px, transparent 16px)`,
      }}
    >
      <svg
        width={120}
        height={120}
        viewBox="0 0 7 7"
        shapeRendering="crispEdges"
        style={{
          imageRendering: "pixelated",
          filter: `drop-shadow(0 0 8px ${COLORS.magenta})`,
        }}
      >
        <rect x="2" y="0" width="3" height="2" fill={COLORS.magenta} />
        <rect x="0" y="2" width="2" height="3" fill={COLORS.cyan} />
        <rect x="5" y="2" width="2" height="3" fill={COLORS.acid} />
        <rect x="2" y="5" width="3" height="2" fill={COLORS.ok} />
      </svg>
    </div>
  );
}

function DeckStack({ size }: { size: number }) {
  return (
    <div style={{ position: "relative", width: size, height: size * 1.4 }}>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            top: i * 2,
            left: i * 2,
            width: size,
            height: size * 1.4,
            backgroundColor: COLORS.bgBase,
            border: `2px solid ${COLORS.magenta}`,
            boxShadow: `0 0 8px ${COLORS.magenta}80`,
            backgroundImage: `repeating-linear-gradient(45deg, ${COLORS.magenta}30 0px, ${COLORS.magenta}30 4px, transparent 4px, transparent 8px)`,
          }}
        />
      ))}
    </div>
  );
}

function CardTableBg({ width, height }: { width: number; height: number }) {
  return (
    <>
      {/* Felt-like table gradient */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse at center, #1a1530 0%, #0a0a14 70%)`,
        }}
      />
      {/* Subtle hexagon-ish grid */}
      <AbsoluteFill
        style={{
          backgroundImage: `linear-gradient(${COLORS.magenta}10 1px, transparent 1px), linear-gradient(90deg, ${COLORS.cyan}10 1px, transparent 1px)`,
          backgroundSize: "56px 56px, 56px 56px",
          opacity: 0.4,
        }}
      />
      {/* Scanlines */}
      <AbsoluteFill
        style={{
          backgroundImage:
            "repeating-linear-gradient(0deg, rgba(255,255,255,0.04) 0px, rgba(255,255,255,0.04) 1px, transparent 1px, transparent 4px)",
          mixBlendMode: "overlay",
        }}
      />
      {/* Vignette */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse at center, transparent 25%, rgba(0,0,0,0.85) 100%)`,
        }}
      />
    </>
  );
}
