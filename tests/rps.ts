/**
 * Anchor + bankrun integration tests for rps_onchain.
 *
 * Run with: anchor test
 *
 * Uses solana-bankrun for in-process execution + arbitrary slot warping
 * (needed for the timeout tests).
 */
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  getAccount,
  getMint,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { expect } from "chai";

// IDL is generated at target/types/rps_onchain.ts after `anchor build`.
import { RpsOnchain } from "../target/types/rps_onchain";

// ────────── helpers ──────────

const u64Le = (n: number | bigint) => {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(typeof n === "bigint" ? n : BigInt(n), 0);
  return buf;
};

const computeCommitment = (
  move: number,
  nonce: Uint8Array,
  player: PublicKey
) => {
  const data = new Uint8Array(1 + 32 + 32);
  data[0] = move;
  data.set(nonce, 1);
  data.set(player.toBytes(), 33);
  return keccak_256(data);
};

const randomNonce = () => {
  const b = new Uint8Array(32);
  for (let i = 0; i < 32; i++) b[i] = Math.floor(Math.random() * 256);
  return b;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ────────── tests ──────────

describe("rps_onchain", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.RpsOnchain as Program<RpsOnchain>;
  const connection = provider.connection;
  const admin = (provider.wallet as anchor.Wallet).payer;

  let mint: PublicKey;
  let treasury: PublicKey;
  let configPda: PublicKey;
  let globalStatsPda: PublicKey;

  const REVEAL_TIMEOUT_SLOTS = 100; // short for testing
  const ENTRY_AMOUNT = 30_000n * 1_000_000n; // 30k tokens (6 decimals)
  const POOL_ID_30K = 0;

  // Helpers that derive PDAs the same way the program does
  const poolPda = (id: number | bigint) =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("pool"), u64Le(id)],
      program.programId
    )[0];
  const poolStatsPda = (id: number | bigint) =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("pool_stats"), u64Le(id)],
      program.programId
    )[0];
  const vaultPda = (id: number | bigint) =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), u64Le(id)],
      program.programId
    )[0];
  const queueEntryPda = (poolId: number | bigint, idx: number | bigint) =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("entry"), u64Le(poolId), u64Le(idx)],
      program.programId
    )[0];
  const matchPda = (poolId: number | bigint, matchId: number | bigint) =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("match"), u64Le(poolId), u64Le(matchId)],
      program.programId
    )[0];
  const playerStatsPda = (player: PublicKey) =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("player"), player.toBuffer()],
      program.programId
    )[0];

  before(async () => {
    // Mint with 6 decimals (matches typical pump.fun layout)
    mint = await createMint(connection, admin, admin.publicKey, null, 6);

    // Treasury = admin's ATA for the mint
    const treasuryAta = await getOrCreateAssociatedTokenAccount(
      connection,
      admin,
      mint,
      admin.publicKey
    );
    treasury = treasuryAta.address;

    [configPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("config")],
      program.programId
    );
    [globalStatsPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("stats")],
      program.programId
    );
  });

  it("initialize: creates Config + GlobalStats", async () => {
    await program.methods
      .initialize(new anchor.BN(REVEAL_TIMEOUT_SLOTS))
      .accounts({
        admin: admin.publicKey,
        mint,
        treasury,
      } as any)
      .rpc();

    const cfg = await program.account.config.fetch(configPda);
    expect(cfg.admin.toBase58()).to.eq(admin.publicKey.toBase58());
    expect(cfg.mint.toBase58()).to.eq(mint.toBase58());
    expect(cfg.treasury.toBase58()).to.eq(treasury.toBase58());
    expect(cfg.revealTimeoutSlots.toNumber()).to.eq(REVEAL_TIMEOUT_SLOTS);

    const stats = await program.account.globalStats.fetch(globalStatsPda);
    expect(stats.roundsPlayed.toNumber()).to.eq(0);
    expect(stats.totalBurned.toNumber()).to.eq(0);
  });

  it("initialize_pool: rejects entry_amount % 4 != 0", async () => {
    try {
      await program.methods
        .initializePool(new anchor.BN(99), new anchor.BN(123))
        .accounts({ admin: admin.publicKey, mint } as any)
        .rpc();
      throw new Error("Expected failure");
    } catch (e: any) {
      expect(e.toString()).to.include("InvalidEntryAmount");
    }
  });

  it("initialize_pool: creates Pool + PoolStats + Vault", async () => {
    await program.methods
      .initializePool(new anchor.BN(POOL_ID_30K), new anchor.BN(ENTRY_AMOUNT))
      .accounts({ admin: admin.publicKey, mint } as any)
      .rpc();

    const pool = await program.account.pool.fetch(poolPda(POOL_ID_30K));
    expect(pool.poolId.toNumber()).to.eq(POOL_ID_30K);
    expect(pool.entryAmount.toString()).to.eq(ENTRY_AMOUNT.toString());
    expect(pool.queueHead.toNumber()).to.eq(0);
    expect(pool.queueTail.toNumber()).to.eq(0);
    expect(pool.nextMatchId.toNumber()).to.eq(0);
  });

  describe("happy path: A wins, B loses", () => {
    let alice: Keypair, bob: Keypair;
    let aliceTok: PublicKey, bobTok: PublicKey;
    const moveA = 1; // ROCK
    const moveB = 3; // SCISSORS — A wins
    const nonceA = randomNonce();
    const nonceB = randomNonce();
    let sessionA: Keypair, sessionB: Keypair;
    const matchId = 0;

    before(async () => {
      alice = Keypair.generate();
      bob = Keypair.generate();
      sessionA = Keypair.generate();
      sessionB = Keypair.generate();

      // Fund SOL for both
      for (const kp of [alice, bob]) {
        const sig = await connection.requestAirdrop(
          kp.publicKey,
          2 * anchor.web3.LAMPORTS_PER_SOL
        );
        await connection.confirmTransaction(sig);
      }

      // Mint 100k tokens to each
      for (const [kp, slot] of [
        [alice, 0],
        [bob, 1],
      ] as const) {
        const ata = await getOrCreateAssociatedTokenAccount(
          connection,
          admin,
          mint,
          kp.publicKey
        );
        if (slot === 0) aliceTok = ata.address;
        else bobTok = ata.address;
        await mintTo(
          connection,
          admin,
          mint,
          ata.address,
          admin,
          Number(ENTRY_AMOUNT * 5n)
        );
      }
    });

    it("alice joins empty queue (join_solo)", async () => {
      const commitment = computeCommitment(moveA, nonceA, alice.publicKey);
      await program.methods
        .joinSolo(new anchor.BN(POOL_ID_30K), Array.from(commitment), sessionA.publicKey)
        .accounts({
          player: alice.publicKey,
          playerTokenAccount: aliceTok,
        } as any)
        .signers([alice])
        .rpc();

      const pool = await program.account.pool.fetch(poolPda(POOL_ID_30K));
      expect(pool.queueHead.toNumber()).to.eq(0);
      expect(pool.queueTail.toNumber()).to.eq(1);

      const vaultBal = await getAccount(connection, vaultPda(POOL_ID_30K));
      expect(vaultBal.amount.toString()).to.eq(ENTRY_AMOUNT.toString());
    });

    it("bob joins, gets matched (join_and_match)", async () => {
      const commitment = computeCommitment(moveB, nonceB, bob.publicKey);
      await program.methods
        .joinAndMatch(new anchor.BN(POOL_ID_30K), Array.from(commitment), sessionB.publicKey)
        .accounts({
          player: bob.publicKey,
          headPlayer: alice.publicKey,
          playerTokenAccount: bobTok,
        } as any)
        .signers([bob])
        .rpc();

      const pool = await program.account.pool.fetch(poolPda(POOL_ID_30K));
      expect(pool.queueHead.toNumber()).to.eq(1);
      expect(pool.queueTail.toNumber()).to.eq(1);
      expect(pool.nextMatchId.toNumber()).to.eq(1);

      const m = await program.account.match.fetch(matchPda(POOL_ID_30K, matchId));
      expect(m.playerA.toBase58()).to.eq(alice.publicKey.toBase58());
      expect(m.playerB.toBase58()).to.eq(bob.publicKey.toBase58());
      expect(m.pot.toString()).to.eq((ENTRY_AMOUNT * 2n).toString());
    });

    it("alice reveals via session key (no wallet popup)", async () => {
      await program.methods
        .reveal(
          new anchor.BN(POOL_ID_30K),
          new anchor.BN(matchId),
          moveA,
          Array.from(nonceA)
        )
        .accounts({
          signer: sessionA.publicKey,
          mint,
          treasuryToken: treasury,
          playerAToken: aliceTok,
          playerBToken: bobTok,
        } as any)
        .signers([sessionA])
        .rpc();

      const m = await program.account.match.fetch(matchPda(POOL_ID_30K, matchId));
      expect(m.revealA).to.eq(moveA);
      expect(m.revealB).to.eq(null);
    });

    it("bob reveals → match resolves atomically, supply drops, treasury credited", async () => {
      const supplyBefore = (await getMint(connection, mint)).supply;
      const treasuryBefore = (await getAccount(connection, treasury)).amount;
      const aliceBefore = (await getAccount(connection, aliceTok)).amount;

      await program.methods
        .reveal(
          new anchor.BN(POOL_ID_30K),
          new anchor.BN(matchId),
          moveB,
          Array.from(nonceB)
        )
        .accounts({
          signer: sessionB.publicKey,
          mint,
          treasuryToken: treasury,
          playerAToken: aliceTok,
          playerBToken: bobTok,
        } as any)
        .signers([sessionB])
        .rpc();

      const pot = ENTRY_AMOUNT * 2n;
      // 85% winner / 7.5% burn / 7.5% treasury (pot * 3/40)
      const burnAmount = (pot * 3n) / 40n;
      const treasuryAmount = burnAmount;
      const winnerAmount = pot - burnAmount - treasuryAmount;

      // Supply went down (real burn)
      const supplyAfter = (await getMint(connection, mint)).supply;
      expect((supplyBefore - supplyAfter).toString()).to.eq(burnAmount.toString());

      // Treasury credited
      const treasuryAfter = (await getAccount(connection, treasury)).amount;
      expect((treasuryAfter - treasuryBefore).toString()).to.eq(treasuryAmount.toString());

      // Alice (winner) credited 75%
      const aliceAfter = (await getAccount(connection, aliceTok)).amount;
      expect((aliceAfter - aliceBefore).toString()).to.eq(winnerAmount.toString());

      // Match marked resolved
      const m = await program.account.match.fetch(matchPda(POOL_ID_30K, matchId));
      expect(JSON.stringify(m.state)).to.contain("resolved");

      // Stats updated
      const aliceStats = await program.account.playerStats.fetch(
        playerStatsPda(alice.publicKey)
      );
      expect(aliceStats.wins.toNumber()).to.eq(1);
      expect(aliceStats.currentStreak).to.eq(1);

      const bobStats = await program.account.playerStats.fetch(
        playerStatsPda(bob.publicKey)
      );
      expect(bobStats.losses.toNumber()).to.eq(1);
      expect(bobStats.currentStreak).to.eq(0);
    });
  });

  describe("tie path: 37.5/37.5/12.5/12.5", () => {
    let alice: Keypair, bob: Keypair;
    let aliceTok: PublicKey, bobTok: PublicKey;
    const sessionA = Keypair.generate();
    const sessionB = Keypair.generate();
    const moveA = 2,
      moveB = 2; // both PAPER → tie
    const nonceA = randomNonce(),
      nonceB = randomNonce();
    const matchId = 1;

    before(async () => {
      alice = Keypair.generate();
      bob = Keypair.generate();
      for (const kp of [alice, bob]) {
        await connection.confirmTransaction(
          await connection.requestAirdrop(
            kp.publicKey,
            2 * anchor.web3.LAMPORTS_PER_SOL
          )
        );
        const ata = await getOrCreateAssociatedTokenAccount(
          connection,
          admin,
          mint,
          kp.publicKey
        );
        if (kp === alice) aliceTok = ata.address;
        else bobTok = ata.address;
        await mintTo(
          connection,
          admin,
          mint,
          ata.address,
          admin,
          Number(ENTRY_AMOUNT * 5n)
        );
      }
    });

    it("both players reveal same move → tie distribution", async () => {
      const cA = computeCommitment(moveA, nonceA, alice.publicKey);
      await program.methods
        .joinSolo(new anchor.BN(POOL_ID_30K), Array.from(cA), sessionA.publicKey)
        .accounts({ player: alice.publicKey, playerTokenAccount: aliceTok } as any)
        .signers([alice])
        .rpc();

      const cB = computeCommitment(moveB, nonceB, bob.publicKey);
      await program.methods
        .joinAndMatch(new anchor.BN(POOL_ID_30K), Array.from(cB), sessionB.publicKey)
        .accounts({
          player: bob.publicKey,
          headPlayer: alice.publicKey,
          playerTokenAccount: bobTok,
        } as any)
        .signers([bob])
        .rpc();

      const aliceBefore = (await getAccount(connection, aliceTok)).amount;
      const bobBefore = (await getAccount(connection, bobTok)).amount;

      await program.methods
        .reveal(
          new anchor.BN(POOL_ID_30K),
          new anchor.BN(matchId),
          moveA,
          Array.from(nonceA)
        )
        .accounts({
          signer: sessionA.publicKey,
          mint,
          treasuryToken: treasury,
          playerAToken: aliceTok,
          playerBToken: bobTok,
        } as any)
        .signers([sessionA])
        .rpc();
      await program.methods
        .reveal(
          new anchor.BN(POOL_ID_30K),
          new anchor.BN(matchId),
          moveB,
          Array.from(nonceB)
        )
        .accounts({
          signer: sessionB.publicKey,
          mint,
          treasuryToken: treasury,
          playerAToken: aliceTok,
          playerBToken: bobTok,
        } as any)
        .signers([sessionB])
        .rpc();

      const pot = ENTRY_AMOUNT * 2n;
      const eachShare = (pot - (pot * 3n) / 40n - (pot * 3n) / 40n) / 2n; // 42.5%

      const aliceAfter = (await getAccount(connection, aliceTok)).amount;
      const bobAfter = (await getAccount(connection, bobTok)).amount;
      expect((aliceAfter - aliceBefore).toString()).to.eq(eachShare.toString());
      expect((bobAfter - bobBefore).toString()).to.eq(eachShare.toString());

      // Streaks frozen on tie
      const aliceStats = await program.account.playerStats.fetch(
        playerStatsPda(alice.publicKey)
      );
      expect(aliceStats.ties.toNumber()).to.eq(1);
      expect(aliceStats.currentStreak).to.eq(1); // unchanged from previous WIN
    });
  });

  describe("cheating attempts", () => {
    let alice: Keypair, aliceTok: PublicKey;
    const sessionA = Keypair.generate();
    const moveA = 1;
    const nonceA = randomNonce();

    before(async () => {
      alice = Keypair.generate();
      await connection.confirmTransaction(
        await connection.requestAirdrop(
          alice.publicKey,
          2 * anchor.web3.LAMPORTS_PER_SOL
        )
      );
      const ata = await getOrCreateAssociatedTokenAccount(
        connection,
        admin,
        mint,
        alice.publicKey
      );
      aliceTok = ata.address;
      await mintTo(
        connection,
        admin,
        mint,
        ata.address,
        admin,
        Number(ENTRY_AMOUNT * 2n)
      );

      const cA = computeCommitment(moveA, nonceA, alice.publicKey);
      await program.methods
        .joinSolo(new anchor.BN(POOL_ID_30K), Array.from(cA), sessionA.publicKey)
        .accounts({ player: alice.publicKey, playerTokenAccount: aliceTok } as any)
        .signers([alice])
        .rpc();
    });

    it("rejects join_solo when queue is non-empty", async () => {
      const bob = Keypair.generate();
      await connection.confirmTransaction(
        await connection.requestAirdrop(
          bob.publicKey,
          2 * anchor.web3.LAMPORTS_PER_SOL
        )
      );
      const ata = await getOrCreateAssociatedTokenAccount(
        connection,
        admin,
        mint,
        bob.publicKey
      );
      await mintTo(connection, admin, mint, ata.address, admin, Number(ENTRY_AMOUNT * 2n));

      const cB = computeCommitment(2, randomNonce(), bob.publicKey);
      try {
        await program.methods
          .joinSolo(new anchor.BN(POOL_ID_30K), Array.from(cB), Keypair.generate().publicKey)
          .accounts({ player: bob.publicKey, playerTokenAccount: ata.address } as any)
          .signers([bob])
          .rpc();
        throw new Error("Expected failure");
      } catch (e: any) {
        expect(e.toString()).to.include("QueueNotEmpty");
      }
    });
  });

  // Additional tests to add (kept short for the initial scaffold):
  // - resolve_timeout: A revealed, B did not → A wins by forfeit, fees applied
  // - resolve_timeout: neither revealed → both refunded, no fees, MatchState::TimedOut
  // - cancel_queue_entry: head refunded after timeout; queue advances
  // - reveal: wrong nonce → InvalidReveal
  // - reveal: AlreadyRevealed if same side reveals twice
  // - streak transitions across multiple games (3-in-a-row updates best_streak)
});
