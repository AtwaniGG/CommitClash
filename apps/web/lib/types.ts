/**
 * Shared TS types that map to on-chain accounts.
 * After `anchor build`, the IDL gives you fully-typed accounts via Anchor's
 * codegen; these types let the rest of the app compile in the meantime.
 */

import type { PublicKey } from "@solana/web3.js";

export type Move = "rock" | "paper" | "scissors";
export type Outcome = "win" | "loss" | "tie";

export interface PoolView {
  id: number;
  entryAmount: bigint;
  queueLength: number;
  rounds: number;
  burned: bigint;
  isLive: boolean;
}

export interface MatchView {
  poolId: number;
  matchId: number;
  playerA: PublicKey;
  playerB: PublicKey;
  pot: bigint;
  state: "AwaitingReveals" | "Resolved" | "TimedOut";
  revealA: number | null;
  revealB: number | null;
  slotMatched: bigint;
}

export interface PlayerStatsView {
  player: PublicKey;
  wins: number;
  losses: number;
  ties: number;
  currentStreak: number;
  bestStreak: number;
  totalWagered: bigint;
  totalWon: bigint;
}
