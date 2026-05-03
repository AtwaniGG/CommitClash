"use client";

import dynamic from "next/dynamic";

// WalletMultiButton hardcodes "Select Wallet" via its own LABELS constant and
// overrides anything you pass via `labels`. To rename the button text we must
// render BaseWalletMultiButton directly — it forwards the labels prop properly.
const WALLET_LABELS = {
  "change-wallet": "Change wallet",
  connecting: "Connecting…",
  "copy-address": "Copy address",
  copied: "Copied!",
  disconnect: "Disconnect",
  "has-wallet": "Connect",
  "no-wallet": "Connect Wallet",
} as const;

export const WalletButton = dynamic(
  async () => {
    const { BaseWalletMultiButton } = await import("@solana/wallet-adapter-react-ui");
    type BaseProps = React.ComponentProps<typeof BaseWalletMultiButton>;
    const Wrapped = (props: Omit<BaseProps, "labels">) => (
      <BaseWalletMultiButton {...props} labels={WALLET_LABELS} />
    );
    Wrapped.displayName = "WalletButton";
    return Wrapped;
  },
  {
    ssr: false,
    loading: () => (
      <button
        className="wallet-adapter-button wallet-adapter-button-trigger"
        disabled
        suppressHydrationWarning
      >
        Connect Wallet
      </button>
    ),
  }
);
