"use client";

import * as Ably from "ably";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

const KEY = process.env.NEXT_PUBLIC_ABLY_KEY;
const CHANNEL_NAME = "commitclash-lobby";

interface PresenceState {
  count: number;
  ready: boolean;
}

const PresenceContext = createContext<PresenceState>({
  count: 0,
  ready: false,
});

/**
 * Connects to Ably's realtime presence channel and tracks how many
 * browsers are currently in the COMMITCLASH lobby.
 *
 * Each open tab counts as one — we use a fresh random clientId per
 * mount so multiple tabs from the same wallet show as multiple users
 * (matches the "real online users" intuition).
 */
export function AblyPresenceProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PresenceState>({
    count: 0,
    ready: false,
  });
  const ablyRef = useRef<Ably.Realtime | null>(null);

  useEffect(() => {
    if (!KEY) return;

    const clientId =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `c-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const ably = new Ably.Realtime({ key: KEY, clientId });
    ablyRef.current = ably;
    const channel = ably.channels.get(CHANNEL_NAME);

    let mounted = true;

    const refresh = async () => {
      try {
        const members = await channel.presence.get();
        if (mounted) {
          setState((s) => ({ ...s, count: members.length }));
        }
      } catch {
        // ignore transient errors
      }
    };

    const enterAndSubscribe = async () => {
      try {
        await channel.presence.enter({ joinedAt: Date.now() });
        if (mounted) setState({ count: 0, ready: true });
        await refresh();
        await channel.presence.subscribe(refresh);
      } catch (e) {
        // Likely auth/network — bail silently and let server stay 0
        console.warn("Ably presence init failed:", e);
      }
    };

    enterAndSubscribe();

    return () => {
      mounted = false;
      try {
        channel.presence.leave().catch(() => {});
      } catch {
        // ignore
      }
      ably.close();
      ablyRef.current = null;
    };
  }, []);

  return (
    <PresenceContext.Provider value={state}>
      {children}
    </PresenceContext.Provider>
  );
}

export function usePresenceCount(): { count: number; ready: boolean } {
  return useContext(PresenceContext);
}

export const ABLY_ENABLED = !!KEY;
