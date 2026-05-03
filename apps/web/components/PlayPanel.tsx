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
import { playSfx, startLoop, stopSfx } from "@/lib/sfx";
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
import { matchPda, solMatchPda, RPS_MINT } from "@/lib/anchor";
import { getProgram } from "@/lib/anchor";
import { getAssociatedTokenAddressSync, getAccount } from "@solana/spl-token";
import { usePriceSnapshot } from "@/components/SolEquivalent";
import { rpsToSol } from "@/lib/price";
import { refreshHistory } from "@/components/PlayerHistory";

type Currency = "rps" | "sol";

/** Race a promise against a timeout — rejects with a recognizable error
 *  message so the caller can decide whether to retry. */
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    ),
  ]);
}

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
  // Persist currency choice across page loads so a player who's been using
  // SOL doesn't get bounced back to RPS after a refresh and accidentally try
  // to commit $RPS they don't have.
  const [currency, _setCurrency] = useState<Currency>(() => {
    if (typeof window === "undefined") return "rps";
    const saved = window.localStorage.getItem("commitclash:currency");
    return saved === "sol" ? "sol" : "rps";
  });
  const setCurrency = useCallback((c: Currency) => {
    _setCurrency(c);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("commitclash:currency", c);
    }
  }, []);

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
  // Live $RPS→SOL price for the title bar's parenthetical estimate. SOL
  // pools don't need it (entry is already in SOL units).
  const priceSnap = usePriceSnapshot();
  const activeSolHint = (() => {
    if (currency !== "rps") return "";
    if (!priceSnap) return "";
    const sol = rpsToSol(entryAmount, priceSnap);
    return `≈ ${sol >= 1 ? sol.toFixed(2) : sol.toFixed(3)} SOL`;
  })();
  // Synchronous re-entry lock so a double-click can't submit twice.
  // (React state updates are async — useRef gives us a sync guard.)
  const submittingRef = useRef(false);
  // Stash the in-flight match info so a manual "RETRY REVEAL" button can
  // re-fire the reveal tx without restarting the whole join flow.
  const inflightRef = useRef<{
    session: Keypair;
    moveByte: number;
    nonce: Uint8Array;
    matchInfo: {
      matchId: bigint;
      playerA: PublicKey;
      playerB: PublicKey;
      imSideA: boolean;
    };
    isSol: boolean;
    commitmentHex: string;
  } | null>(null);
  const [showManualReveal, setShowManualReveal] = useState(false);

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
        // 1. Do I have enough balance? Catch this BEFORE the wallet popup so
        //    the user gets a clear "go get more $RPS" message instead of a
        //    raw simulation-failed error from the SPL token program.
        if (currency === "rps") {
          const ata = getAssociatedTokenAddressSync(RPS_MINT, publicKey);
          let rpsBalance = 0n;
          try {
            const acc = await getAccount(connection, ata);
            rpsBalance = acc.amount;
          } catch {
            // ATA doesn't exist yet → balance is 0
          }
          const need = BigInt(entryAmount) * 1_000_000n; // 6 decimals
          if (rpsBalance < need) {
            const have = Number(rpsBalance) / 1_000_000;
            submittingRef.current = false;
            setErrorMsg(
              `Not enough $RPS — you have ${have.toLocaleString()} but this pool needs ${entryAmount.toLocaleString()}. Get more $RPS, or switch to SOL.`
            );
            return;
          }
        } else {
          // SOL pool: check wallet has entry + ~0.005 SOL buffer for fees + session funding
          const need = Number(solEntryLamports ?? 0n) + 5_000_000;
          const balance = await connection.getBalance(publicKey);
          if (balance < need) {
            submittingRef.current = false;
            const haveSol = (balance / 1e9).toFixed(3);
            const needSol = (Number(solEntryLamports ?? 0n) / 1e9).toFixed(3);
            setErrorMsg(
              `Not enough SOL — you have ${haveSol} but this pool needs at least ${needSol} (plus a tiny fee buffer).`
            );
            return;
          }
        }

        // 2. Do I already have a pending queue entry in EITHER currency?
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

        // 3. Is the head entry stale? Same logic for either currency, but
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
      // Stash the in-flight info so a manual retry can re-fire just the reveal.
      inflightRef.current = {
        session,
        moveByte,
        nonce,
        matchInfo,
        isSol,
        commitmentHex: bytesToHex(commitment),
      };

      setPhase("revealing");
      setShowManualReveal(false);
      const revealFn = isSol ? revealSolMove : revealMove;

      // Wrap reveal with a 25s timeout + 1 silent retry. confirmTransaction
      // can hang indefinitely if the WebSocket subscription drops; the retry
      // path uses a fresh blockhash so it bypasses cached-state issues.
      const tryReveal = async () => {
        await withTimeout(
          revealFn({
            connection,
            sessionKp: session,
            poolId,
            matchId: matchInfo.matchId,
            move: moveByte,
            nonce,
            playerA: matchInfo.playerA,
            playerB: matchInfo.playerB,
          }),
          25_000,
          "reveal"
        );
      };
      try {
        await tryReveal();
      } catch (firstErr: any) {
        const m = (firstErr?.message ?? String(firstErr)).toLowerCase();
        if (m.includes("already been processed") || m.includes("alreadyrevealed")) {
          // First reveal actually landed — proceed to poll
          console.warn("First reveal landed despite hang; continuing to poll");
        } else {
          console.warn("First reveal failed, retrying once:", firstErr);
          await new Promise((r) => setTimeout(r, 800));
          try {
            await tryReveal();
          } catch (secondErr: any) {
            // Both attempts failed — surface manual recovery UI
            const m2 = (secondErr?.message ?? "").toLowerCase();
            if (!m2.includes("already been processed") && !m2.includes("alreadyrevealed")) {
              setShowManualReveal(true);
              throw new Error(
                "Reveal failed twice — tap MANUAL REVEAL to try again. Funds are safe; the match will time out in ~10 min if you walk away."
              );
            }
          }
        }
      }

      // 4. Poll match for both reveals → resolved state
      const pollResolveFn = isSol ? pollSolMatchUntilResolved : pollMatchUntilResolved;
      const otherMoveByte = await pollResolveFn(
        connection,
        poolId,
        matchInfo.matchId,
        matchInfo.imSideA,
        45_000, // shorter than the on-chain reveal timeout, gives user a clear UI signal
      );
      if (otherMoveByte === null) {
        // Our reveal landed but opponent hasn't yet. Keep the inflight ref so
        // user can hit RETRY (which just re-polls — our reveal is on chain).
        setShowManualReveal(true);
        throw new Error(
          "Opponent hasn't revealed yet. Tap RETRY to keep waiting, or walk away — the on-chain timeout will refund you in ~10 min."
        );
      }
      const otherMoveName: Move =
        otherMoveByte === 1 ? "rock" : otherMoveByte === 2 ? "paper" : "scissors";
      setOpponentMove(otherMoveName);
      setPhase("resolved");
      refreshMetrics();
      refreshHistory(); // immediately repopulate the My History list

      // Clear the inflight ref — match is settled
      inflightRef.current = null;
      setShowManualReveal(false);

      // Refresh streak — read whichever currency we just played
      const statsFn = isSol ? fetchSolPlayerStats : fetchPlayerStats;
      const stats = await statsFn(connection, publicKey);
      if (stats) setStreak(stats.currentStreak);
      clearPendingPlay(publicKey.toBase58(), bytesToHex(commitment));
    } catch (err: any) {
      console.error(err);
      const msg = err?.message ?? String(err);
      const lower = msg.toLowerCase();
      // "Already processed" means our tx hit chain twice — usually because of
      // a network retry. Don't surface it as a hard error.
      if (lower.includes("already been processed")) {
        console.warn("Duplicate tx submission — first one likely succeeded");
      } else if (lower.includes("insufficient funds") || lower.includes("0x1")) {
        // SPL token InsufficientFunds → 0x1 from the token program
        if (currency === "rps") {
          setErrorMsg(
            `Not enough $RPS — this pool needs ${entryAmount.toLocaleString()}. Get more $RPS, or switch to SOL.`
          );
        } else {
          const needSol = (Number(solEntryLamports ?? 0n) / 1e9).toFixed(3);
          setErrorMsg(`Not enough SOL — this pool needs at least ${needSol}.`);
        }
      } else if (lower.includes("user rejected") || lower.includes("rejected the request")) {
        setErrorMsg("You rejected the wallet popup.");
      } else if (lower.includes("blockhash not found") || lower.includes("blockheight")) {
        setErrorMsg("Network blockhash expired. Try again.");
      } else if (lower.includes("queueempty") || lower.includes("queuenotempty") || lower.includes("constraintseeds")) {
        setErrorMsg("Queue state shifted — try again.");
      } else {
        // Trim the dump — surface only the first sentence so the UI box
        // doesn't fill with raw program logs.
        const firstSentence = msg.split(".")[0].slice(0, 200);
        setErrorMsg(firstSentence);
      }
      setPhase("idle");
    } finally {
      submittingRef.current = false;
    }
  }, [publicKey, anchorWallet, selected, poolId, programDeployed, connection, currency, entryAmount, solEntryLamports]);

  /** Manual reveal escape hatch — re-fires the reveal tx using the same
   *  session key + nonce + commit, then resumes polling. Surfaced via a
   *  button when the auto-reveal hangs or when the opponent stalls. */
  const manualRetryReveal = useCallback(async () => {
    const inflight = inflightRef.current;
    if (!inflight || !publicKey) return;
    setShowManualReveal(false);
    setErrorMsg(null);
    setPhase("revealing");

    const { session, moveByte, nonce, matchInfo, isSol, commitmentHex } = inflight;
    const revealFn = isSol ? revealSolMove : revealMove;
    const pollResolveFn = isSol ? pollSolMatchUntilResolved : pollMatchUntilResolved;

    try {
      // Try one more reveal — silently absorb "already revealed" since that
      // means our prior attempt actually landed.
      try {
        await withTimeout(
          revealFn({
            connection,
            sessionKp: session,
            poolId,
            matchId: matchInfo.matchId,
            move: moveByte,
            nonce,
            playerA: matchInfo.playerA,
            playerB: matchInfo.playerB,
          }),
          25_000,
          "manual reveal"
        );
      } catch (err: any) {
        const m = (err?.message ?? String(err)).toLowerCase();
        if (!m.includes("already been processed") && !m.includes("alreadyrevealed")) {
          throw err;
        }
      }

      // Resume polling for opponent's reveal
      const otherMoveByte = await pollResolveFn(
        connection,
        poolId,
        matchInfo.matchId,
        matchInfo.imSideA,
        45_000
      );
      if (otherMoveByte === null) {
        setShowManualReveal(true);
        throw new Error(
          "Opponent still hasn't revealed. Tap RETRY again, or wait for the on-chain timeout (~10 min)."
        );
      }
      const otherMoveName: Move =
        otherMoveByte === 1 ? "rock" : otherMoveByte === 2 ? "paper" : "scissors";
      setOpponentMove(otherMoveName);
      setPhase("resolved");
      refreshMetrics();
      refreshHistory();
      inflightRef.current = null;

      const statsFn = isSol ? fetchSolPlayerStats : fetchPlayerStats;
      const stats = await statsFn(connection, publicKey);
      if (stats) setStreak(stats.currentStreak);
      clearPendingPlay(publicKey.toBase58(), commitmentHex);
    } catch (err: any) {
      console.error("Manual reveal failed:", err);
      setErrorMsg(err?.message ?? String(err));
    }
  }, [publicKey, connection, poolId]);

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

  // ── SFX driven by phase + outcome ────────────────────────────────────
  // - "revealing" phase loops the waiting/anticipation sound until it ends.
  // - "resolved" phase plays a one-shot win or loss sound based on outcome.
  // - Any other phase silences the waiting loop.
  useEffect(() => {
    if (phase === "revealing") {
      startLoop("waiting");
    } else {
      stopSfx("waiting");
    }
    if (phase === "resolved" && selected && opponentMove) {
      const outcome = deriveOutcome(selected, opponentMove);
      if (outcome === "win") playSfx("win");
      else if (outcome === "loss") playSfx("loss");
      // Tie: stay silent (no loss sting, but no celebration either)
    }
    return () => {
      // Defensive: if the component unmounts mid-reveal, kill the loop
      if (phase === "revealing") stopSfx("waiting");
    };
  }, [phase, selected, opponentMove]);

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
        refreshMetrics();
        refreshHistory();

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
        title={`${poolName} // ENTRY: ${activeEntryLabel}${activeSolHint ? ` (${activeSolHint})` : ""}`}
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

              {/* Manual reveal escape hatch — appears when the auto-reveal
                  flow times out twice or when opponent stalls. */}
              {showManualReveal && (
                <button
                  onClick={manualRetryReveal}
                  className="pixel-btn pixel-btn--magenta w-full text-pixel-md py-3 mt-2"
                >
                  ▶ MANUAL REVEAL
                </button>
              )}
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
