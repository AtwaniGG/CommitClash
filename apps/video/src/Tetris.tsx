import React from "react";
import { interpolate, spring } from "remotion";
import { COLORS } from "./brand";

/**
 * Tetris-themed primitives shared across scenes.
 *
 * Tetromino color palette is calibrated to overlap the CommitClash brand
 * (cyan + yellow + magenta = I + O + T pieces) so the video reads as both
 * Tetris and CommitClash without conflict.
 */

export type TetroKind = "I" | "O" | "T" | "S" | "Z" | "L" | "J";

export const PIECE_COLORS: Record<TetroKind, string> = {
  I: COLORS.cyan,    // brand cyan
  O: COLORS.acid,    // brand acid yellow
  T: COLORS.magenta, // brand magenta
  S: COLORS.ok,      // brand green
  Z: COLORS.burn,    // brand burn red
  L: "#ff9900",      // orange
  J: "#3f7eff",      // blue
};

// Each shape is a 4x4 grid where 1 = filled, 0 = empty
export const SHAPES: Record<TetroKind, number[][]> = {
  I: [
    [0, 0, 0, 0],
    [1, 1, 1, 1],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ],
  O: [
    [0, 1, 1, 0],
    [0, 1, 1, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ],
  T: [
    [0, 1, 0, 0],
    [1, 1, 1, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ],
  S: [
    [0, 1, 1, 0],
    [1, 1, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ],
  Z: [
    [1, 1, 0, 0],
    [0, 1, 1, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ],
  L: [
    [0, 0, 1, 0],
    [1, 1, 1, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ],
  J: [
    [1, 0, 0, 0],
    [1, 1, 1, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ],
};

/** A single colored block — the atomic Tetris cell. */
export function Block({
  size,
  color,
  glow = false,
}: {
  size: number;
  color: string;
  glow?: boolean;
}) {
  return (
    <div
      style={{
        width: size,
        height: size,
        backgroundColor: color,
        // Inner highlight + outer dark edge — classic tetris block look
        boxShadow: `
          inset ${size * 0.08}px ${size * 0.08}px 0 ${color}cc,
          inset -${size * 0.08}px -${size * 0.08}px 0 rgba(0,0,0,0.45),
          ${glow ? `0 0 ${size * 0.4}px ${color}80, 0 0 ${size * 0.8}px ${color}40` : "none"}
        `,
        border: `1px solid rgba(0,0,0,0.4)`,
      }}
    />
  );
}

/** A tetromino piece rendered as a grid of blocks. */
export function Tetromino({
  kind,
  cellSize,
  glow = false,
  color,
}: {
  kind: TetroKind;
  cellSize: number;
  glow?: boolean;
  /** Override piece color (defaults to PIECE_COLORS[kind]). */
  color?: string;
}) {
  const shape = SHAPES[kind];
  const c = color ?? PIECE_COLORS[kind];
  // Find bounding box so we can render compactly
  let minRow = 4, maxRow = 0, minCol = 4, maxCol = 0;
  for (let r = 0; r < 4; r++) {
    for (let cc = 0; cc < 4; cc++) {
      if (shape[r][cc]) {
        if (r < minRow) minRow = r;
        if (r > maxRow) maxRow = r;
        if (cc < minCol) minCol = cc;
        if (cc > maxCol) maxCol = cc;
      }
    }
  }
  const rows = maxRow - minRow + 1;
  const cols = maxCol - minCol + 1;
  return (
    <div
      style={{
        position: "relative",
        width: cols * cellSize,
        height: rows * cellSize,
      }}
    >
      {shape.map((row, r) =>
        row.map((v, cc) =>
          v ? (
            <div
              key={`${r}-${cc}`}
              style={{
                position: "absolute",
                left: (cc - minCol) * cellSize,
                top: (r - minRow) * cellSize,
              }}
            >
              <Block size={cellSize} color={c} glow={glow} />
            </div>
          ) : null
        )
      )}
    </div>
  );
}

/** Background — empty Tetris play field with subtle cell outlines. */
export function TetrisField({
  cellSize,
  cols,
  rows,
}: {
  cellSize: number;
  cols: number;
  rows: number;
}) {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          width: cols * cellSize,
          height: rows * cellSize,
          backgroundColor: COLORS.bgBase,
          backgroundImage: `linear-gradient(${COLORS.edge} 1px, transparent 1px), linear-gradient(90deg, ${COLORS.edge} 1px, transparent 1px)`,
          backgroundSize: `${cellSize}px ${cellSize}px, ${cellSize}px ${cellSize}px`,
          border: `2px solid ${COLORS.edge}`,
          boxShadow: `0 0 80px rgba(0,0,0,0.6), inset 0 0 60px rgba(0,0,0,0.4)`,
        }}
      />
    </div>
  );
}

/**
 * A completed-line flash that wipes a horizontal row of blocks.
 * Plays from frame 0 of progress (0..1) — first half: white flash, second
 * half: blocks dissolve / fall out. Caller positions it.
 */
export function LineClearFlash({
  width,
  height,
  progress,
}: {
  width: number;
  height: number;
  progress: number;
}) {
  if (progress <= 0 || progress >= 1) return null;
  const flashOpacity =
    progress < 0.5 ? interpolate(progress, [0, 0.5], [1, 0.4]) : interpolate(progress, [0.5, 1], [0.4, 0]);
  return (
    <div
      style={{
        position: "absolute",
        width,
        height,
        backgroundColor: "#fff",
        opacity: flashOpacity,
        boxShadow: `0 0 40px #fff, 0 0 80px #fff`,
      }}
    />
  );
}

/**
 * Pixel-block letterforms — render a word as Tetris blocks.
 * Uses a 5x6 (height x width) bitmap font where each '#' is a filled block.
 */
const FONT_5x6: Record<string, string[]> = {
  C: ["####", "#...", "#...", "#...", "#...", "####"],
  O: ["####", "#..#", "#..#", "#..#", "#..#", "####"],
  M: ["#..#", "####", "####", "#..#", "#..#", "#..#"],
  I: ["####", ".##.", ".##.", ".##.", ".##.", "####"],
  T: ["####", ".##.", ".##.", ".##.", ".##.", ".##."],
  L: ["#...", "#...", "#...", "#...", "#...", "####"],
  A: [".##.", "#..#", "####", "#..#", "#..#", "#..#"],
  S: ["####", "#...", "####", "...#", "...#", "####"],
  H: ["#..#", "#..#", "####", "#..#", "#..#", "#..#"],
  R: ["####", "#..#", "####", "##..", "#.#.", "#..#"],
  P: ["####", "#..#", "####", "#...", "#...", "#..."],
  N: ["#..#", "##.#", "##.#", "#.##", "#.##", "#..#"],
  E: ["####", "#...", "###.", "#...", "#...", "####"],
  D: ["###.", "#..#", "#..#", "#..#", "#..#", "###."],
  G: ["####", "#...", "#.##", "#..#", "#..#", "####"],
  V: ["#..#", "#..#", "#..#", "#..#", ".##.", ".##."],
  Y: ["#..#", "#..#", ".##.", ".##.", ".##.", ".##."],
  ".": ["....", "....", "....", "....", "....", "##.."],
  " ": ["....", "....", "....", "....", "....", "...."],
  "0": ["####", "#..#", "#..#", "#..#", "#..#", "####"],
  "1": [".##.", "###.", ".##.", ".##.", ".##.", "####"],
  "5": ["####", "#...", "####", "...#", "...#", "####"],
  "7": ["####", "...#", "..#.", ".#..", ".#..", ".#.."],
  "8": ["####", "#..#", "####", "#..#", "#..#", "####"],
  "%": ["#..#", "..#.", "..#.", ".#..", ".#..", "#..#"],
};

export function PixelText({
  text,
  cellSize,
  color,
  glow = false,
}: {
  text: string;
  cellSize: number;
  color: string;
  glow?: boolean;
}) {
  const chars = text.toUpperCase().split("");
  const charWidth = 4;
  const charHeight = 6;
  const charSpacing = 1; // 1 cell between chars

  return (
    <div style={{ display: "flex", gap: cellSize * charSpacing }}>
      {chars.map((ch, idx) => {
        const grid = FONT_5x6[ch];
        if (!grid) return null;
        return (
          <div
            key={idx}
            style={{
              position: "relative",
              width: charWidth * cellSize,
              height: charHeight * cellSize,
            }}
          >
            {grid.map((row, r) =>
              row.split("").map((c, cc) =>
                c === "#" ? (
                  <div
                    key={`${r}-${cc}`}
                    style={{
                      position: "absolute",
                      left: cc * cellSize,
                      top: r * cellSize,
                    }}
                  >
                    <Block size={cellSize} color={color} glow={glow} />
                  </div>
                ) : null
              )
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Falling piece drop animator — given a target y and frame, returns offset y. */
export function dropY(targetY: number, frame: number, fps: number): number {
  const s = spring({
    frame,
    fps,
    config: { damping: 14, stiffness: 200, mass: 0.8 },
  });
  return interpolate(s, [0, 1], [-targetY - 200, 0]);
}
