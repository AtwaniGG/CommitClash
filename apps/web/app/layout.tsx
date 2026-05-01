import type { Metadata, Viewport } from "next";
import { Press_Start_2P, VT323, Silkscreen } from "next/font/google";
import { WalletShell } from "@/components/wallet/WalletShell";
import { AblyPresenceProvider } from "@/components/AblyPresence";
import { WalletRecovery } from "@/components/WalletRecovery";
import { Header } from "@/components/Header";
import { Marquee } from "@/components/Marquee";
import "./globals.css";

const display = Press_Start_2P({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-display",
  display: "swap",
});

const body = VT323({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-body",
  display: "swap",
});

const mono = Silkscreen({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "COMMITCLASH",
  description:
    "Rock. Paper. Scissors. On Solana. 85/7.5/7.5. Real burns, real streaks. Commit. Clash.",
};

export const viewport: Viewport = {
  themeColor: "#0a0e1a",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body className="font-body antialiased animate-flicker">
        <WalletShell>
          <AblyPresenceProvider>
            <WalletRecovery />
            <div className="relative z-10 flex min-h-screen flex-col">
              <Header />
              <Marquee />
              <main className="flex-1">{children}</main>
              <footer className="border-t border-edge bg-bg-deep/80 px-6 py-4 text-pixel-xs text-ink-mute">
                <div className="mx-auto flex max-w-7xl items-center justify-between">
                  <span>COMMITCLASH.SOL // v0.1.0</span>
                  <span className="glow-cyan">{"//"} BUILT ON SOLANA</span>
                </div>
              </footer>
            </div>
          </AblyPresenceProvider>
        </WalletShell>
      </body>
    </html>
  );
}
