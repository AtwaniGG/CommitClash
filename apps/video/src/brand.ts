/**
 * Shared brand constants — same palette + typography as the web app.
 * Mirrors apps/web/app/globals.css and components/sprites/MoveSprite.tsx
 * so the video reads as the same product.
 */

export const COLORS = {
  bgBase: "#0a0a14",
  bgDeep: "#05070d",
  bgElev: "#11111e",
  edge: "#1a1a2e",
  ink: "#e9e9ff",
  inkDim: "#9090b8",
  inkMute: "#5e5e80",
  magenta: "#ff2bd6",
  cyan: "#00f5d4",
  acid: "#fffb00",
  burn: "#ff003c",
  ok: "#00ff88",
};

export const FONTS = {
  display: "'Press Start 2P', monospace",
  mono: "'VT323', monospace",
  body: "system-ui, sans-serif",
};

export const PALETTES: Record<
  "rock" | "paper" | "scissors",
  { fill: string; shade: string; hi: string }
> = {
  rock: { fill: "#a0a4c0", shade: "#4a5379", hi: "#e0e0ff" },
  paper: { fill: "#fffb00", shade: "#a8a500", hi: "#ffffff" },
  scissors: { fill: "#ff2bd6", shade: "#a01088", hi: "#ffe0fb" },
};
