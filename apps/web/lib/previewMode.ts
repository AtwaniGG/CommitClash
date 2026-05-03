/**
 * Pre-launch preview-mode gate.
 *
 *   - By default, the public site shows "COMING SOON" CTAs and zero stats
 *     so visitors can't actually play before the mainnet launch.
 *   - Anyone who visits ANY page with `?dev=1` once gets the dev flag set in
 *     localStorage. From then on (in that browser) they bypass preview mode
 *     and see the full live UI.
 *   - To revoke dev access in a browser, visit `?dev=0`.
 *
 * Server-rendered pages always start in preview mode; the client may then
 * hydrate to live mode after reading localStorage.
 */

"use client";

import { useEffect, useState } from "react";

const KEY = "commitclash:dev";

/** Synchronous read — safe on client, returns false on server. */
function readDevFlagSync(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Hook returning whether the page should display the public preview UI
 * (`true`) vs. the full live UI (`false`).
 *
 * Also handles the `?dev=1` / `?dev=0` query-param gate on first render.
 */
export function usePreviewMode(): boolean {
  // Start in preview mode so SSR + first paint is consistent.
  const [previewMode, setPreviewMode] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Process query-param toggles
    try {
      const params = new URLSearchParams(window.location.search);
      const dev = params.get("dev");
      if (dev === "1") {
        window.localStorage.setItem(KEY, "1");
      } else if (dev === "0") {
        window.localStorage.removeItem(KEY);
      }
    } catch {
      /* ignore */
    }

    // Sync state from localStorage
    setPreviewMode(!readDevFlagSync());
  }, []);

  return previewMode;
}
