import React from "react";
import { PALETTES } from "./brand";

type Move = "rock" | "paper" | "scissors";

const ROCK = [
  "................", "................",
  ".....HHHH.......", "....HFFFFFO.....",
  "...HFFFFFFFFO...", "..HFFFFFFFFFFO..",
  ".HFFFFFFFFFFFSO.", ".HFFFFFFFFFSSSO.",
  ".HFFFFFFFSSSSSO.", ".HFFFFFFSSSSSSO.",
  "..OFFFSSSSSSSO..", "..OSSSSSSSSSSO..",
  "...OSSSSSSSSO...", "....OOOOOOOO....",
  "................", "................",
];
const PAPER = [
  "................", ".OOOOOOOOOOOOO..",
  ".OFFFFFFFFFFFO..", ".OFFFFFFFFFFFO..",
  ".OFSSSSSSSSSFO..", ".OFFFFFFFFFFFO..",
  ".OFSSSSSSSSSFO..", ".OFFFFFFFFFFFO..",
  ".OFSSSSSSSSSFO..", ".OFFFFFFFFFFFO..",
  ".OFSSSSSSSSSFO..", ".OFFFFFFFFFFFO..",
  ".OFFFFFFFFFFFO..", ".OOOOOOOOOOOOO..",
  "................", "................",
];
const SCISSORS = [
  "................", ".OO.........OO..",
  ".OFO.......OFO..", "..OFO.....OFO...",
  "...OFO...OFO....", "....OFO.OFO.....",
  ".....OFOFO......", "......OOO.......",
  "......OOO.......", ".....OFOFO......",
  "....OFO.OFO.....", "...OFO...OFO....",
  "..OFO.....OFO...", ".OFO.......OFO..",
  ".OO.........OO..", "................",
];

const SPRITES: Record<Move, string[]> = { rock: ROCK, paper: PAPER, scissors: SCISSORS };

export function MoveSprite({
  move,
  size = 240,
  glow = false,
}: {
  move: Move;
  size?: number;
  glow?: boolean;
}) {
  const palette = PALETTES[move];
  const grid = SPRITES[move];

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      shapeRendering="crispEdges"
      style={{
        imageRendering: "pixelated",
        filter: glow
          ? `drop-shadow(0 0 12px ${palette.fill}) drop-shadow(0 0 32px ${palette.fill}aa)`
          : undefined,
      }}
    >
      {grid.map((row, y) =>
        row.split("").map((ch, x) => {
          if (ch === ".") return null;
          let color: string;
          if (ch === "F") color = palette.fill;
          else if (ch === "S") color = palette.shade;
          else if (ch === "H") color = palette.hi;
          else color = "#0a0e1a";
          return (
            <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={color} />
          );
        })
      )}
    </svg>
  );
}

export type { Move };
