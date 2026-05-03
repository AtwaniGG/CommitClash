# CommitClash Mainnet Launch Checklist

End-to-end runbook for going live. Every step is automated by a script — this doc just sequences them.

---

## Prerequisites

- [ ] **Mainnet wallet** with at least **8 SOL** (3-5 SOL for program deploy buffer + 1.5 SOL for PDA rent on init + buffer)
- [ ] **Helius mainnet API key** ($49/mo plan minimum — free tier won't survive launch traffic)
- [ ] **Treasury wallet** decided — the address that receives the 7.5% RPS treasury cut
- [ ] **SOL treasury + SOL burn wallet** decided — these are wallet pubkeys (not ATAs)
- [ ] You're on **Solana CLI v3.1.14+** and **Anchor 0.31.1** (current devnet build is already on these)

---

## Step 1 — Create the $RPS token on pump.fun

1. Go to pump.fun, click "Create token"
2. Name: `CommitClash` · Ticker: `RPS` (or whatever you want)
3. Image: use `apps/web/public/logo-twitter.png` (the 400×400 we made)
4. Buy ~0.5 SOL of the initial supply to bootstrap
5. **Save the mint address** — you'll need it in Step 4

---

## Step 2 — Generate mainnet program keypair + rebuild

```bash
bash scripts/prep-mainnet.sh
```

This:
- Generates `target/deploy/rps_onchain-mainnet-keypair.json` (skip if exists)
- Updates `declare_id!()` in `programs/rps_onchain/src/lib.rs`
- Adds `[programs.mainnet]` section to `Anchor.toml`
- Runs `anchor build`

Outputs the new program ID. **Save it.**

---

## Step 3 — Deploy program to mainnet

```bash
solana config set --url https://api.mainnet-beta.solana.com
anchor deploy \
  --program-name rps_onchain \
  --provider.cluster mainnet \
  --program-keypair target/deploy/rps_onchain-mainnet-keypair.json
```

Costs ~3-5 SOL. The buffer rent is refunded automatically once the deploy lands. Save the printed program ID (same one prep-mainnet.sh gave you).

---

## Step 4 — Create the treasury ATA

The treasury holds the 7.5% RPS cut. It's a regular SPL token account owned by whichever wallet you want to control the treasury from. Easiest: create it in your treasury wallet:

```bash
spl-token create-account <RPS_MINT> --owner <TREASURY_OWNER_WALLET> --url mainnet-beta
```

Save the printed address — that's `TREASURY_ATA`.

---

## Step 5 — Initialize on-chain state

Set these env vars (or put them in `.env.mainnet` and `source` it):

```bash
export PROGRAM_ID=<from step 3>
export RPS_MINT=<from step 1>
export TREASURY_ATA=<from step 4>
export SOL_TREASURY=<your SOL treasury wallet pubkey>
export SOL_BURN_WALLET=<your deployer wallet — receives 7.5% SOL for manual buyback>
export RPC_URL=https://mainnet.helius-rpc.com/?api-key=YOUR_KEY
export REVEAL_TIMEOUT_SLOTS=1500   # ~10 min, leave default

pnpm exec tsx scripts/mainnet-launch.ts
```

This creates every PDA the frontend expects:
- `Config` + `GlobalStats` (via `initialize`)
- `Pool 0/1/2` + `PoolStats 0/1/2` + `Vault 0/1/2` (via `initialize_pool` × 3)
- `SolConfig` + `SolGlobalStats` (via `initialize_sol_config`)
- `SolPool 0/1/2` + `SolPoolStats 0/1/2` + `SolVault 0/1/2` (via `initialize_sol_pool` × 3)

Re-runnable. If it fails midway, just re-run — it skips anything already initialized.

**Adjust pool entry sizes inside the script if you want different launch tiers.** Current defaults:
- `RPS_30K` / `RPS_100K` / `RPS_1M` (entry × 1, ×3.3, ×33)
- `SOL_0.015` / `SOL_0.05` / `SOL_0.5` (calibrated to ~$2 / $7 / $65 at $RPS launch price)

---

## Step 6 — Verify

```bash
pnpm exec tsx scripts/verify-mainnet.ts
```

Should print all green ticks. Any red cross = halt and investigate before proceeding.

---

## Step 7 — Frontend deploy

1. Copy `apps/web/.env.mainnet.example` to `apps/web/.env.production`
2. Fill in the `TODO_*` values from steps 1, 3, 4
3. Push to Vercel (or set the same env vars in Vercel project settings)
4. Promote the deployment to production
5. Hit `commitclash.com` — connect wallet — verify wallet sees mainnet, pools render, queue counter ticks

---

## Step 8 — Smoke test on mainnet

Play 1 game per pool with 2 wallets you control. Costs ~6 × 2 × entry to fully cover. Verify:
- Burn shows on Solscan as a real `Mint.supply` decrement
- Treasury balance increases by 7.5% of pot
- SOL pools route lamports to the deployer wallet (manual buyback target) and SOL treasury

If everything looks right → tweet the launch.

---

## Post-launch

- **Pump.fun graduation**: when $RPS market cap hits ~$69k it graduates to Raydium. Jupiter aggregates that liquidity automatically. The frontend's `lib/price.ts` will start serving live prices the moment Jupiter has a quote — no code change needed.
- **New pool tiers as price moves**: `initialize_pool(new_id, new_entry)` from the admin wallet to spin up smaller/larger tiers without redeploying. Update `KNOWN_POOL_IDS` + the play page's `POOLS` map to surface them in the UI.
- **Manual buyback**: ~weekly, sweep accumulated SOL from `SOL_BURN_WALLET`, market-buy $RPS via Jupiter, then `spl-token burn` it. The on-chain RPS burns from the contract's vault are already happening per-game; this is the SOL → $RPS deflationary loop you committed to.

---

## Known constraints / non-issues

- **Pump.fun keeps mint authority** on the bonding curve until graduation. The contract doesn't need mint authority — it burns from the vault PDA which the program already owns. Compatible.
- **Pool entry amounts are immutable.** As price drifts, you spin up new pools. No way to "edit" an existing pool's entry, ever.
- **First match in any pool** has a slightly higher gas due to PDA init; users won't notice but worth knowing.
