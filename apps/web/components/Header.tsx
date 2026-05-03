"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { WalletButton } from "./wallet/WalletButton";
import { cn } from "@/lib/cn";
import { useLiveMetrics } from "@/lib/hooks";
import { OnlineCounter } from "./OnlineCounter";

const NAV: { href: string; label: string }[] = [
  { href: "/", label: "LOBBY" },
  { href: "/me", label: "ME" },
  { href: "/stats", label: "STATS" },
  { href: "/whitepaper", label: "WHITEPAPER" },
];

const PUMP_FUN_URL =
  "https://pump.fun/coin/CYQ3wHfoc6WsFvf7HUoceagenw5Xfy9X824svazapump";

import { usePreviewMode } from "@/lib/previewMode";

export function Header() {
  const pathname = usePathname();
  const { inQueue, matchesActive, loading } = useLiveMetrics();
  const previewMode = usePreviewMode();
  // In preview mode, show static zeros instead of devnet activity
  const queueDisplay = previewMode ? "0" : loading ? "—" : `${inQueue}`;
  const matchDisplay = previewMode ? "0" : loading ? "—" : `${matchesActive}`;

  return (
    <header className="relative z-50 border-b border-edge bg-bg-deep/90 backdrop-blur-sm">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 sm:gap-6 px-4 sm:px-6 py-3 sm:py-4">
        <Link href="/" className="flex items-center gap-2 sm:gap-3 min-w-0 shrink">
          <Logo />
          <div className="min-w-0">
            <div className="text-pixel-sm sm:text-pixel-md glow-magenta truncate">
              COMMITCLASH
            </div>
            <div className="hidden sm:block text-pixel-xs text-ink-mute">
              RPS // ON-CHAIN.SOL
            </div>
          </div>
        </Link>

        <nav className="hidden md:flex items-center gap-1">
          {NAV.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "text-pixel-sm px-4 py-2 transition-all border border-transparent",
                  active
                    ? "text-acid border-acid shadow-glow-acid"
                    : "text-ink-dim hover:text-cyan hover:border-cyan/30"
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-3 shrink-0">
          <div className="hidden md:flex items-center gap-3 border border-edge px-3 py-1.5">
            <OnlineCounter />
            <span className="text-edge">|</span>
            <Stat label="IN QUEUE" value={queueDisplay} tone="cyan" />
            <span className="text-edge">|</span>
            <Stat label="LIVE MATCH" value={matchDisplay} tone="magenta" />
          </div>
          <WalletButton />
          <a
            href={PUMP_FUN_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="View $RPS on pump.fun"
            className="ml-6 shrink-0 transition-transform hover:scale-110"
          >
            <img
              src="/coin-spin.gif"
              alt="$RPS"
              width={40}
              height={40}
              className="pixelated drop-shadow-[0_0_8px_rgba(255,157,16,0.5)]"
            />
          </a>
        </div>
      </div>
    </header>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "ok" | "cyan" | "magenta";
}) {
  const glow =
    tone === "ok" ? "glow-ok" : tone === "cyan" ? "glow-cyan" : "glow-magenta";
  return (
    <div className="flex flex-col items-center leading-none">
      <span className="text-[8px] tracking-widest text-ink-mute uppercase mb-0.5">
        {label}
      </span>
      <span className={`text-pixel-sm ${glow}`}>{value}</span>
    </div>
  );
}

function Logo() {
  // Tight 7x7 pixel cross (RPS color quartet around dark center).
  // viewBox is cropped so the rendered icon has minimal padding.
  return (
    <svg
      width={36}
      height={36}
      viewBox="0 0 7 7"
      shapeRendering="crispEdges"
      className="pixelated shrink-0"
    >
      <rect x={2} y={0} width={3} height={2} fill="#ff2bd6" />
      <rect x={0} y={2} width={2} height={3} fill="#00f5d4" />
      <rect x={5} y={2} width={2} height={3} fill="#fffb00" />
      <rect x={2} y={5} width={3} height={2} fill="#00ff88" />
      <rect x={2} y={2} width={3} height={3} fill="#0a0e1a" stroke="#e0e0ff" strokeWidth="0.25" />
    </svg>
  );
}
