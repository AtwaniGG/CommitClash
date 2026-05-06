# CommitClash — Fully On-Chain Rock-Paper-Scissors on Solana

[**commitclash.com**](https://commitclash.com) · [**$RPS on pump.fun**](https://pump.fun/coin/CYQ3wHfoc6WsFvf7HUoceagenw5Xfy9X824svazapump)

Stake $RPS. Get matched. Winner takes 85%. 7.5% burns forever. 7.5% to treasury. No house, no admin override, no edge.

---

## What it is

A two-player, single-round Rock-Paper-Scissors game settled atomically on Solana. Players stake $RPS into a pool's vault, get paired by a FIFO queue, and the smart contract pays out the winner — all on-chain, no off-chain matchmaker, no custody beyond the program-owned vault.

**Move secrecy** is enforced by a `keccak256(move ‖ nonce ‖ pubkey)` commit-reveal scheme — neither player can see the other's move before locking in their own. **One-click UX** is achieved by a session-key delegation pattern: the user signs a single transaction; an ephemeral browser-held keypair handles the reveal automatically.

---

## Pot distribution

| Outcome | Winner | Loser | Burn (real `spl_token::burn`) | Treasury |
|---|---|---|---|---|
| Win | 85% | 0% | 7.5% | 7.5% |
| Tie | 42.5% | 42.5% | 7.5% | 7.5% |
| Forfeit (one no-show) | 85% | 0% | 7.5% | 7.5% |
| Dual timeout (safety net) | refund | refund | 0% | 0% |

The 7.5% burn invokes the SPL Token program's `burn` instruction directly from the vault PDA — `Mint.supply` decreases on-chain every game, visible on Solscan / Birdeye / Dexscreener / Jupiter.

---

## Repo layout

```
.
├── programs/rps_onchain/    # Anchor 0.31 Solana program (Rust)
│   └── src/
│       ├── lib.rs           # 15 instruction entrypoints (8 $RPS + 7 SOL)
│       ├── instructions/    # join_solo, join_and_match, reveal, resolve_timeout, ...
│       ├── state.rs         # Config, Pool, QueueEntry, Match, PlayerStats, ...
│       └── events.rs        # QueueJoined, Matched, Revealed, Resolved
├── apps/web/                # Next.js 16 frontend (App Router, Tailwind)
│   ├── app/                 # /, /play/[poolId], /me, /stats, /whitepaper
│   ├── components/          # PlayPanel, WalletRecovery, Marquee, Header, ...
│   └── lib/                 # anchor, sessionKey, commit, sfx, previewMode
├── tests/                   # Anchor + bankrun tests
├── scripts/                 # init-devnet, stress-200-timed, drain-stranded, ...
└── Anchor.toml
```

---

## Stack

- **Smart contract**: Anchor 0.31.1 (Rust), single deployed program
- **Frontend**: Next.js 16 App Router · React 19 · Tailwind · framer-motion
- **Wallet**: `@solana/wallet-adapter` (Phantom, Solflare)
- **Indexing**: on-chain `GlobalStats` + `PlayerStats` PDAs for aggregates; program logs via `getSignaturesForAddress` for per-game history; WebSocket account subscriptions for live state
- **Hosting**: Vercel
- **Token**: $RPS (SPL on Solana mainnet, launched via pump.fun)

---

## Local development

```bash
# install
pnpm install

# build the program (requires anchor + solana-cli)
pnpm build:program
pnpm test:program

# run the frontend (talks to devnet by default)
pnpm dev
# → http://localhost:3000
```

The frontend reads cluster + addresses from env vars — see `apps/web/.env.local` (or Vercel project settings):

```
NEXT_PUBLIC_SOLANA_CLUSTER=mainnet-beta   # or devnet
NEXT_PUBLIC_RPC_URL=<helius-or-quicknode-mainnet-url>
NEXT_PUBLIC_PROGRAM_ID=<deployed program id>
NEXT_PUBLIC_RPS_MINT=<mainnet $RPS mint>
NEXT_PUBLIC_TREASURY=<treasury address>
```

---

## On-chain accounts (PDAs)

| PDA | Seeds | Purpose |
|---|---|---|
| `Config` | `["config"]` | Admin, mint, treasury, reveal timeout (singleton) |
| `GlobalStats` | `["stats"]` | Lifetime aggregates: rounds, burned, treasury, volume |
| `Pool` | `["pool", id]` | Per-tier pool: entry amount, queue head/tail, next match id |
| `QueueEntry` | `["entry", id, idx]` | One pending player + commitment + session key |
| `Match` | `["match", id, mid]` | Paired game state: commitments, reveals, pot, slot_matched |
| `PlayerStats` | `["player", wallet]` | Cross-pool: wins, losses, ties, current/best streak, volume |

Mirror PDAs exist for the SOL parallel world (`SolConfig`, `SolPool`, `SolQueueEntry`, `SolMatch`, `SolVault`).

---

## Security

Pre-launch independent review found three issues, all patched and redeployed:

- **[H1]** Adversarial session-key registration → fixed: all four key slots must be pairwise distinct, enforced at join.
- **[M1]** Treasury overwrite on admin update → fixed: requires explicit `update_treasury: bool` flag.
- **[H-SOL-1]** SolVault rent-exempt drain → fixed: `pay_lamports` enforces `Rent::minimum_balance(data_len)` before transfer.

Post-patch 200-game stress test: **198/200 success, 2.64s median end-to-end reveal time**.

A third-party audit by a security firm is on the roadmap before broader liquidity. Full details in the [whitepaper](apps/web/app/whitepaper/page.tsx) on the live site.

---

## Token

- **Symbol**: $RPS
- **Decimals**: 6
- **Total supply**: 1,000,000,000
- **Mint authority**: None (set on graduation, no further minting possible)
- **Freeze authority**: None
- **Deflation**: 7.5% of every pot, burned on-chain

No insider allocation. No vested team supply. No private sale. Every token enters circulation through the pump.fun curve.

---

## Roadmap

- [x] Devnet program v0.1 — core game live, audited, patched
- [x] Frontend — wallet integration, session-key flow, live event feed, real-time PlayerStats, phase-driven SFX, manual-reveal fallback
- [x] SOL pools — full parallel instruction surface, audited (H-SOL-1 patched)
- [ ] **$RPS launch** — pump.fun token deployment, mainnet program migration, first POOL_30K opens
- [ ] Higher tiers — POOL_100K, POOL_1M as $RPS price stabilizes
- [ ] Tournament mode — bracket-style elimination
- [ ] Multi-sig treasury — Squads migration

---

## License

MIT (smart contract + frontend). Audit reports included in repo when received.
