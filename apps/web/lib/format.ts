export function shortAddress(addr: string, chars = 4): string {
  if (!addr || addr.length <= chars * 2 + 2) return addr;
  return `${addr.slice(0, chars)}…${addr.slice(-chars)}`;
}

export function fmtNumber(n: number | bigint, opts: { compact?: boolean } = {}): string {
  const num = typeof n === "bigint" ? Number(n) : n;
  if (opts.compact) {
    return new Intl.NumberFormat("en-US", {
      notation: "compact",
      maximumFractionDigits: 2,
    }).format(num);
  }
  return new Intl.NumberFormat("en-US").format(num);
}

export function fmtTokens(rawAmount: number | bigint, decimals = 6): string {
  const n = typeof rawAmount === "bigint" ? Number(rawAmount) : rawAmount;
  const scaled = n / 10 ** decimals;
  return fmtNumber(scaled, { compact: scaled >= 10_000 });
}

export function fmtCompact(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

export function fmtSlotsToHuman(slots: number): string {
  // ~400ms per slot
  const sec = Math.round((slots * 400) / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = (min / 60).toFixed(1);
  return `${hr}h`;
}
