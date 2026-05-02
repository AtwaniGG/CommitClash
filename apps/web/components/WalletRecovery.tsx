"use client";

import { useCallback, useEffect, useState } from "react";
import {
  useAnchorWallet,
  useConnection,
  useWallet,
} from "@solana/wallet-adapter-react";
import { motion, AnimatePresence } from "framer-motion";
import {
  cancelOwnQueueEntry,
  cancelOwnSolQueueEntry,
  findOwnQueueEntry,
  findOwnSolQueueEntry,
  getRevealTimeoutSlots,
} from "@/lib/program";

const SLOT_MS = 400;

type Currency = "rps" | "sol";

interface PendingState {
  poolId: number;
  index: bigint;
  slotJoined: bigint;
  ageSlots: bigint;
  timeoutSlots: bigint;
  currency: Currency;
}

/**
 * Mounts globally. When the wallet connects, scans the program for a
 * QueueEntry owned by this wallet. If one exists:
 *   - past the on-chain timeout → auto-cancels and refunds the stake
 *   - still within the timeout → shows a banner with a countdown and a
 *     button to cancel as soon as the timeout elapses.
 *
 * Returns null when there's nothing to recover (most of the time).
 */
export function WalletRecovery() {
  const { connected, publicKey } = useWallet();
  const anchorWallet = useAnchorWallet();
  const { connection } = useConnection();

  const [pending, setPending] = useState<PendingState | null>(null);
  const [recoveredAmount, setRecoveredAmount] = useState<number | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tickSlot, setTickSlot] = useState<bigint | null>(null);

  // Load pending state on connect
  useEffect(() => {
    if (!connected || !publicKey || !anchorWallet) {
      setPending(null);
      return;
    }

    let cancelled = false;

    async function check() {
      try {
        if (!publicKey || !anchorWallet) return;
        // Scan both currencies — user may have a stranded entry in either.
        let own = await findOwnQueueEntry(connection, publicKey);
        let cur: Currency = "rps";
        if (!own) {
          const solOwn = await findOwnSolQueueEntry(connection, publicKey);
          if (solOwn) {
            own = solOwn;
            cur = "sol";
          }
        }
        if (cancelled || !own) return;

        const timeoutSlots = await getRevealTimeoutSlots(connection);
        const currentSlot = BigInt(await connection.getSlot());
        const ageSlots = currentSlot - own.slotJoined;
        setTickSlot(currentSlot);

        if (ageSlots > timeoutSlots) {
          if (cancelled) return;
          setWorking(true);
          try {
            const cancelFn = cur === "sol" ? cancelOwnSolQueueEntry : cancelOwnQueueEntry;
            await cancelFn({
              connection,
              wallet: anchorWallet,
              poolId: own.poolId,
            });
            setRecoveredAmount(30_000);
          } catch (err: any) {
            console.warn("Auto-cancel failed:", err);
            setError(err?.message ?? String(err));
          } finally {
            setWorking(false);
          }
          return;
        }

        if (!cancelled) {
          setPending({
            poolId: own.poolId,
            index: own.index,
            slotJoined: own.slotJoined,
            ageSlots,
            timeoutSlots,
            currency: cur,
          });
        }
      } catch (err) {
        console.warn("WalletRecovery check failed:", err);
      }
    }

    check();
    return () => {
      cancelled = true;
    };
  }, [connected, publicKey, anchorWallet, connection]);

  // Tick slot every 2s while a pending entry exists, so the countdown stays accurate.
  useEffect(() => {
    if (!pending) return;
    const interval = setInterval(async () => {
      try {
        setTickSlot(BigInt(await connection.getSlot()));
      } catch {
        /* ignore */
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [pending, connection]);

  const cancelNow = useCallback(async () => {
    if (!pending || !anchorWallet) return;
    setWorking(true);
    setError(null);
    try {
      const cancelFn =
        pending.currency === "sol" ? cancelOwnSolQueueEntry : cancelOwnQueueEntry;
      await cancelFn({
        connection,
        wallet: anchorWallet,
        poolId: pending.poolId,
      });
      setRecoveredAmount(30_000);
      setPending(null);
    } catch (err: any) {
      setError(err?.message ?? String(err));
    } finally {
      setWorking(false);
    }
  }, [pending, anchorWallet, connection]);

  // Compute "seconds until cancel allowed" using the most-recent tickSlot
  const remainingSec =
    pending && tickSlot !== null
      ? Math.max(
          0,
          Number(
            pending.timeoutSlots - (tickSlot - pending.slotJoined)
          ) * (SLOT_MS / 1000)
        )
      : 0;
  const cancelable = pending && remainingSec <= 0;

  return (
    <AnimatePresence>
      {recoveredAmount !== null && (
        <motion.div
          key="recovered"
          initial={{ y: -50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -50, opacity: 0 }}
          transition={{ duration: 0.4 }}
          className="fixed top-20 left-1/2 -translate-x-1/2 z-[120] pointer-events-auto"
        >
          <div
            className="px-5 py-3 bg-bg-base border border-ok shadow-glow-ok flex items-center gap-3"
            style={{
              clipPath:
                "polygon(0 4px, 4px 4px, 4px 0, calc(100% - 4px) 0, calc(100% - 4px) 4px, 100% 4px, 100% calc(100% - 4px), calc(100% - 4px) calc(100% - 4px), calc(100% - 4px) 100%, 4px 100%, 4px calc(100% - 4px), 0 calc(100% - 4px))",
            }}
          >
            <span className="text-pixel-md glow-ok">▶ STAKE RECOVERED</span>
            <span className="text-pixel-xs text-ink-mute">
              {recoveredAmount.toLocaleString()} $RPS refunded
            </span>
            <button
              onClick={() => setRecoveredAmount(null)}
              className="text-pixel-xs text-ink-dim hover:text-ink ml-2"
            >
              ✕
            </button>
          </div>
        </motion.div>
      )}

      {pending && !recoveredAmount && (
        <motion.div
          key="pending"
          initial={{ y: -50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -50, opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="fixed top-20 left-1/2 -translate-x-1/2 z-[110] pointer-events-auto max-w-xl w-[92%]"
        >
          <div
            className="px-5 py-3 bg-bg-base border border-acid shadow-glow-acid"
            style={{
              clipPath:
                "polygon(0 4px, 4px 4px, 4px 0, calc(100% - 4px) 0, calc(100% - 4px) 4px, 100% 4px, 100% calc(100% - 4px), calc(100% - 4px) calc(100% - 4px), calc(100% - 4px) 100%, 4px 100%, 4px calc(100% - 4px), 0 calc(100% - 4px))",
            }}
          >
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="text-pixel-sm glow-acid">▶ PENDING STAKE DETECTED</div>
                <div className="text-pixel-xs text-ink-mute mt-1 truncate">
                  {cancelable
                    ? "Past timeout — click to refund 30,000 $RPS to your wallet."
                    : `Cancel available in ${Math.ceil(remainingSec)}s. Or wait for an opponent to match.`}
                </div>
                {error && (
                  <div className="text-pixel-xs text-burn mt-1">⚠ {error}</div>
                )}
              </div>
              <button
                onClick={cancelNow}
                disabled={!cancelable || working}
                className="pixel-btn pixel-btn--acid shrink-0"
              >
                {working ? "..." : cancelable ? "▶ REFUND" : `${Math.ceil(remainingSec)}s`}
              </button>
              <button
                onClick={() => setPending(null)}
                className="text-pixel-xs text-ink-dim hover:text-ink"
              >
                ✕
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
