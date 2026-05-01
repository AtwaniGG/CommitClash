"use client";

import { LiveblocksProvider, RoomProvider } from "@liveblocks/react";
import type { ReactNode } from "react";

const PUBLIC_KEY = process.env.NEXT_PUBLIC_LIVEBLOCKS_PUBLIC_KEY;

/**
 * Wraps the app in a Liveblocks room so we can show "X online" via the
 * `useOthers` hook. The room id is hardcoded ("commitclash-lobby") — every
 * connected browser joins the same room. If the env key is missing
 * (e.g. during local dev without setup) we render children directly so the
 * site keeps working; the online counter degrades to "—".
 */
export function LiveblocksWrapper({ children }: { children: ReactNode }) {
  if (!PUBLIC_KEY) return <>{children}</>;

  return (
    <LiveblocksProvider publicApiKey={PUBLIC_KEY}>
      <RoomProvider id="commitclash-lobby" initialPresence={{}}>
        {children}
      </RoomProvider>
    </LiveblocksProvider>
  );
}

export const LIVEBLOCKS_ENABLED = !!PUBLIC_KEY;
