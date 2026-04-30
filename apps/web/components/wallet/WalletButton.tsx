"use client";

import dynamic from "next/dynamic";

/**
 * Dynamic import disables SSR for the wallet-adapter button.
 * Without this, the server renders "Select Wallet" but the client (after
 * detecting installed wallets) renders an icon + name — causing a hydration
 * mismatch on first paint.
 */
export const WalletButton = dynamic(
  async () =>
    (await import("@solana/wallet-adapter-react-ui")).WalletMultiButton,
  {
    ssr: false,
    loading: () => (
      <button
        className="pixel-btn pixel-btn--magenta"
        disabled
        suppressHydrationWarning
      >
        ▶ CONNECT
      </button>
    ),
  }
);
