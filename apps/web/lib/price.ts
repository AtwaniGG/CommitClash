/**
 * $RPS → SOL price oracle. Pulls from Jupiter's Lite Price API and falls
 * back to a deterministic constant when Jupiter doesn't have the mint
 * (devnet pre-launch). The fallback is calibrated to make 30,000 $RPS equal
 * the 0.015 SOL entry of the SOL_30K pool — keeps the UI sensible until the
 * token actually trades.
 */

const JUP_PRICE_URL = "https://lite-api.jup.ag/price/v3";
const RPS_MINT = process.env.NEXT_PUBLIC_RPS_MINT
  ?? "AyKZ2a5CRZX3sMihAQ6CbBJJPjoYqwL9dneaAS7GFGRL";
const SOL_MINT = "So11111111111111111111111111111111111111112";

// Fallback ratio: 0.015 SOL / 30_000 $RPS = 5e-7 SOL per 1 raw $RPS unit.
// Note: $RPS uses 6 decimals — this constant is per-WHOLE-token, so the
// converter multiplies it by the token amount in whole units, not millionths.
const FALLBACK_RPS_IN_SOL = 0.015 / 30_000;

const CACHE_MS = 60_000;
let __cached: { rpsInSol: number; rpsUsd: number; solUsd: number; at: number } | null = null;
let __inflight: Promise<{ rpsInSol: number; rpsUsd: number; solUsd: number }> | null = null;

export interface PriceSnapshot {
  rpsInSol: number;     // SOL per 1 whole $RPS
  rpsUsd: number;       // USD per 1 whole $RPS  (0 if unknown)
  solUsd: number;       // USD per 1 SOL         (0 if unknown)
  source: "jupiter" | "fallback";
}

export async function fetchRpsInSol(): Promise<PriceSnapshot> {
  // Hot cache hit
  if (__cached && Date.now() - __cached.at < CACHE_MS) {
    return { ...__cached, source: "jupiter" };
  }
  // Single-flight: if a fetch is already in progress, wait for it
  if (__inflight) {
    const r = await __inflight;
    return { ...r, source: "jupiter" };
  }

  __inflight = (async () => {
    try {
      const url = `${JUP_PRICE_URL}?ids=${RPS_MINT},${SOL_MINT}`;
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error(`Jupiter ${res.status}`);
      const json = await res.json();
      // v3 shape: { "<mint>": { "usdPrice": number, ... }, ... }
      const rpsUsd = Number(json?.[RPS_MINT]?.usdPrice ?? 0);
      const solUsd = Number(json?.[SOL_MINT]?.usdPrice ?? 0);
      if (!rpsUsd || !solUsd) throw new Error("Jupiter missing prices");
      const rpsInSol = rpsUsd / solUsd;
      __cached = { rpsInSol, rpsUsd, solUsd, at: Date.now() };
      return { rpsInSol, rpsUsd, solUsd };
    } finally {
      __inflight = null;
    }
  })();

  try {
    const r = await __inflight;
    return { ...r, source: "jupiter" };
  } catch {
    return {
      rpsInSol: FALLBACK_RPS_IN_SOL,
      rpsUsd: 0,
      solUsd: 0,
      source: "fallback",
    };
  }
}

/** Convert a whole-$RPS amount to SOL using the latest cached price. */
export function rpsToSol(amountWholeRps: number, snapshot: PriceSnapshot): number {
  return amountWholeRps * snapshot.rpsInSol;
}
