use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, TokenAccount};

use crate::errors::RpsError;
use crate::state::*;

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        init,
        payer = admin,
        space = Config::SPACE,
        seeds = [b"config"],
        bump
    )]
    pub config: Account<'info, Config>,

    #[account(
        init,
        payer = admin,
        space = GlobalStats::SPACE,
        seeds = [b"stats"],
        bump
    )]
    pub global_stats: Account<'info, GlobalStats>,

    pub mint: Account<'info, Mint>,

    #[account(constraint = treasury.mint == mint.key() @ RpsError::Unauthorized)]
    pub treasury: Account<'info, TokenAccount>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<Initialize>, reveal_timeout_slots: u64) -> Result<()> {
    let config = &mut ctx.accounts.config;
    config.admin = ctx.accounts.admin.key();
    config.mint = ctx.accounts.mint.key();
    config.treasury = ctx.accounts.treasury.key();
    config.reveal_timeout_slots = reveal_timeout_slots;
    config.bump = ctx.bumps.config;

    let stats = &mut ctx.accounts.global_stats;
    stats.bump = ctx.bumps.global_stats;
    Ok(())
}
