"use client";

import { motion } from "framer-motion";
import { MoveSprite, type Move } from "./sprites/MoveSprite";
import { cn } from "@/lib/cn";

export function MoveButton({
  move,
  selected,
  disabled,
  onClick,
}: {
  move: Move;
  selected?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}) {
  const code = move === "rock" ? "0x01" : move === "paper" ? "0x02" : "0x03";
  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={disabled}
      whileHover={disabled ? undefined : { y: -2 }}
      whileTap={disabled ? undefined : { y: 1 }}
      className={cn(
        "relative flex flex-col items-center justify-center gap-3 p-6 transition-all",
        "bg-bg-elev border-2",
        selected
          ? "border-acid shadow-glow-acid"
          : "border-edge hover:border-cyan",
        disabled && "opacity-40 cursor-not-allowed"
      )}
      style={{
        clipPath:
          "polygon(0 6px, 6px 6px, 6px 0, calc(100% - 6px) 0, calc(100% - 6px) 6px, 100% 6px, 100% calc(100% - 6px), calc(100% - 6px) calc(100% - 6px), calc(100% - 6px) 100%, 6px 100%, 6px calc(100% - 6px), 0 calc(100% - 6px))",
      }}
    >
      <span className="text-pixel-xs text-ink-mute">{code}</span>
      <MoveSprite move={move} size={120} glow={selected} />
      <span
        className={cn(
          "text-pixel-md",
          selected ? "glow-acid" : "text-ink-dim"
        )}
      >
        {move.toUpperCase()}
      </span>
      {selected && (
        <span className="absolute top-2 right-3 text-pixel-xs glow-acid animate-blink">
          ◀ SELECTED
        </span>
      )}
    </motion.button>
  );
}
