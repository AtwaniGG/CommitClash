/**
 * Pixel-art sprites for Rock / Paper / Scissors.
 * Drawn as 16x16 SVG rect grids — keep image-rendering: pixelated when scaled.
 */

import { cn } from "@/lib/cn";

type Move = "rock" | "paper" | "scissors";

const PALETTES: Record<Move, { fill: string; shade: string; hi: string }> = {
  rock: { fill: "#a0a4c0", shade: "#4a5379", hi: "#e0e0ff" },
  paper: { fill: "#fffb00", shade: "#a8a500", hi: "#ffffff" },
  scissors: { fill: "#ff2bd6", shade: "#a01088", hi: "#ffe0fb" },
};

// Each sprite is a 16x16 grid: each char = one pixel.
// '.' = transparent, 'F' = fill, 'S' = shade, 'H' = highlight, 'O' = outline
const ROCK = [
  "................",
  "................",
  ".....HHHH.......",
  "....HFFFFFO.....",
  "...HFFFFFFFFO...",
  "..HFFFFFFFFFFO..",
  ".HFFFFFFFFFFFSO.",
  ".HFFFFFFFFFSSSO.",
  ".HFFFFFFFSSSSSO.",
  ".HFFFFFFSSSSSSO.",
  "..OFFFSSSSSSSO..",
  "..OSSSSSSSSSSO..",
  "...OSSSSSSSSO...",
  "....OOOOOOOO....",
  "................",
  "................",
];

const PAPER = [
  "................",
  ".OOOOOOOOOOOOO..",
  ".OFFFFFFFFFFFO..",
  ".OFFFFFFFFFFFO..",
  ".OFSSSSSSSSSFO..",
  ".OFFFFFFFFFFFO..",
  ".OFSSSSSSSSSFO..",
  ".OFFFFFFFFFFFO..",
  ".OFSSSSSSSSSFO..",
  ".OFFFFFFFFFFFO..",
  ".OFSSSSSSSSSFO..",
  ".OFFFFFFFFFFFO..",
  ".OFFFFFFFFFFFO..",
  ".OOOOOOOOOOOOO..",
  "................",
  "................",
];

const SCISSORS = [
  "................",
  ".OO.........OO..",
  ".OFO.......OFO..",
  "..OFO.....OFO...",
  "...OFO...OFO....",
  "....OFO.OFO.....",
  ".....OFOFO......",
  "......OOO.......",
  "......OOO.......",
  ".....OFOFO......",
  "....OFO.OFO.....",
  "...OFO...OFO....",
  "..OFO.....OFO...",
  ".OFO.......OFO..",
  ".OO.........OO..",
  "................",
];

const SPRITES: Record<Move, string[]> = {
  rock: ROCK,
  paper: PAPER,
  scissors: SCISSORS,
};

export function MoveSprite({
  move,
  size = 96,
  className,
  glow = false,
}: {
  move: Move;
  size?: number;
  className?: string;
  glow?: boolean;
}) {
  const palette = PALETTES[move];
  const grid = SPRITES[move];
  const px = size / 16;

  const filterId = `glow-${move}`;

  return (
    <svg
      className={cn("pixelated", className)}
      width={size}
      height={size}
      viewBox="0 0 16 16"
      shapeRendering="crispEdges"
      style={glow ? { filter: `drop-shadow(0 0 6px ${palette.fill}) drop-shadow(0 0 16px ${palette.fill}80)` } : undefined}
    >
      {grid.map((row, y) =>
        row.split("").map((ch, x) => {
          if (ch === ".") return null;
          let color: string;
          if (ch === "F") color = palette.fill;
          else if (ch === "S") color = palette.shade;
          else if (ch === "H") color = palette.hi;
          else color = "#0a0e1a"; // outline
          return (
            <rect
              key={`${x}-${y}`}
              x={x}
              y={y}
              width={1}
              height={1}
              fill={color}
            />
          );
        })
      )}
    </svg>
  );
}

export function MoveLabel({ move }: { move: Move }) {
  return (
    <span className="text-pixel-sm">
      {move === "rock" && "ROCK"}
      {move === "paper" && "PAPER"}
      {move === "scissors" && "SCISSORS"}
    </span>
  );
}

export const MOVES: Move[] = ["rock", "paper", "scissors"];
export type { Move };
