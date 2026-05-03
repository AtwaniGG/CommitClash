import React from "react";
import { COLORS } from "./brand";

/**
 * Pac-Man themed primitives.
 *
 * Classic arcade visual language: black bg, thin cyan/blue maze walls,
 * white dots, yellow Pac-Man (with chomping mouth), and 4 colored ghosts
 * (Blinky/Pinky/Inky/Clyde).
 */

export const PAC_YELLOW = "#ffe61a";
export const MAZE_BLUE = "#1e2bff";
export const MAZE_CYAN = COLORS.cyan;
export const DOT_WHITE = "#fff";

export const GHOST_COLORS = {
  blinky: "#ff0000",  // red
  pinky: "#ffb8de",   // pink
  inky: "#00ffff",    // cyan
  clyde: "#ffb852",   // orange
  scared: "#1e2bff",  // blue (when vulnerable)
};

/** Yellow Pac-Man character with optional mouth-open angle (0..1). */
export function PacmanChar({
  size,
  mouthOpen = 0.5,
  facing = "right",
}: {
  size: number;
  /** 0 = closed, 1 = wide open. Animate via Math.abs(Math.sin(frame*0.4)). */
  mouthOpen?: number;
  facing?: "right" | "left" | "up" | "down";
}) {
  // Mouth angle: 0..50° each side from horizontal
  const halfAngle = mouthOpen * 50;
  const startA = -halfAngle * (Math.PI / 180);
  const endA = halfAngle * (Math.PI / 180);
  const r = 50;
  const cx = 50, cy = 50;
  const x1 = cx + r * Math.cos(startA);
  const y1 = cy + r * Math.sin(startA);
  const x2 = cx + r * Math.cos(endA);
  const y2 = cy + r * Math.sin(endA);
  // Flag = 1 (large arc) for the body
  const path = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 1 1 ${x2} ${y2} Z`;
  // Rotate based on facing direction
  const rot =
    facing === "right" ? 0 : facing === "down" ? 90 : facing === "left" ? 180 : 270;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      style={{
        filter: `drop-shadow(0 0 8px ${PAC_YELLOW}80) drop-shadow(0 0 24px ${PAC_YELLOW}40)`,
        transform: `rotate(${rot}deg)`,
      }}
    >
      <path d={path} fill={PAC_YELLOW} />
    </svg>
  );
}

/** A ghost with colored body + eyes that look toward `lookDir`. */
export function Ghost({
  size,
  color,
  lookDir = "right",
  scared = false,
}: {
  size: number;
  color: string;
  lookDir?: "right" | "left" | "up" | "down";
  scared?: boolean;
}) {
  const fill = scared ? GHOST_COLORS.scared : color;
  const pupilOffset = {
    right: { x: 4, y: 0 },
    left: { x: -4, y: 0 },
    up: { x: 0, y: -4 },
    down: { x: 0, y: 4 },
  }[lookDir];

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      style={{
        filter: `drop-shadow(0 0 6px ${fill}80)`,
      }}
    >
      {/* Body — rounded top, wavy bottom (3 humps) */}
      <path
        d="M 10 50 A 40 40 0 0 1 90 50 L 90 90 L 80 80 L 70 90 L 60 80 L 50 90 L 40 80 L 30 90 L 20 80 L 10 90 Z"
        fill={fill}
      />
      {/* Eye whites */}
      <circle cx="35" cy="45" r="11" fill="white" />
      <circle cx="65" cy="45" r="11" fill="white" />
      {/* Pupils — direction-aware */}
      <circle
        cx={35 + pupilOffset.x}
        cy={45 + pupilOffset.y}
        r="5"
        fill={scared ? "#ffe61a" : "#1d2dff"}
      />
      <circle
        cx={65 + pupilOffset.x}
        cy={45 + pupilOffset.y}
        r="5"
        fill={scared ? "#ffe61a" : "#1d2dff"}
      />
      {scared && (
        <>
          {/* Scared mouth */}
          <path
            d="M 25 70 L 35 65 L 45 70 L 55 65 L 65 70 L 75 65"
            stroke="#ffe61a"
            strokeWidth="3"
            fill="none"
          />
        </>
      )}
    </svg>
  );
}

/** A small white dot — the basic Pac-Man pellet. */
export function Dot({
  size,
  color = DOT_WHITE,
}: {
  size: number;
  color?: string;
}) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        backgroundColor: color,
        boxShadow: `0 0 ${size * 0.4}px ${color}80`,
      }}
    />
  );
}

/** A power pellet — bigger dot that pulses. */
export function PowerPellet({
  size,
  color = DOT_WHITE,
  pulse = 1,
}: {
  size: number;
  color?: string;
  pulse?: number;
}) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        backgroundColor: color,
        boxShadow: `0 0 ${size * 0.8 * pulse}px ${color}, 0 0 ${size * 1.6 * pulse}px ${color}80`,
        opacity: 0.6 + pulse * 0.4,
      }}
    />
  );
}

/**
 * Maze walls — drawn as a series of thin colored rectangles forming
 * corridors. Returns SVG <path> elements positioned across the screen.
 */
export function MazeWalls({
  width,
  height,
  color = MAZE_BLUE,
  glow = true,
}: {
  width: number;
  height: number;
  color?: string;
  glow?: boolean;
}) {
  // Hand-drawn corridor pattern — mimics classic Pac-Man maze geometry
  // by stamping rounded rectangles at fixed grid positions.
  const cellSize = Math.min(width, height) / 16;
  const stroke = 4;

  // Corridors are defined as (col, row, w, h) tuples in grid coords
  // Symmetric maze layout — drawn in the center of the screen
  const corridors: { x: number; y: number; w: number; h: number }[] = [
    // Top row
    { x: 1, y: 1, w: 6, h: 2 },
    { x: 9, y: 1, w: 6, h: 2 },
    // Middle horizontal walls
    { x: 1, y: 5, w: 4, h: 1 },
    { x: 7, y: 5, w: 2, h: 1 },
    { x: 11, y: 5, w: 4, h: 1 },
    // Center pen (ghost house style)
    { x: 6, y: 8, w: 4, h: 2 },
    // Lower horizontals
    { x: 1, y: 12, w: 4, h: 1 },
    { x: 7, y: 12, w: 2, h: 1 },
    { x: 11, y: 12, w: 4, h: 1 },
    // Bottom verticals
    { x: 3, y: 14, w: 1, h: 2 },
    { x: 12, y: 14, w: 1, h: 2 },
  ];

  // Center the maze in the viewport
  const mazeW = 16 * cellSize;
  const mazeH = 17 * cellSize;
  const offsetX = (width - mazeW) / 2;
  const offsetY = (height - mazeH) / 2;

  return (
    <svg
      width={width}
      height={height}
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        filter: glow ? `drop-shadow(0 0 4px ${color})` : undefined,
      }}
    >
      {corridors.map((c, i) => (
        <rect
          key={i}
          x={offsetX + c.x * cellSize}
          y={offsetY + c.y * cellSize}
          width={c.w * cellSize}
          height={c.h * cellSize}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          rx={stroke}
        />
      ))}
      {/* Outer maze frame */}
      <rect
        x={offsetX}
        y={offsetY}
        width={mazeW}
        height={mazeH}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        rx={stroke}
      />
    </svg>
  );
}

/** Score readout in the classic arcade font style. */
export function ScoreDisplay({
  label,
  value,
  color = PAC_YELLOW,
  size = 24,
}: {
  label: string;
  value: string;
  color?: string;
  size?: number;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 4,
      }}
    >
      <div
        style={{
          fontFamily: "'Press Start 2P', monospace",
          fontSize: size * 0.5,
          color: "#fff",
          letterSpacing: "0.15em",
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: "'Press Start 2P', monospace",
          fontSize: size,
          color,
          letterSpacing: "0.05em",
          textShadow: `0 0 8px ${color}80`,
        }}
      >
        {value}
      </div>
    </div>
  );
}
