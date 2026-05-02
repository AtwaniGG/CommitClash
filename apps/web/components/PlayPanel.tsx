"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  useAnchorWallet,
  useConnection,
  useWallet,
} from "@solana/wallet-adapter-react";
import { motion, AnimatePresence } from "framer-motion";
import { Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { MoveButton } from "./MoveButton";
import { MoveSprite, type Move } from "./sprites/MoveSprite";
import { PixelFrame } from "./ui/PixelFrame";
import { ResultDisplay } from "./ResultDisplay";
import { StreakAnimation } from "./StreakAnimation";
import { MatchFoundBanner } from "./MatchFoundBanner";
import { ClashSequence } from "./ClashSequence";
import { computeCommitment, MOVE_VALUE, generateNonce } from "@/lib/commit";
import {
  generateSessionKey,
  exportSessionSecret,
  importSessionSecret,
} from "@/lib/sessionKey";
import {
  savePendingPlay,
  bytesToHex,
  hexToBytes,
  clearPendingPlay,
  loadPendingPlaysForWallet,
} from "@/lib/storage";
import { fmtCompact } from "@/lib/format";
import { refreshMetrics } from "@/lib/hooks";
import {
  joinPool,
  pollForMatch,
  revealMove,
  fetchPlayerStats,
  getCurrentNextMatchId,
  pollMatchUntilResolved,
  getQueueHead,
  findOwnQueueEntry,
  joinSolPool,
  pollForSolMatch,
  revealSolMove,
  fetchSolPlayerStats,
  getCurrentNextSolMatchId,
  pollSolMatchUntilResolved,
  findOwnSolQueueEntry,
} from "@/lib/program";
import { matchPda, solMatchPda } from "@/lib/anchor";
import { getProgram } from "@/lib/anchor";

type Currency = "rps" | "sol";

type Phase =
  | "idle"
  | "picked"
  | "signing"
  | "queued"
  | "matched"
  | "revealing"
  | "resolved";

const ALL_MOVES: Move[] = ["rock", "paper", "scissors"];

function deriveOutcome(my: Move, theirs: Move): "win" | "loss" | "tie" {
  if (my === theirs) return "tie";
  if (
    (my === "rock" && theirs === "scissors") ||
    (my === "paper" && theirs === "rock") ||
    (my === "scissors" && theirs === "paper")
  )
    return "win";
  return "loss";
}

export function PlayPanel({
  poolId,
  poolName,
  entryAmount,
  usdEstimate,
  programDeployed,
  solEntryLamports,
  solUsdEstimate,
  solPoolAvailable,
}: {
  poolId: number;
  poolName: string;
  entryAmount: number;
  usdEstimate: string;
  programDeployed: boolean;
  /** Lamports per entry for the SOL pool at this same poolId (null if no SOL pool exists). */
  solEntryLamports?: bigint | null;
  /** USD estimate for the SOL entry (e.g. "$2.10"). */
  solUsdEstimate?: string;
  /** True iff a parallel SOL pool is initialized on chain for this pool ID. */
  solPoolAvailable?: boolean;
}) {
  const { publicKey, connected } = useWallet();
  const anchorWallet = useAnchorWallet();
  const { connection } = useConnection();
  const [phase, setPhase] = useState<Phase>("idle");
  const [selected, setSelected] = useState<Move | null>(null);
  const [opponentMove, setOpponentMove] = useState<Move | null>(null);
  const [streak, setStreak] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [matchedJustNow, setMatchedJustNow] = useState(false);
  const [clashDone, setClashDone] = useState(false);
  const [currency, setCurrency] = useState<Currency>("rps");

  // Pretty-print the entry amount for either currency. Lamports are a 9-decimal
  // unit — show up to 3 decimals (0.015 SOL stays readable).
  const solEntrySol =
    solEntryLamports != null ? Number(solEntryLamports) / LAMPORTS_PER_SOL : 0;
  const activeEntryLabel =
    currency === "rps"
      ? `${entryAmount.toLocaleString()} $RPS`
      : `${solEntrySol.toFixed(3)} SOL`;
  const activePotLabel =
    currency === "rps"
      ? `${(entryAmount * 2).toLocaleString()} $RPS`
      : `${(solEntrySol * 2).toFixed(3)} SOL`;
  const activeMaxWinLabel =
    currency === "rps"
      ? `${fmtCompact(entryAmount * 1.7)} $RPS`
      : `${(solEntrySol * 1.7).toFixed(3)} SOL`;
  const activeUsd = currency === "rps" ? usdEstimate : solUsdEstimate ?? "";
  // Synchronous re-entry lock so a double-click can't submit twice.
  // (React state updates are async — useRef gives us a sync guard.)
  const submittingRef = useRef(false);

  // Pull live streak whenever wallet connects
  useEffect(() => {
    if (!publicKey) return;
    fetchPlayerStats(connection, publicKey).then((s) => {
      if (s) setStreak(s.currentStreak);
    });
  }, [publicKey, connection]);

  const submit = useCallback(async () => {
    if (!publicKey || !anchorWallet || !selected) return;
    // Block re-entry: if we're already in flight, ignore the click.
    if (submittingRef.current) return;
    submittingRef.current = true;
    setErrorMsg(null);

    // Pre-flight checks (skip in demo/sim modes)
    if (programDeployed) {
      try {
        // 1. Do I already have a pending queue entry in EITHER currency?
        const findOwn =
          currency === "sol" ? findOwnSolQueueEntry : findOwnQueueEntry;
        const own = await findOwn(connection, publicKey);
        if (own) {
          submittingRef.current = false;
          setErrorMsg(
            "You already have a pending commit on chain. Wait for an opponent, or call cancel after the timeout."
          );
          return;
        }

        // 2. Is the head entry stale? Same logic for either currency, but
        //    only the RPS getQueueHead helper exists today — non-blocking.
        if (currency === "rps") {
          const head = await getQueueHead(connection, poolId);
          if (head?.exists && head.ageSlots && head.ageSlots > 150n) {
            console.warn(
              `[commit] head entry is ${head.ageSlots} slots old (~${
                Number(head.ageSlots) * 0.4
              }s) — opponent may not reveal`
            );
          }
        }
      } catch (preflightErr) {
        console.warn("Pre-flight check failed (non-fatal):", preflightErr);
      }
    }

    const moveByte = MOVE_VALUE[selected];
    const nonce = generateNonce();
    const session = generateSessionKey();
    const commitment = computeCommitment(moveByte, nonce, publicKey);

    savePendingPlay({
      walletPubkey: publicKey.toBase58(),
      poolId,
      move: selected,
      nonceHex: bytesToHex(nonce),
      commitmentHex: bytesToHex(commitment),
      sessionSecretB64: exportSessionSecret(session),
      createdAt: Date.now(),
    });

    setPhase("signing");

    if (!programDeployed) {
      await sleep(900);
      setPhase("queued");
      await sleep(2000);
      setPhase("matched");
      const theirs = ALL_MOVES[Math.floor(Math.random() * 3)];
      setOpponentMove(theirs);
      await sleep(800);
      setPhase("revealing");
      await sleep(1100);
      setPhase("resolved");
      const result = deriveOutcome(selected, theirs);
      setStreak((s) => (result === "win" ? s + 1 : result === "loss" ? 0 : s));
      clearPendingPlay(publicKey.toBase58(), bytesToHex(commitment));
      submittingRef.current = false;
      return;
    }

    try {
      const isSol = currency === "sol";
      // 1. Submit join tx (single wallet popup) — branch by currency
      const { tx: joinTx, matchId } = isSol
        ? await joinSolPool({
            connection,
            wallet: anchorWallet,
            poolId,
            commitment,
            sessionPubkey: session.publicKey,
          })
        : await joinPool({
            connection,
            wallet: anchorWallet,
            poolId,
            commitment,
            sessionPubkey: session.publicKey,
          });
      console.log("Join tx:", joinTx, "matchId:", matchId?.toString());

      let matchInfo: {
        matchId: bigint;
        playerA: PublicKey;
        playerB: PublicKey;
        imSideA: boolean;
      } | null = null;

      if (matchId !== null) {
        setPhase("matched");
        const program = getProgram(connection);
        const matchAccount = isSol
          ? (program.account as any).solMatch
          : (program.account as any).match;
        const matchAddr = isSol
          ? solMatchPda(poolId, Number(matchId))[0]
          : matchPda(poolId, Number(matchId))[0];
        const acc = await matchAccount.fetch(matchAddr);
        matchInfo = {
          matchId,
          playerA: new PublicKey(acc.playerA),
          playerB: new PublicKey(acc.playerB),
          imSideA: false,
        };
      } else {
        setPhase("queued");
        refreshMetrics();
        const startMatchId = isSol
          ? await getCurrentNextSolMatchId(connection, poolId)
          : await getCurrentNextMatchId(connection, poolId);
        const pollFn = isSol ? pollForSolMatch : pollForMatch;
        matchInfo = await pollFn({
          connection,
          poolId,
          player: publicKey,
          startMatchId,
          timeoutMs: 600_000,
          intervalMs: 1200,
        });
        if (!matchInfo) throw new Error("Match poll timed out — try again");
        setPhase("matched");
      }

      // 3. Auto-reveal via session key (no wallet popup)
      setPhase("revealing");
      const revealFn = isSol ? revealSolMove : revealMove;
      await revealFn({
        connection,
        sessionKp: session,
        poolId,
        matchId: matchInfo.matchId,
        move: moveByte,
        nonce,
        playerA: matchInfo.playerA,
        playerB: matchInfo.playerB,
      });

      // 4. Poll match for both reveals → resolved state
      const pollResolveFn = isSol ? pollSolMatchUntilResolved : pollMatchUntilResolved;
      const otherMoveByte = await pollResolveFn(
        connection,
        poolId,
        matchInfo.matchId,
        matchInfo.imSideA
      );
      if (otherMoveByte === null) throw new Error("Opponent timeout");
      const otherMoveName: Move =
        otherMoveByte === 1 ? "rock" : otherMoveByte === 2 ? "paper" : "scissors";
      setOpponentMove(otherMoveName);
      setPhase("resolved");
      refreshMetrics();

      // Refresh streak — read whichever currency we just played
      const statsFn = isSol ? fetchSolPlayerStats : fetchPlayerStats;
      const stats = await statsFn(connection, publicKey);
      if (stats) setStreak(stats.currentStreak);
      clearPendingPlay(publicKey.toBase58(), bytesToHex(commitment));
    } catch (err: any) {
      console.error(err);
      const msg = err?.message ?? String(err);
      // "Already processed" means our tx hit chain twice — usually because of
      // a network retry. Don't surface it as a hard error, the first attempt succeeded.
      if (msg.toLowerCase().includes("already been processed")) {
        console.warn("Duplicate tx submission — first one likely succeeded");
      } else {
        setErrorMsg(msg);
      }
      setPhase("idle");
    } finally {
      submittingRef.current = false;
    }
  }, [publicKey, anchorWallet, selected, poolId, programDeployed, connection, currency]);

  function reset() {
    setPhase("idle");
    setSelected(null);
    setOpponentMove(null);
    setMatchedJustNow(false);
    setClashDone(false);
  }

  // Trigger MatchFoundBanner once when the user first transitions into "matched"
  useEffect(() => {
    if (phase === "matched") setMatchedJustNow(true);
  }, [phase]);

  // ── Resume-on-refresh ──
  // If the user already has an on-chain queue entry AND localStorage has the
  // matching commit data (move + nonce + session key), restore the queued
  // state and re-enter the polling/reveal flow exactly where it left off.
  useEffect(() => {
    if (!publicKey || !anchorWallet || !programDeployed) return;
    if (phase !== "idle") return;
    const me = publicKey; // capture non-null for inner async closure
    const wallet = anchorWallet;
    let cancelled = false;

    async function resume() {
      try {
        // Check both currencies — user could have a stranded entry in either.
        let own = await findOwnQueueEntry(connection, me);
        let resumedCurrency: Currency = "rps";
        if (!own || own.poolId !== poolId) {
          const solOwn = await findOwnSolQueueEntry(connection, me);
          if (solOwn && solOwn.poolId === poolId) {
            own = solOwn;
            resumedCurrency = "sol";
          } else {
            return;
          }
        }
        if (cancelled || !own || own.poolId !== poolId) return;
        // Lock the toggle to the currency we found a stranded entry in so the
        // resume flow uses the matching code path.
        setCurrency(resumedCurrency);
        const isSol = resumedCurrency === "sol";

        const ownCommitHex = bytesToHex(own.commitment);
        const pending = loadPendingPlaysForWallet(me.toBase58());
        const matching = pending.find((p) => p.commitmentHex === ownCommitHex);
        if (!matching) {
          // Have an on-chain entry but no localStorage match — can't reveal.
          // The WalletRecovery banner will show the cancel timer; nothing to do here.
          return;
        }

        // We can resume! Restore state.
        const session = importSessionSecret(matching.sessionSecretB64);
        const nonce = hexToBytes(matching.nonceHex);
        const moveByte = MOVE_VALUE[matching.move];
        if (cancelled) return;

        setSelected(matching.move);
        setPhase("queued");
        submittingRef.current = true; // lock so user can't double-submit while we resume

        // Wait for an opponent to match us — branch by detected currency
        const startMatchId = isSol
          ? await getCurrentNextSolMatchId(connection, poolId)
          : await getCurrentNextMatchId(connection, poolId);
        const pollFn = isSol ? pollForSolMatch : pollForMatch;
        const matchInfo = await pollFn({
          connection,
          poolId,
          player: me,
          startMatchId,
          timeoutMs: 600_000,
          intervalMs: 1200,
        });
        if (cancelled) return;
        if (!matchInfo) {
          submittingRef.current = false;
          setErrorMsg("Match poll timed out — try cancelling the queue entry.");
          setPhase("idle");
          return;
        }
        setPhase("matched");
        await sleep(50);

        setPhase("revealing");
        const revealFn = isSol ? revealSolMove : revealMove;
        await revealFn({
          connection,
          sessionKp: session,
          poolId,
          matchId: matchInfo.matchId,
          move: moveByte,
          nonce,
          playerA: matchInfo.playerA,
          playerB: matchInfo.playerB,
        });

        const pollResolveFn = isSol ? pollSolMatchUntilResolved : pollMatchUntilResolved;
        const otherMoveByte = await pollResolveFn(
          connection,
          poolId,
          matchInfo.matchId,
          matchInfo.imSideA
        );
        if (cancelled) return;
        if (otherMoveByte === null) throw new Error("Opponent timeout");
        const otherMoveName: Move =
          otherMoveByte === 1 ? "rock" : otherMoveByte === 2 ? "paper" : "scissors";
        setOpponentMove(otherMoveName);
        setPhase("resolved");

        const statsFn = isSol ? fetchSolPlayerStats : fetchPlayerStats;
        const stats = await statsFn(connection, me);
        if (stats && !cancelled) setStreak(stats.currentStreak);
        clearPendingPlay(me.toBase58(), ownCommitHex);
      } catch (err: any) {
        if (cancelled) return;
        console.warn("[PlayPanel] resume failed:", err);
        setErrorMsg(err?.message ?? String(err));
      } finally {
        if (!cancelled) submittingRef.current = false;
      }
    }

    resume();
    return () => {
      cancelled = true;
    };
  }, [publicKey, anchorWallet, connection, poolId, programDeployed, phase]);

  // Reset clash-done when starting a new round (back to idle)
  useEffect(() => {
    if (phase === "idle") setClashDone(false);
  }, [phase]);

  if (!connected || !publicKey) {
    return (
      <PixelFrame title={`${poolName} // ENTRY`} tone="magenta">
        <div className="flex flex-col items-center gap-4 py-8">
          <div className="text-pixel-md text-ink-dim">CONNECT WALLET TO PLAY</div>
          <div className="font-body text-lg text-ink-mute max-w-md text-center">
            Pick rock, paper, or scissors. One signature. Tokens lock in escrow.
            Auto-reveal when matched.
          </div>
        </div>
      </PixelFrame>
    );
  }

  return (
    <>
      <StreakAnimation streak={streak} />
      <MatchFoundBanner active={matchedJustNow && phase === "matched"} />
      <PixelFrame
        title={`${poolName} // ENTRY: ${activeEntryLabel}${activeUsd ? ` (${activeUsd})` : ""}`}
        tone="magenta"
        status={
          <span className="flex items-center gap-2">
            <span className="status-dot" />
            <span>{phaseLabel(phase)}</span>
          </span>
        }
      >
        <AnimatePresence mode="wait">
          {(phase === "idle" || phase === "picked") && (
            <motion.div
              key="pick"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-6"
            >
              <div className="text-pixel-sm text-ink-dim">
                {">"} SELECT_MOVE.exe
              </div>

              {/* Currency toggle — only render when SOL pool exists for this id */}
              {solPoolAvailable && solEntryLamports != null && (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setCurrency("rps")}
                    className={`pixel-btn text-pixel-xs py-2 ${
                      currency === "rps"
                        ? "pixel-btn--magenta"
                        : "border border-edge text-ink-mute hover:text-ink"
                    }`}
                  >
                    PLAY WITH $RPS
                  </button>
                  <button
                    onClick={() => setCurrency("sol")}
                    className={`pixel-btn text-pixel-xs py-2 ${
                      currency === "sol"
                        ? "pixel-btn--cyan"
                        : "border border-edge text-ink-mute hover:text-ink"
                    }`}
                  >
                    PLAY WITH SOL
                  </button>
                </div>
              )}

              <div className="grid grid-cols-3 gap-3">
                {ALL_MOVES.map((m) => (
                  <MoveButton
                    key={m}
                    move={m}
                    selected={selected === m}
                    onClick={() => {
                      setSelected(m);
                      setPhase("picked");
                    }}
                  />
                ))}
              </div>
              <div className="border-t border-edge pt-4 grid grid-cols-3 gap-3 text-pixel-xs">
                <Stat label="ENTRY" value={activeEntryLabel} />
                <Stat label="POT" value={activePotLabel} glow="acid" />
                <Stat label="MAX WIN" value={activeMaxWinLabel} glow="ok" />
              </div>
              <button
                disabled={!selected}
                onClick={submit}
                className="pixel-btn pixel-btn--magenta w-full text-pixel-md py-4"
              >
                {selected
                  ? `▶ COMMIT ${selected.toUpperCase()}`
                  : "PICK A MOVE"}
              </button>
              {!programDeployed && (
                <div className="text-pixel-xs text-acid border border-acid px-3 py-2">
                  ⚠ DEMO MODE — flow is simulated, no on-chain calls until program is deployed.
                </div>
              )}
              {errorMsg && (
                <div className="text-pixel-xs text-burn border border-burn px-3 py-2">
                  ⚠ {errorMsg}
                </div>
              )}
            </motion.div>
          )}

          {(phase === "signing" ||
            phase === "queued" ||
            phase === "matched" ||
            phase === "revealing") && (
            <motion.div
              key="waiting"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-6 py-6"
            >
              <Spinner phase={phase} />
              <div className="grid grid-cols-3 items-center gap-6">
                <div className="flex flex-col items-center gap-2">
                  <div className="text-pixel-xs text-ink-mute">YOU</div>
                  {selected && <MoveSprite move={selected} size={88} glow />}
                  <div className="text-pixel-sm">{selected?.toUpperCase()}</div>
                </div>
                <div className="text-center">
                  <div className="text-pixel-md text-ink-dim animate-pulse">VS</div>
                </div>
                <div className="flex flex-col items-center gap-2">
                  <div className="text-pixel-xs text-ink-mute">OPPONENT</div>
                  <SealedSlot revealing={phase === "revealing"} move={opponentMove} />
                  <div className="text-pixel-sm text-ink-dim">
                    {phase === "queued"
                      ? "WAITING…"
                      : phase === "matched"
                      ? "FOUND"
                      : phase === "revealing"
                      ? "REVEALING…"
                      : "—"}
                  </div>
                </div>
              </div>
              <div className="text-pixel-xs text-ink-mute leading-relaxed border-t border-edge pt-4">
                {phase === "signing" && "▶ AWAITING WALLET SIGNATURE…"}
                {phase === "queued" &&
                  "▶ ENTERED FIFO QUEUE. NEXT PLAYER WILL TRIGGER MATCH."}
                {phase === "matched" &&
                  "▶ MATCH CREATED. SESSION KEY AUTO-REVEALING…"}
                {phase === "revealing" &&
                  "▶ KECCAK256 VERIFIED. RESOLVING ON-CHAIN…"}
              </div>
            </motion.div>
          )}

          {phase === "resolved" && selected && opponentMove && !clashDone && (
            <motion.div
              key="clash"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="py-2"
            >
              <ClashSequence
                myMove={selected}
                theirMove={opponentMove}
                outcome={deriveOutcome(selected, opponentMove)}
                onComplete={() => setClashDone(true)}
              />
            </motion.div>
          )}

          {phase === "resolved" && selected && opponentMove && clashDone && (
            <motion.div
              key="result"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4 }}
              className="space-y-6"
            >
              {(() => {
                // Display amounts in whichever currency was actually played.
                // RPS pool: entryAmount is already in $RPS units.
                // SOL pool: convert lamports → SOL (fractional units).
                const baseEntry =
                  currency === "sol" ? solEntrySol : entryAmount;
                const o = deriveOutcome(selected, opponentMove);
                const payout =
                  o === "win"
                    ? baseEntry * 1.7
                    : o === "tie"
                    ? baseEntry * 0.85
                    : 0;
                return (
                  <ResultDisplay
                    myMove={selected}
                    theirMove={opponentMove}
                    outcome={o}
                    payout={payout}
                    burned={baseEntry * 0.15}
                    toTreasury={baseEntry * 0.15}
                    currency={currency}
                  />
                );
              })()}
              <button
                onClick={reset}
                className="pixel-btn pixel-btn--magenta w-full text-pixel-md py-4"
              >
                ▶ PLAY AGAIN
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </PixelFrame>
    </>
  );
}

