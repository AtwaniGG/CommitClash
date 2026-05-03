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
import { CardFront, CardBack } from "./SceneLogo";

/**
 * Scene 2 — CARD BATTLE / COMMIT-REVEAL (8s @ 30fps = 240 frames)
 *
 * Hand of 3 cards (ROCK / PAPER / SCISSORS) face-up at bottom; opponent's
 * unknown card slides in from top face-down. Player picks PAPER, slides it
 * face-down to center (COMMIT). Both face-down cards rest in middle. Then
 * "REVEAL!" — both cards flip simultaneously (PAPER vs ROCK). Paper wins,
 * crushes rock. +51,000 $RPS.
 *
 *   00–30   : "YOUR HAND" — 3 cards fan in at bottom
 *   30–70   : Cursor moves over cards, lands on PAPER (highlight + lift)
 *   70–110  : PAPER flies to center, FLIPS face-down (COMMIT)
 *   110–140 : Opponent card slides in from top, face-down
 *   140–180 : "REVEAL!" both cards FLIP simultaneously, showing PAPER vs ROCK
 *   180–210 : Battle resolution — PAPER attacks ROCK, hit-spark + damage
 *   210–240 : "YOU WIN +51,000 $RPS"
 */
export function SceneGameplay() {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const isVert = height > width;

  const phase =
    frame < 30 ? "draw"
    : frame < 70 ? "select"
    : frame < 110 ? "commit"
    : frame < 140 ? "wait"
    : frame < 180 ? "reveal"
    : frame < 210 ? "resolve"
    : "win";

  const cardW = isVert ? 240 : 200;
  const cardH = cardW * 1.4;

  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      {/* ── SFX ── */}
      {/* Hand draw — 3 swooshes */}
      {[2, 12, 22].map((f, i) => (
        <Sequence key={i} from={f} durationInFrames={6}>
          <Audio src={staticFile("sfx/whoosh.wav")} volume={0.5} />
        </Sequence>
      ))}
      {[8, 18, 28].map((f, i) => (
        <Sequence key={i} from={f} durationInFrames={4}>
          <Audio src={staticFile("sfx/click.wav")} volume={0.55} />
        </Sequence>
      ))}

      {/* Selection cursor moves */}
      <Sequence from={40} durationInFrames={4}>
        <Audio src={staticFile("sfx/tick.wav")} volume={0.5} />
      </Sequence>
      <Sequence from={50} durationInFrames={4}>
        <Audio src={staticFile("sfx/tick.wav")} volume={0.5} />
      </Sequence>
      <Sequence from={60} durationInFrames={6}>
        <Audio src={staticFile("sfx/click.wav")} volume={0.7} />
      </Sequence>
      <Sequence from={60} durationInFrames={6}>
        <Audio src={staticFile("sfx/subhit.wav")} volume={0.6} />
      </Sequence>

      {/* Commit (flip + place) */}
      <Sequence from={70} durationInFrames={20}>
        <Audio src={staticFile("sfx/whoosh.wav")} volume={0.6} />
      </Sequence>
      <Sequence from={88} durationInFrames={6}>
        <Audio src={staticFile("sfx/glitch.wav")} volume={0.5} />
      </Sequence>
      <Sequence from={88} durationInFrames={6}>
        <Audio src={staticFile("sfx/subhit.wav")} volume={0.55} />
      </Sequence>

      {/* Opponent card slides in */}
      <Sequence from={115} durationInFrames={20}>
        <Audio src={staticFile("sfx/whoosh.wav")} volume={0.55} />
      </Sequence>
      <Sequence from={130} durationInFrames={6}>
        <Audio src={staticFile("sfx/subhit.wav")} volume={0.6} />
      </Sequence>

      {/* Tense pause + reveal */}
      <Sequence from={130} durationInFrames={20}>
        <Audio src={staticFile("sfx/heartbeat.wav")} volume={0.5} />
      </Sequence>
      <Sequence from={138} durationInFrames={20}>
        <Audio src={staticFile("sfx/riser.wav")} volume={0.55} />
      </Sequence>
      <Sequence from={140} durationInFrames={20}>
        <Audio src={staticFile("sfx/reveal.wav")} volume={0.7} />
      </Sequence>
      <Sequence from={140} durationInFrames={6}>
        <Audio src={staticFile("sfx/zap.wav")} volume={0.6} />
      </Sequence>
      <Sequence from={140} durationInFrames={20}>
        <Audio src={staticFile("sfx/sparkle.wav")} volume={0.55} />
      </Sequence>
      <Sequence from={154} durationInFrames={6}>
        <Audio src={staticFile("sfx/click.wav")} volume={0.6} />
      </Sequence>
      <Sequence from={154} durationInFrames={6}>
        <Audio src={staticFile("sfx/click.wav")} volume={0.6} />
      </Sequence>

      {/* Resolve (attack + hit) */}
      <Sequence from={180} durationInFrames={10}>
        <Audio src={staticFile("sfx/bassdrop.wav")} volume={0.6} />
      </Sequence>
      <Sequence from={180} durationInFrames={10}>
        <Audio src={staticFile("sfx/subhit.wav")} volume={0.95} />
      </Sequence>
      <Sequence from={180} durationInFrames={6}>
        <Audio src={staticFile("sfx/glitch.wav")} volume={0.6} />
      </Sequence>

      {/* Win */}
      <Sequence from={210} durationInFrames={36}>
        <Audio src={staticFile("sfx/victory.wav")} volume={0.85} />
      </Sequence>
      <Sequence from={218} durationInFrames={20}>
        <Audio src={staticFile("sfx/coin.wav")} volume={0.75} />
      </Sequence>
      <Sequence from={216} durationInFrames={14}>
        <Audio src={staticFile("sfx/arpeggio.wav")} volume={0.55} />
      </Sequence>

      <CardTableBg width={width} height={height} />

      {/* ── HAND PHASE: 3 cards at bottom ── */}
      <PlayerHand
        frame={frame}
        phase={phase}
        cardW={cardW}
        cardH={cardH}
        width={width}
        height={height}
        isVert={isVert}
      />

      {/* ── PAPER card commit (face-down in center, left side) ── */}
      {(phase === "commit" || phase === "wait" || phase === "reveal" || phase === "resolve" || phase === "win") && (
        <PaperCommit
          frame={frame - 70}
          phase={phase}
          cardW={cardW}
          cardH={cardH}
          width={width}
          height={height}
          isVert={isVert}
        />
      )}

      {/* ── Opponent's face-down card sliding in (right side) ── */}
      {(phase === "wait" || phase === "reveal" || phase === "resolve" || phase === "win") && (
        <OpponentCard
          frame={frame - 110}
          phase={phase}
          cardW={cardW}
          cardH={cardH}
          width={width}
          height={height}
          isVert={isVert}
        />
      )}

      {/* ── REVEAL banner ── */}
      {phase === "reveal" && (
        <Banner
          frame={frame - 140}
          fps={fps}
          text="REVEAL!"
          color={COLORS.acid}
          isVert={isVert}
        />
      )}

      {/* ── Hit spark + damage on resolve ── */}
      {phase === "resolve" && (
        <ResolveOverlay
          frame={frame - 180}
          width={width}
          height={height}
        />
      )}

      {/* ── Win screen ── */}
      {phase === "win" && (
        <WinOverlay
          frame={frame - 210}
          fps={fps}
          isVert={isVert}
        />
      )}

      {/* ── Top status bar ── */}
      <StatusBar phase={phase} isVert={isVert} />
    </AbsoluteFill>
  );
}

