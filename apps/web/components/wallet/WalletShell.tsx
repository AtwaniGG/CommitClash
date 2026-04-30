"use client";

import { useMemo } from "react";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import {
  PhantomWalletAdapter,
  SolflareWalletAdapter,
} from "@solana/wallet-adapter-wallets";
import { clusterApiUrl } from "@solana/web3.js";

import "@solana/wallet-adapter-react-ui/styles.css";

const NETWORK = process.env.NEXT_PUBLIC_SOLANA_CLUSTER ?? "devnet";

export function WalletShell({ children }: { children: React.ReactNode }) {
  const endpoint = useMemo(() => {
    if (NETWORK === "mainnet" || NETWORK === "mainnet-beta") {
      return process.env.NEXT_PUBLIC_RPC_URL ?? clusterApiUrl("mainnet-beta");
    }
    return process.env.NEXT_PUBLIC_RPC_URL ?? clusterApiUrl("devnet");
  }, []);

  const wallets = useMemo(
    () => [new PhantomWalletAdapter(), new SolflareWalletAdapter()],
    []
  );

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
