use anchor_lang::prelude::*;

pub mod errors;
pub mod events;
pub mod instructions;
pub mod state;

use instructions::*;

declare_id!("DymxJfPVGFD3BD1DWk6KeXaj7uPQhSFo2xXB3A8LuBFG");

#[program]
pub mod rps_onchain {
    use super::*;

    /// One-time setup. Sets admin, $RPS mint, treasury ATA, reveal timeout.
    pub fn initialize(ctx: Context<Initialize>, reveal_timeout_slots: u64) -> Result<()> {
        instructions::initialize::handler(ctx, reveal_timeout_slots)
    }

    /// Admin-only. Creates a new stake-tier pool: Pool, Vault ATA, PoolStats.
    /// `entry_amount` must satisfy `entry_amount % 4 == 0` so the pot splits cleanly into eighths.
    pub fn initialize_pool(
        ctx: Context<InitializePool>,
        pool_id: u64,
        entry_amount: u64,
    ) -> Result<()> {
        instructions::initialize_pool::handler(ctx, pool_id, entry_amount)
    }

    /// Join a pool when its queue is empty. Stakes tokens, registers commitment + session key.
    pub fn join_solo(
        ctx: Context<JoinSolo>,
        pool_id: u64,
        commitment: [u8; 32],
        session_key: Pubkey,
    ) -> Result<()> {
        instructions::join_solo::handler(ctx, pool_id, commitment, session_key)
    }

    /// Join a pool when its queue has someone waiting. Pairs with the head of the queue, creates a Match.
    pub fn join_and_match(
        ctx: Context<JoinAndMatch>,
        pool_id: u64,
        commitment: [u8; 32],
        session_key: Pubkey,
    ) -> Result<()> {
        instructions::join_and_match::handler(ctx, pool_id, commitment, session_key)
    }

    /// Reveal your move + nonce. Either the player's wallet OR the registered session key may sign.
    /// When both sides have revealed, the match resolves and pays out atomically.
    pub fn reveal(
        ctx: Context<Reveal>,
        pool_id: u64,
        match_id: u64,
        move_value: u8,
        nonce: [u8; 32],
    ) -> Result<()> {
        instructions::reveal::handler(ctx, pool_id, match_id, move_value, nonce)
    }

    /// Anyone may call after the reveal timeout. Awards 75/12.5/12.5 to whoever revealed,
    /// or refunds both if neither revealed.
    pub fn resolve_timeout(
        ctx: Context<ResolveTimeout>,
        pool_id: u64,
        match_id: u64,
    ) -> Result<()> {
        instructions::resolve_timeout::handler(ctx, pool_id, match_id)
    }

    /// Refunds the head of the queue if they've been waiting longer than the reveal timeout.
    /// Anyone may call (permissionless liveness escape).
    pub fn cancel_queue_entry(ctx: Context<CancelQueueEntry>, pool_id: u64) -> Result<()> {
        instructions::cancel_queue_entry::handler(ctx, pool_id)
    }

    /// Admin-only. Update treasury or reveal timeout. Does NOT change pool entry amounts.
    /// `update_treasury = true` is required to rewrite treasury — prevents silent retargeting
    /// by a script that always passes the `new_treasury` account.
    pub fn admin_update_config(
        ctx: Context<AdminUpdateConfig>,
        new_reveal_timeout_slots: Option<u64>,
        update_treasury: bool,
    ) -> Result<()> {
        instructions::admin_update_config::handler(ctx, new_reveal_timeout_slots, update_treasury)
    }

    // ─── SOL parallel world ────────────────────────────────────────────
    // These instructions mirror the RPS flow but escrow native lamports
    // instead of SPL tokens. The "burn" portion is routed to a configured
    // wallet (deployer) for off-chain RPS buyback-and-burn.

    /// Admin-only, one-time. Sets up SolConfig + SolGlobalStats. Reuses the
    /// main Config admin for authentication.
    pub fn initialize_sol_config(
        ctx: Context<InitializeSolConfig>,
        sol_treasury: Pubkey,
        sol_burn_wallet: Pubkey,
        reveal_timeout_slots: u64,
    ) -> Result<()> {
        instructions::initialize_sol_config::handler(
            ctx,
            sol_treasury,
            sol_burn_wallet,
            reveal_timeout_slots,
        )
    }

    /// Admin-only. Stand up a new SOL stake-tier pool: SolPool, SolVault, SolPoolStats.
    /// `entry_amount` (lamports) must satisfy `entry_amount % 20 == 0` for clean splits.
    pub fn initialize_sol_pool(
        ctx: Context<InitializeSolPool>,
        pool_id: u64,
        entry_amount: u64,
    ) -> Result<()> {
        instructions::initialize_sol_pool::handler(ctx, pool_id, entry_amount)
    }

    pub fn join_sol_solo(
        ctx: Context<JoinSolSolo>,
        pool_id: u64,
        commitment: [u8; 32],
        session_key: Pubkey,
    ) -> Result<()> {
        instructions::join_sol_solo::handler(ctx, pool_id, commitment, session_key)
    }

    pub fn join_sol_and_match(
        ctx: Context<JoinSolAndMatch>,
        pool_id: u64,
        commitment: [u8; 32],
        session_key: Pubkey,
    ) -> Result<()> {
        instructions::join_sol_and_match::handler(ctx, pool_id, commitment, session_key)
    }

    pub fn reveal_sol(
        ctx: Context<RevealSol>,
        pool_id: u64,
        match_id: u64,
        move_value: u8,
        nonce: [u8; 32],
    ) -> Result<()> {
        instructions::reveal_sol::handler(ctx, pool_id, match_id, move_value, nonce)
    }

    pub fn resolve_timeout_sol(
        ctx: Context<ResolveTimeoutSol>,
        pool_id: u64,
        match_id: u64,
    ) -> Result<()> {
        instructions::resolve_timeout_sol::handler(ctx, pool_id, match_id)
    }

    pub fn cancel_sol_queue_entry(
        ctx: Context<CancelSolQueueEntry>,
        pool_id: u64,
    ) -> Result<()> {
        instructions::cancel_sol_queue_entry::handler(ctx, pool_id)
    }
}
