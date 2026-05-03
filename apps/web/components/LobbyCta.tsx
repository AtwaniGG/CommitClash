"use client";

import Link from "next/link";
import { usePreviewMode } from "@/lib/previewMode";

/**
 * Hero "ENTER POOL_30K" CTA — gated by preview mode.
 * In preview: shows a non-clickable "▶ COMING SOON" button.
 */
export function HeroCta() {
  const previewMode = usePreviewMode();
  if (previewMode) {
    return (
      <button
        disabled
        className="pixel-btn pixel-btn--magenta opacity-60 cursor-not-allowed"
      >
        ▶ COMING SOON
      </button>
    );
  }
  return (
    <Link href="/play/0" className="pixel-btn pixel-btn--magenta">
      ▶ ENTER POOL_30K
    </Link>
  );
}

/**
 * PoolCard "JOIN MATCH" / "START QUEUE" CTA — gated by preview mode.
 * In preview: shows a non-clickable "▶ COMING SOON" button so the lobby
 * can still display the pool tiers but no one can enter a game.
 */
export function PoolJoinCta({
  poolId,
  hasQueue,
}: {
  poolId: number;
  hasQueue: boolean;
}) {
  const previewMode = usePreviewMode();
  if (previewMode) {
    return (
      <button
        disabled
        className="pixel-btn pixel-btn--magenta w-full opacity-60 cursor-not-allowed"
      >
        ▶ COMING SOON
      </button>
    );
  }
  return (
    <Link
      href={`/play/${poolId}`}
      className="pixel-btn pixel-btn--magenta w-full"
    >
      {hasQueue ? "▶ JOIN MATCH" : "▶ START QUEUE"}
    </Link>
  );
}

/**
 * Pool stat cell that shows zeros in preview mode (so devnet/mock numbers
 * don't bleed into the public marketing surface).
 */
export function PoolStatCells({
  queueLength,
  rounds,
  burned,
}: {
  queueLength: number;
  rounds: number;
  burned: number;
}) {
  const previewMode = usePreviewMode();
  const q = previewMode ? 0 : queueLength;
  const r = previewMode ? 0 : rounds;
  const b = previewMode ? 0 : burned;
  return (
    <div className="grid grid-cols-3 gap-2 border-t border-edge pt-3">
      <Cell label="QUEUE" value={q === 0 ? "0 — SOLO" : `${q} ⇝`} />
      <Cell label="ROUNDS" value={r.toLocaleString()} />
      <Cell label="BURNED" value={fmtCompact(b)} tone="burn" />
    </div>
  );
}

// Local copies — keep this component file self-contained
function Cell({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "burn";
}) {
  const glow = tone === "burn" ? "glow-burn" : "text-ink";
  return (
    <div className="flex flex-col items-center gap-0.5">
      <div className="text-pixel-xs text-ink-mute">{label}</div>
      <div className={`text-pixel-sm ${glow}`}>{value}</div>
    </div>
  );
}

function fmtCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return `${Math.round(n)}`;
}
