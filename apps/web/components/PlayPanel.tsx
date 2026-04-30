"use client";

import { useState, useEffect, useCallback } from "react";
import {
  useAnchorWallet,
  useConnection,
  useWallet,
} from "@solana/wallet-adapter-react";
import { motion, AnimatePresence } from "framer-motion";
import { Keypair, PublicKey } from "@solana/web3.js";
import { MoveButton } from "./MoveButton";
import { MoveSprite, type Move } from "./sprites/MoveSprite";
import { PixelFrame } from "./ui/PixelFrame";
import { ResultDisplay } from "./ResultDisplay";
import { StreakAnimation } from "./StreakAnimation";
import { computeCommitment, MOVE_VALUE, generateNonce } from "@/lib/commit";
import { generateSessionKey, exportSessionSecret } from "@/lib/sessionKey";
import { savePendingPlay, bytesToHex, clearPendingPlay } from "@/lib/storage";
import { fmtCompact } from "@/lib/format";
import {
  joinPool,
  pollForMatch,
  revealMove,
  fetchPlayerStats,
  getCurrentNextMatchId,
  pollMatchUntilResolved,
} from "@/lib/program";
import { matchPda } from "@/lib/anchor";
import { getProgram } from "@/lib/anchor";

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
}: {
  poolId: number;
  poolName: string;
  entryAmount: number;
  usdEstimate: string;
  programDeployed: boolean;
}) {
  const { publicKey, connected } = useWallet();
  const anchorWallet = useAnchorWallet();
  const { connection } = useConnection();
  const [phase, setPhase] = useState<Phase>("idle");
  const [selected, setSelected] = useState<Move | null>(null);
  const [opponentMove, setOpponentMove] = useState<Move | null>(null);
  const [streak, setStreak] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Pull live streak whenever wallet connects
  useEffect(() => {
    if (!publicKey) return;
    fetchPlayerStats(connection, publicKey).then((s) => {
      if (s) setStreak(s.currentStreak);
    });
  }, [publicKey, connection]);

  const submit = useCallback(async () => {
    if (!publicKey || !anchorWallet || !selected) return;
    setErrorMsg(null);

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
      return;
    }

    try {
      // 1. Submit join tx (single wallet popup)
      const { tx: joinTx, matchId } = await joinPool({
        connection,
        wallet: anchorWallet,
        poolId,
        commitment,
        sessionPubkey: session.publicKey,
      });
      console.log("Join tx:", joinTx, "matchId:", matchId?.toString());

      // 2. If we matched immediately (we joined into a non-empty queue),
      //    we are PlayerB with a known matchId. Otherwise we're queued.
      let matchInfo: {
        matchId: bigint;
        playerA: PublicKey;
        playerB: PublicKey;
        imSideA: boolean;
      } | null = null;

      if (matchId !== null) {
        // We're PlayerB — fetch the match we just made
        setPhase("matched");
        const program = getProgram(connection);
        const acc = await (program.account as any).match.fetch(
          matchPda(poolId, Number(matchId))[0]
        );
        matchInfo = {
          matchId,
          playerA: new PublicKey(acc.playerA),
          playerB: new PublicKey(acc.playerB),
          imSideA: false,
        };
      } else {
        // Queued — wait for someone to match us
        setPhase("queued");
        const startMatchId = await getCurrentNextMatchId(connection, poolId);
        matchInfo = await pollForMatch({
          connection,
          poolId,
          player: publicKey,
          startMatchId,
          timeoutMs: 600_000, // 10 min
          intervalMs: 2500,
        });
        if (!matchInfo) throw new Error("Match poll timed out — try again");
        setPhase("matched");
      }

      // 3. Auto-reveal via session key (no wallet popup)
      setPhase("revealing");
      await revealMove({
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
      const otherMove = await pollMatchUntilResolved(
        connection,
        poolId,
        matchInfo.matchId,
        matchInfo.imSideA
      );
      if (otherMove === null) throw new Error("Opponent timeout");
      setOpponentMove(otherMove);
      setPhase("resolved");

      // Refresh streak
      const stats = await fetchPlayerStats(connection, publicKey);
      if (stats) setStreak(stats.currentStreak);
      clearPendingPlay(publicKey.toBase58(), bytesToHex(commitment));
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err?.message ?? String(err));
      setPhase("idle");
    }
  }, [publicKey, anchorWallet, selected, poolId, programDeployed, connection]);

  function reset() {
    setPhase("idle");
    setSelected(null);
    setOpponentMove(null);
  }

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
      <PixelFrame
        title={`${poolName} // ENTRY: ${entryAmount.toLocaleString()} $RPS (${usdEstimate})`}
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
                <Stat label="ENTRY" value={`${fmtCompact(entryAmount)} $RPS`} />
                <Stat
                  label="POT"
                  value={`${fmtCompact(entryAmount * 2)} $RPS`}
                  glow="acid"
                />
                <Stat
                  label="MAX WIN"
                  value={`${fmtCompact(entryAmount * 1.5)} $RPS`}
                  glow="ok"
                />
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

          {phase === "resolved" && selected && opponentMove && (
            <motion.div
              key="result"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-6"
            >
              <ResultDisplay
                myMove={selected}
                theirMove={opponentMove}
                outcome={deriveOutcome(selected, opponentMove)}
                payout={
                  deriveOutcome(selected, opponentMove) === "win"
                    ? entryAmount * 1.5
                    : deriveOutcome(selected, opponentMove) === "tie"
                    ? entryAmount * 0.75
                    : 0
                }
                burned={entryAmount * 0.25}
                toTreasury={entryAmount * 0.25}
              />
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