// ── Status text top of screen ──────────────────────────────────────────────
function StatusBar({ phase, isVert }: { phase: string; isVert: boolean }) {
  const text =
    phase === "draw" ? "▼ YOUR HAND"
    : phase === "select" ? "▶ SELECT YOUR MOVE"
    : phase === "commit" ? "🔒 COMMITTED"
    : phase === "wait" ? "WAITING FOR OPPONENT…"
    : phase === "reveal" ? "▼ REVEAL!"
    : phase === "resolve" ? "PAPER COVERS ROCK"
    : "VICTORY";
  return (
    <div
      style={{
        position: "absolute",
        top: isVert ? 60 : 40,
        left: 0,
        right: 0,
        textAlign: "center",
        fontFamily: FONTS.display,
        fontSize: isVert ? 28 : 24,
        color: COLORS.cyan,
        letterSpacing: "0.2em",
        textShadow: `0 0 8px ${COLORS.cyan}`,
      }}
    >
      {text}
    </div>
  );
}

// ── Player hand of 3 cards at bottom ───────────────────────────────────────
function PlayerHand({
  frame, phase, cardW, cardH, width, height, isVert,
}: {
  frame: number; phase: string; cardW: number; cardH: number;
  width: number; height: number; isVert: boolean;
}) {
  const cards: { move: Move; label: string; color: string; dealAt: number }[] = [
    { move: "rock", label: "ROCK", color: "#a0a4c0", dealAt: 0 },
    { move: "paper", label: "PAPER", color: COLORS.acid, dealAt: 10 },
    { move: "scissors", label: "SCISSORS", color: COLORS.magenta, dealAt: 20 },
  ];
  const totalW = cards.length * cardW + (cards.length - 1) * 24;
  const startX = (width - totalW) / 2;
  const baseY = height - cardH - (isVert ? 80 : 50);

  // Cursor logic during select
  // Frame 30-40: ROCK, 40-50: SCISSORS, 50-60: PAPER (final)
  const cursorIdx =
    phase === "draw" ? -1
    : frame < 40 ? 0
    : frame < 50 ? 2
    : 1; // PAPER

  return (
    <>
      {cards.map((c, i) => {
        // After commit (70+), paper card is removed (it flies away)
        const removed = c.move === "paper" && phase !== "draw" && phase !== "select";
        if (removed) return null;
        const local = frame - c.dealAt;
        const dealSpring = spring({ frame: local, fps: 30, config: { damping: 12, stiffness: 200 } });
        const x = startX + i * (cardW + 24);
        const yOffset = interpolate(dealSpring, [0, 1], [400, 0]);
        const isHovered = i === cursorIdx;
        const liftY = isHovered ? -30 : 0;
        const isPicked = i === 1 && phase === "select" && frame >= 60;
        const dim = phase !== "draw" && !isHovered && !isPicked && phase === "select";

        return (
          <div
            key={c.move}
            style={{
              position: "absolute",
              left: x,
              top: baseY + yOffset + liftY,
              width: cardW,
              height: cardH,
              opacity: dim ? 0.5 : 1,
              transform: `scale(${isPicked ? 1.1 : 1})`,
              transition: "transform 0.1s, top 0.1s, opacity 0.1s",
            }}
          >
            <CardFront move={c.move} label={c.label} color={c.color} />
            {/* Cursor indicator */}
            {isHovered && (
              <div
                style={{
                  position: "absolute",
                  top: -28,
                  left: 0,
                  right: 0,
                  textAlign: "center",
                  fontFamily: FONTS.display,
                  fontSize: 28,
                  color: COLORS.acid,
                  textShadow: `0 0 10px ${COLORS.acid}`,
                }}
              >
                ▼
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}

// ── Paper card commits (flips face-down in center) ─────────────────────────
function PaperCommit({
  frame, phase, cardW, cardH, width, height, isVert,
}: {
  frame: number; phase: string; cardW: number; cardH: number;
  width: number; height: number; isVert: boolean;
}) {
  // Position target: center-left
  const targetX = width / 2 - cardW - 24;
  const targetY = height / 2 - cardH / 2;
  // Origin: middle slot of hand
  const startX = width / 2 - cardW / 2;
  const startY = height - cardH - (isVert ? 80 : 50);

  const flySpring = spring({ frame, fps: 30, config: { damping: 11, stiffness: 220 } });
  const x = interpolate(flySpring, [0, 1], [startX, targetX]);
  const y = interpolate(flySpring, [0, 1], [startY, targetY]);

  // Flip during fly: front-up → back-up by frame 18
  const flipDeg = interpolate(frame, [4, 18], [0, 180], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // During REVEAL phase (140+), flip back to front
  const revealStart = 140 - 70; // frame relative
  const revealFlipDeg = phase === "reveal" || phase === "resolve" || phase === "win"
    ? interpolate(frame, [revealStart + 14, revealStart + 28], [180, 360], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      })
    : flipDeg;
  const showFront = revealFlipDeg < 90 || revealFlipDeg > 270;

  // During RESOLVE — paper card lunges right toward rock card
  let lungeX = 0;
  if (phase === "resolve") {
    const t = interpolate(frame, [180 - 70, 195 - 70], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
    lungeX = t * (cardW + 24);
  }

  // During WIN — paper grows + glows
  const winScale = phase === "win"
    ? interpolate(frame, [210 - 70, 220 - 70], [1, 1.2], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      })
    : 1;

  return (
    <div
      style={{
        position: "absolute",
        left: x + lungeX,
        top: y,
        width: cardW,
        height: cardH,
        perspective: 1000,
        transform: `scale(${winScale})`,
        transformOrigin: "center",
      }}
    >
      <div
        style={{
          width: "100%",
          height: "100%",
          position: "relative",
          transformStyle: "preserve-3d",
          transform: `rotateY(${revealFlipDeg}deg)`,
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            backfaceVisibility: "hidden",
          }}
        >
          <CardFront move="paper" label="PAPER" color={COLORS.acid} />
        </div>
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
      </div>
    </div>
  );
}

// ── Opponent card slides in from top ───────────────────────────────────────
function OpponentCard({
  frame, phase, cardW, cardH, width, height, isVert,
}: {
  frame: number; phase: string; cardW: number; cardH: number;
  width: number; height: number; isVert: boolean;
}) {
  const targetX = width / 2 + 24;
  const targetY = height / 2 - cardH / 2;
  const startY = -cardH;

  const flySpring = spring({ frame, fps: 30, config: { damping: 11, stiffness: 220 } });
  const y = interpolate(flySpring, [0, 1], [startY, targetY]);

  // Reveal flip during REVEAL phase
  const revealStart = 140 - 110; // relative
  const flipDeg = phase === "reveal" || phase === "resolve" || phase === "win"
    ? interpolate(frame, [revealStart + 14, revealStart + 28], [0, 180], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      })
    : 0;

  // During RESOLVE — rock card shakes from impact
  const shake = phase === "resolve" ? Math.sin((frame - (180 - 110)) * 1.4) * 12 : 0;
  const flash = phase === "resolve" && (frame - (180 - 110)) < 8 ? 1 : 0;
  // Fade rock during win
  const opacity = phase === "win"
    ? interpolate(frame, [210 - 110, 220 - 110], [1, 0.3], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      })
    : 1;

  return (
    <div
      style={{
        position: "absolute",
        left: targetX + shake,
        top: y,
        width: cardW,
        height: cardH,
        perspective: 1000,
        opacity,
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
        <div
          style={{
            position: "absolute",
            inset: 0,
            backfaceVisibility: "hidden",
          }}
        >
          <CardBack />
        </div>
        <div
          style={{
            position: "absolute",
            inset: 0,
            backfaceVisibility: "hidden",
            transform: "rotateY(180deg)",
          }}
        >
          <CardFront move="rock" label="ROCK" color="#a0a4c0" />
        </div>
      </div>
      {flash > 0 && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundColor: "#fff",
            opacity: flash * 0.6,
            mixBlendMode: "screen",
          }}
        />
      )}
    </div>
  );
}

// ── Banner (e.g. "REVEAL!") ────────────────────────────────────────────────
function Banner({
  frame, fps, text, color, isVert,
}: {
  frame: number; fps: number; text: string; color: string; isVert: boolean;
}) {
  const s = spring({ frame, fps, config: { damping: 7, stiffness: 280 } });
  const out = interpolate(frame, [30, 40], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <AbsoluteFill
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        opacity: s * out,
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          padding: "32px 80px",
          background: `linear-gradient(90deg, ${color}, ${COLORS.magenta})`,
          border: `6px solid #fff`,
          boxShadow: `0 0 60px ${color}`,
          transform: `scale(${interpolate(s, [0, 1], [2, 1])}) skewX(-12deg)`,
        }}
      >
        <div
          style={{
            transform: "skewX(12deg)",
            fontFamily: FONTS.display,
            fontSize: isVert ? 110 : 90,
            color: "#fff",
            letterSpacing: "0.06em",
            textShadow: `4px 4px 0 #000, 0 0 20px ${COLORS.acid}`,
            whiteSpace: "nowrap",
          }}
        >
          {text}
        </div>
      </div>
    </AbsoluteFill>
  );
}

// ── Hit spark + damage number on resolve ───────────────────────────────────
function ResolveOverlay({
  frame, width, height,
}: {
  frame: number; width: number; height: number;
}) {
  const t = interpolate(frame, [0, 20], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const opacity = interpolate(t, [0, 0.3, 1], [1, 1, 0]);
  const cx = width * 0.62;
  const cy = height / 2;
  // Hit spark
  const points: { x: number; y: number }[] = [];
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2;
    const len = 200 * (0.6 + (i % 2) * 0.4) * t;
    points.push({
      x: Math.cos(angle) * len,
      y: Math.sin(angle) * len,
    });
  }
  return (
    <div
      style={{
        position: "absolute",
        left: cx,
        top: cy,
        transform: "translate(-50%, -50%)",
        opacity,
        pointerEvents: "none",
      }}
    >
      <svg
        width={500}
        height={500}
        viewBox="-250 -250 500 500"
        style={{
          filter: `drop-shadow(0 0 24px ${COLORS.acid}) drop-shadow(0 0 60px ${COLORS.magenta})`,
        }}
      >
        <polygon
          points={points.map((p) => `${p.x},${p.y}`).join(" ")}
          fill="#fff"
          stroke={COLORS.acid}
          strokeWidth={4}
        />
      </svg>
    </div>
  );
}

// ── Win overlay ────────────────────────────────────────────────────────────
function WinOverlay({
  frame, fps, isVert,
}: {
  frame: number; fps: number; isVert: boolean;
}) {
  const slam = spring({ frame, fps, config: { damping: 7, stiffness: 280 } });
  const payout = spring({ frame: frame - 8, fps, config: { damping: 10 } });
  return (
    <div
      style={{
        position: "absolute",
        bottom: isVert ? 200 : 100,
        left: 0,
        right: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 16,
      }}
    >
      <div
        style={{
          padding: "16px 40px",
          background: `linear-gradient(90deg, ${COLORS.acid}, ${COLORS.ok})`,
          border: `4px solid #fff`,
          boxShadow: `0 0 40px ${COLORS.ok}`,
          transform: `scale(${interpolate(slam, [0, 1], [1.4, 1])}) rotate(-3deg)`,
          opacity: slam,
        }}
      >
        <div
          style={{
            fontFamily: FONTS.display,
            fontSize: isVert ? 56 : 44,
            color: "#0a0a14",
            letterSpacing: "0.1em",
            textShadow: `2px 2px 0 #fff`,
            whiteSpace: "nowrap",
          }}
        >
          YOU WIN!
        </div>
      </div>
      <div
        style={{
          fontFamily: FONTS.display,
          fontSize: isVert ? 60 : 50,
          color: COLORS.ok,
          letterSpacing: "0.04em",
          textShadow: `0 0 20px ${COLORS.ok}`,
          opacity: payout,
          transform: `translateY(${interpolate(payout, [0, 1], [16, 0])}px)`,
        }}
      >
        +51,000 $RPS
      </div>
    </div>
  );
}

function CardTableBg({ width, height }: { width: number; height: number }) {
  return (
    <>
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse at center, #1a1530 0%, #0a0a14 70%)`,
        }}
      />
      <AbsoluteFill
        style={{
          backgroundImage: `linear-gradient(${COLORS.magenta}10 1px, transparent 1px), linear-gradient(90deg, ${COLORS.cyan}10 1px, transparent 1px)`,
          backgroundSize: "56px 56px, 56px 56px",
          opacity: 0.4,
        }}
      />
      <AbsoluteFill
        style={{
          backgroundImage:
            "repeating-linear-gradient(0deg, rgba(255,255,255,0.04) 0px, rgba(255,255,255,0.04) 1px, transparent 1px, transparent 4px)",
          mixBlendMode: "overlay",
        }}
      />
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse at center, transparent 25%, rgba(0,0,0,0.85) 100%)`,
        }}
      />
    </>
  );
}
