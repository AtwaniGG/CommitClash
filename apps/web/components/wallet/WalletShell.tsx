"use client";

import { useEffect, useMemo } from "react";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import {
  PhantomWalletAdapter,
  SolflareWalletAdapter,
} from "@solana/wallet-adapter-wallets";
import { clusterApiUrl } from "@solana/web3.js";

import "@solana/wallet-adapter-react-ui/styles.css";

const NETWORK = process.env.NEXT_PUBLIC_SOLANA_CLUSTER ?? "devnet";

// web3.js auto-derives wss:// from https:// but on Helius free that
// subscription socket sometimes errors mid-handshake. We never use account /
// log subscriptions ourselves — confirmTransaction opens one transparently
// and falls back to polling if it fails. Passing wsEndpoint explicitly stops
// the URL parser from producing an invalid endpoint when the http URL has
// query params (e.g. ?api-key=…).
function deriveWsEndpoint(http: string): string | undefined {
  try {
    const u = new URL(http);
    u.protocol = u.protocol === "http:" ? "ws:" : "wss:";
    return u.toString();
  } catch {
    return undefined;
  }
}

export function WalletShell({ children }: { children: React.ReactNode }) {
  const endpoint = useMemo(() => {
    if (NETWORK === "mainnet" || NETWORK === "mainnet-beta") {
      return process.env.NEXT_PUBLIC_RPC_URL ?? clusterApiUrl("mainnet-beta");
    }
    return process.env.NEXT_PUBLIC_RPC_URL ?? clusterApiUrl("devnet");
  }, []);

  const wsEndpoint = useMemo(() => deriveWsEndpoint(endpoint), [endpoint]);

  const wallets = useMemo(
    () => [new PhantomWalletAdapter(), new SolflareWalletAdapter()],
    []
  );

  // web3.js logs a few benign things to console.error that show up as red
  // overlays in Next dev mode but are non-fatal:
  //   - "ws error: undefined"  → subscription socket flake; we don't use subs
  //   - "Server responded with 429... Retrying after Xms delay"  → SDK's own
  //     rate-limit retry; the request eventually succeeds via backoff
  // Filter both so dev tools stays useful.
  useEffect(() => {
    const orig = console.error;
    const SUPPRESS = [/^ws error/, /Server responded with 4\d\d.*Retrying/];
    console.error = (...args: any[]) => {
      const first = args[0];
      if (typeof first === "string" && SUPPRESS.some((r) => r.test(first))) return;
      orig(...args);
    };
    return () => { console.error = orig; };
  }, []);

  return (
    <ConnectionProvider
      endpoint={endpoint}
      config={{ commitment: "confirmed", wsEndpoint }}
    >
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
