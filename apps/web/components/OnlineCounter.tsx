"use client";

import { useOthers } from "@liveblocks/react";
import { LIVEBLOCKS_ENABLED } from "./LiveblocksWrapper";

/**
 * Real-time count of how many browsers are connected to the COMMITCLASH room.
 * `useOthers()` returns everyone EXCEPT this client, so we add 1 for self.
 *
 * If Liveblocks isn't configured (env var missing) we render a safe fallback
 * that never calls the hook (hooks can't be conditional, so this lives in a
 * separate component path).
 */
export function OnlineCounter() {
  if (!LIVEBLOCKS_ENABLED) {
    return <Stat label="ONLINE" value="—" />;
  }
  return <OnlineCounterLive />;
}

function OnlineCounterLive() {
  const others = useOthers();
  const count = others.length + 1; // +1 for me
  return <Stat label="ONLINE" value={`${count}`} />;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-center leading-none">
      <span className="text-[8px] tracking-widest text-ink-mute uppercase mb-0.5">
        {label}
      </span>
      <span className="text-pixel-sm glow-ok">{value}</span>
    </div>
  );
}