function phaseLabel(p: Phase): string {
  switch (p) {
    case "idle":
    case "picked":
      return "READY";
    case "signing":
      return "SIGNING";
    case "queued":
      return "QUEUED";
    case "matched":
      return "MATCHED";
    case "revealing":
      return "REVEALING";
    case "resolved":
      return "RESOLVED";
  }
}

function Stat({
  label,
  value,
  glow,
}: {
  label: string;
  value: string;
  glow?: "acid" | "ok";
}) {
  const cls = glow === "acid" ? "glow-acid" : glow === "ok" ? "glow-ok" : "";
  return (
    <div>
      <div className="text-ink-mute">{label}</div>
      <div className={`text-pixel-sm mt-1 ${cls}`}>{value}</div>
    </div>
  );
}

function Spinner({ phase }: { phase: Phase }) {
  return (
    <div className="flex justify-center">
      <motion.div
        className="grid grid-cols-3 gap-1"
        animate={{ rotate: 360 }}
        transition={{ repeat: Infinity, duration: 1.6, ease: "linear" }}
      >
        {Array.from({ length: 9 }).map((_, i) => (
          <motion.div
            key={i}
            className="h-3 w-3"
            style={{
              background:
                i % 3 === 0 ? "#ff2bd6" : i % 3 === 1 ? "#00f5d4" : "#fffb00",
            }}
            animate={{ opacity: [0.3, 1, 0.3] }}
            transition={{
              repeat: Infinity,
              duration: 1.2,
              delay: i * 0.05,
            }}
          />
        ))}
      </motion.div>
    </div>
  );
}

function SealedSlot({
  revealing,
  move,
}: {
  revealing: boolean;
  move: Move | null;
}) {
  if (revealing && move) {
    return (
      <motion.div
        initial={{ rotateY: 90 }}
        animate={{ rotateY: 0 }}
        transition={{ duration: 0.5 }}
      >
        <MoveSprite move={move} size={88} glow />
      </motion.div>
    );
  }
  return (
    <div className="h-[88px] w-[88px] flex items-center justify-center border-2 border-edge bg-bg-base">
      <span className="text-pixel-lg text-ink-mute animate-blink">??</span>
    </div>
  );
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
