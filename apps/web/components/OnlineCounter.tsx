"use client";

import { ABLY_ENABLED, usePresenceCount } from "./AblyPresence";

/**
 * Real-time count of how many browsers are connected to the COMMITCLASH
 * room via Ably presence. If Ably isn't configured (env var missing) we
 * render "—" instead of crashing.
 */
export function OnlineCounter() {
  const { count, ready } = usePresenceCount();

  const value = !ABLY_ENABLED
    ? "—"
    : !ready
    ? "…"
    : `${count}`;

  return (
    <div className="flex flex-col items-center leading-none">
      <span className="text-[8px] tracking-widest text-ink-mute uppercase mb-0.5">
        ONLINE
      </span>
      <span className="text-pixel-sm glow-ok">{value}</span>
    </div>
  );
}
