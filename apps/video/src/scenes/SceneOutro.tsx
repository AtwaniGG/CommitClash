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

/**
 * Scene 3 — LEVEL UP / SAVE SCREEN (4s @ 30fps = 120 frames)
 *
 * JRPG-style stat reveal + URL outro:
 *   00–60   : "PAYOUT BREAKDOWN" with 4 stat rows revealing one-by-one
 *               WIN BONUS .....  85%
 *               BURN ..........  7.5%
 *               TREASURY ......  7.5%
 *               HOUSE EDGE ....  0%
 *   60–80   : "SAVE COMPLETE" tally banner
 *   80–120  : COMMITCLASH.COM URL slam + "PRESS START" CTA
 */
export function SceneOutro() {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const isVert = height > width;

  const stats = [
    { label: "WIN BONUS",  value: "85%",  color: COLORS.ok },
    { label: "BURN",       value: "7.5%", color: COLORS.burn },
    { label: "TREASURY",   value: "7.5%", color: COLORS.acid },
    { label: "HOUSE EDGE", value: "0%",   color: COLORS.cyan },
  ];

  const rowGap = 12;
  const rowsRevealStart = 6;

  const headerSpring = spring({ frame, fps, config: { damping: 9, stiffness: 240 } });
  const totalSpring = spring({ frame: frame - 60, fps, config: { damping: 9, stiffness: 240 } });

  const urlFrame = frame - 80;
  const logoSpring = spring({ frame: urlFrame, fps, config: { damping: 11, stiffness: 220 } });
  const urlSpring = spring({ frame: urlFrame - 8, fps, config: { damping: 9, stiffness: 230 } });
  const ctaSpring = spring({ frame: urlFrame - 18, fps, config: { damping: 12, stiffness: 200 } });
  const ctaPulse = (Math.sin(urlFrame * 0.22) + 1) / 2;

  const showStats = frame < 80;
  const showUrl = frame >= 80;

  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      {/* SFX */}
      <Sequence from={0} durationInFrames={20}>
        <Audio src={staticFile("sfx/slam.wav")} volume={0.7} />
      </Sequence>
      <Sequence from={0} durationInFrames={36}>
        <Audio src={staticFile("sfx/victory.wav")} volume={0.55} />
      </Sequence>
      {stats.map((_, i) => {
        const at = rowsRevealStart + i * rowGap;
        return (
          <React.Fragment key={i}>
            <Sequence from={at} durationInFrames={6}>
              <Audio
                src={staticFile(
                  i === 0 ? "sfx/tick_low.wav"
                  : i === 1 ? "sfx/tick_mid.wav"
                  : i === 2 ? "sfx/tick_high.wav"
                  : "sfx/tick_top.wav"
                )}
                volume={0.7}
              />
            </Sequence>
            <Sequence from={at} durationInFrames={6}>
              <Audio src={staticFile("sfx/subhit.wav")} volume={0.5} />
            </Sequence>
          </React.Fragment>
        );
      })}
      <Sequence from={60} durationInFrames={20}>
        <Audio src={staticFile("sfx/sparkle.wav")} volume={0.6} />
      </Sequence>
      <Sequence from={60} durationInFrames={20}>
        <Audio src={staticFile("sfx/coin.wav")} volume={0.7} />
      </Sequence>
      <Sequence from={80} durationInFrames={20}>
        <Audio src={staticFile("sfx/slam.wav")} volume={0.8} />
      </Sequence>
      <Sequence from={80} durationInFrames={48}>
        <Audio src={staticFile("sfx/chord.wav")} volume={0.55} />
      </Sequence>
      <Sequence from={86} durationInFrames={14}>
        <Audio src={staticFile("sfx/arpeggio.wav")} volume={0.6} />
      </Sequence>

      {/* Backdrop */}
      <BattleBg />

      {showStats && (
        <AbsoluteFill
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: isVert ? 32 : 24,
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: "16px 32px",
              border: `4px solid #fff`,
              backgroundColor: COLORS.bgElev,
              opacity: headerSpring,
              transform: `scale(${interpolate(headerSpring, [0, 1], [1.4, 1])})`,
              boxShadow: `0 0 16px rgba(0,0,0,0.5)`,
            }}
          >
            <div
              style={{
                fontFamily: FONTS.display,
                fontSize: isVert ? 30 : 24,
                color: COLORS.acid,
                letterSpacing: "0.15em",
                textShadow: `0 0 8px ${COLORS.acid}`,
              }}
            >
              ★ PAYOUT BREAKDOWN ★
            </div>
          </div>

          {/* Stat rows */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 12,
              width: isVert ? "85%" : "60%",
            }}
          >
            {stats.map((s, i) => {
              const at = rowsRevealStart + i * rowGap;
              const rowSpring = spring({
                frame: frame - at,
                fps,
                config: { damping: 12, stiffness: 250 },
              });
              return (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "12px 24px",
                    border: `2px solid ${s.color}40`,
                    backgroundColor: `${s.color}10`,
                    boxShadow: `0 0 12px ${s.color}40, inset 0 0 12px ${s.color}20`,
                    opacity: rowSpring,
                    transform: `translateX(${interpolate(rowSpring, [0, 1], [-200, 0])}px)`,
                    fontFamily: FONTS.display,
                    fontSize: isVert ? 32 : 26,
                  }}
                >
                  <span style={{ color: "#fff", letterSpacing: "0.1em" }}>
                    {s.label}
                  </span>
                  <span
                    style={{
                      flex: 1,
                      margin: "0 16px",
                      borderBottom: `2px dotted ${s.color}80`,
                      height: 1,
                    }}
                  />
                  <span
                    style={{
                      color: s.color,
                      textShadow: `0 0 10px ${s.color}`,
                      letterSpacing: "0.05em",
                      minWidth: isVert ? 120 : 100,
                      textAlign: "right",
                    }}
                  >
                    {s.value}
                  </span>
                </div>
              );
            })}
          </div>

          {frame >= 60 && (
            <div
              style={{
                opacity: totalSpring,
                transform: `scale(${interpolate(totalSpring, [0, 1], [1.5, 1])})`,
                marginTop: 8,
                padding: "10px 24px",
                border: `2px solid ${COLORS.cyan}`,
                backgroundColor: COLORS.bgElev,
                boxShadow: `0 0 16px ${COLORS.cyan}80`,
                fontFamily: FONTS.display,
                fontSize: isVert ? 24 : 20,
                color: COLORS.cyan,
                letterSpacing: "0.15em",
                textShadow: `0 0 8px ${COLORS.cyan}`,
              }}
            >
              ✓ SAVE COMPLETE
            </div>
          )}
        </AbsoluteFill>
      )}

      {showUrl && (
        <AbsoluteFill
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: isVert ? 50 : 32,
          }}
        >
          <div
            style={{
              opacity: logoSpring,
              transform: `scale(${interpolate(logoSpring, [0, 1], [1.6, 1])})`,
              filter: `drop-shadow(0 0 16px ${COLORS.magenta}80) drop-shadow(0 0 40px ${COLORS.cyan}40)`,
            }}
          >
            <svg
              width={isVert ? 240 : 180}
              height={isVert ? 240 : 180}
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
              fontSize: isVert ? 92 : 78,
              color: COLORS.magenta,
              letterSpacing: "0.04em",
              textShadow: `0 0 20px ${COLORS.magenta}, 0 0 60px ${COLORS.magenta}80`,
              opacity: urlSpring,
              transform: `scale(${interpolate(urlSpring, [0, 1], [1.5, 1])})`,
              whiteSpace: "nowrap",
            }}
          >
            COMMITCLASH.COM
          </div>
          <div
            style={{
              opacity: ctaSpring,
              transform: `translateY(${interpolate(ctaSpring, [0, 1], [16, 0])}px)`,
              padding: "16px 32px",
              border: `3px solid ${COLORS.acid}`,
              boxShadow: `0 0 16px ${COLORS.acid}80`,
              backgroundColor: COLORS.bgElev,
            }}
          >
            <div
              style={{
                fontFamily: FONTS.display,
                fontSize: isVert ? 30 : 26,
                color: COLORS.acid,
                letterSpacing: "0.2em",
                textShadow: `0 0 12px ${COLORS.acid}`,
                opacity: 0.4 + ctaPulse * 0.6,
              }}
            >
              ▶ PRESS START
            </div>
          </div>
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
}

function BattleBg() {
  return (
    <>
      <AbsoluteFill
        style={{
          background: `linear-gradient(180deg, #0a0a14, #1a1530, #0a0a14)`,
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
          background: `radial-gradient(ellipse at center, transparent 30%, rgba(0,0,0,0.85) 100%)`,
        }}
      />
    </>
  );
}
