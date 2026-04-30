use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};

use crate::errors::RpsError;
use crate::events::PoolInitialized;
use crate::state::*;

#[derive(Accounts)]
#[instruction(pool_id: u64)]
pub struct InitializePool<'info> {
    #[account(mut, address = config.admin @ RpsError::Unauthorized)]
    pub admin: Signer<'info>,

    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, Config>,

    #[account(
        init,
        payer = admin,
        space = Pool::SPACE,
        seeds = [b"pool", pool_id.to_le_bytes().as_ref()],
        bump
    )]
    pub pool: Account<'info, Pool>,

    #[account(
        init,
        payer = admin,
        space = PoolStats::SPACE,
        seeds = [b"pool_stats", pool_id.to_le_bytes().as_ref()],
        bump
    )]
    pub pool_stats: Account<'info, PoolStats>,

    #[account(address = config.mint)]
    pub mint: Account<'info, Mint>,

    #[account(
        init,
        payer = admin,
        seeds = [b"vault", pool_id.to_le_bytes().as_ref()],
        bump,
        token::mint = mint,
        token::authority = pool,
    )]
    pub vault: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn handler(ctx: Context<InitializePool>, pool_id: u64, entry_amount: u64) -> Result<()> {
    require!(
        entry_amount > 0 && entry_amount % 4 == 0,
        RpsError::InvalidEntryAmount
    );

    let pool = &mut ctx.accounts.pool;
    pool.pool_id = pool_id;
    pool.entry_amount = entry_amount;
    pool.queue_head = 0;
    pool.queue_tail = 0;
    pool.next_match_id = 0;
    pool.vault_bump = ctx.bumps.vault;
    pool.bump = ctx.bumps.pool;

    let pool_stats = &mut ctx.accounts.pool_stats;
    pool_stats.pool_id = pool_id;
    pool_stats.bump = ctx.bumps.pool_stats;

    emit!(PoolInitialized {
        pool_id,
        entry_amount
    });
    Ok(())
}
