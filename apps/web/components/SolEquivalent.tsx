"use client";

import { useEffect, useState } from "react";
import { fetchRpsInSol, rpsToSol, type PriceSnapshot } from "@/lib/price";

export function usePriceSnapshot(): PriceSnapshot | null {
  const [snap, setSnap] = useState<PriceSnapshot | null>(__snapshot);
  useEffect(() => {
    __subscribers.add(setSnap);
    if (__snapshot) setSnap(__snapshot);
    ensurePoller();
    return () => { __subscribers.delete(setSnap); };
  }, []);
  return snap;
}

// Module-level cache so 6 PoolCards on the lobby don't each fire their own
// Jupiter request — first one fetches, the rest reuse the snapshot.
let __snapshot: PriceSnapshot | null = null;
let __subscribers = new Set<(s: PriceSnapshot) => void>();
let __pollerStarted = false;

function ensurePoller() {
  if (__pollerStarted) return;
  __pollerStarted = true;
  const tick = async () => {
    try {
      const snap = await fetchRpsInSol();
      __snapshot = snap;
      __subscribers.forEach((cb) => cb(snap));
    } catch { /* swallow — fallback already returned */ }
  };
  tick();
  setInterval(tick, 60_000);
}

/**
 * Renders "≈ X.XXX SOL" derived from the current $RPS-in-SOL price.
 * The amount prop is in WHOLE $RPS units (e.g. 30000 for the 30K pool).
 */
export function SolEquivalent({
  rps,
  className,
}: {
  rps: number;
  className?: string;
}) {
  const [snap, setSnap] = useState<PriceSnapshot | null>(__snapshot);

  useEffect(() => {
    __subscribers.add(setSnap);
    if (__snapshot) setSnap(__snapshot);
    ensurePoller();
    return () => { __subscribers.delete(setSnap); };
  }, []);

  if (!snap) {
    return <span className={className}>≈ … SOL</span>;
  }
  const sol = rpsToSol(rps, snap);
  // 3 decimals for the small / mid pools, 2 for big ones to avoid clutter.
  const display = sol >= 1 ? sol.toFixed(2) : sol.toFixed(3);
  return <span className={className}>≈ {display} SOL</span>;
}
