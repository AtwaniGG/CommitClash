use anchor_lang::prelude::*;

use crate::errors::RpsError;
use crate::events::SolPoolInitialized;
use crate::state::*;

#[derive(Accounts)]
#[instruction(pool_id: u64)]
pub struct InitializeSolPool<'info> {
    #[account(mut, address = sol_config.admin @ RpsError::Unauthorized)]
    pub admin: Signer<'info>,

    #[account(seeds = [b"sol_config"], bump = sol_config.bump)]
    pub sol_config: Account<'info, SolConfig>,

    #[account(
        init,
        payer = admin,
        space = SolPool::SPACE,
        seeds = [b"sol_pool", pool_id.to_le_bytes().as_ref()],
        bump,
    )]
    pub sol_pool: Account<'info, SolPool>,

    #[account(
        init,
        payer = admin,
        space = SolPoolStats::SPACE,
        seeds = [b"sol_pool_stats", pool_id.to_le_bytes().as_ref()],
        bump,
    )]
    pub sol_pool_stats: Account<'info, SolPoolStats>,

    /// Program-owned PDA holding lamports. Empty data; admin pays rent at
    /// init. Lamports flow in via system_program::transfer (allowed regardless
    /// of destination owner) and out via direct lamports mutation (allowed for
    /// program-owned accounts).
    #[account(
        init,
        payer = admin,
        space = SolVault::SPACE,
        seeds = [b"sol_vault", pool_id.to_le_bytes().as_ref()],
        bump,
    )]
    pub sol_vault: Account<'info, SolVault>,

    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<InitializeSolPool>,
    pool_id: u64,
    entry_amount: u64,
) -> Result<()> {
    // Pot = 2 * entry must be divisible by 40 so the 7.5% / 42.5% / 85%
    // splits are all exact integer lamports. entry % 20 == 0 ⇒ pot % 40 == 0.
    require!(
        entry_amount > 0 && entry_amount % 20 == 0,
        RpsError::InvalidEntryAmount
    );

    let pool = &mut ctx.accounts.sol_pool;
    pool.pool_id = pool_id;
    pool.entry_amount = entry_amount;
    pool.queue_head = 0;
    pool.queue_tail = 0;
    pool.next_match_id = 0;
    pool.vault_bump = ctx.bumps.sol_vault;
    pool.bump = ctx.bumps.sol_pool;

    let pool_stats = &mut ctx.accounts.sol_pool_stats;
    pool_stats.pool_id = pool_id;
    pool_stats.bump = ctx.bumps.sol_pool_stats;

    emit!(SolPoolInitialized {
        pool_id,
        entry_amount,
    });
    Ok(())
}
