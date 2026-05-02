use anchor_lang::prelude::*;

use crate::errors::RpsError;
use crate::state::*;

#[derive(Accounts)]
pub struct InitializeSolConfig<'info> {
    #[account(mut, address = config.admin @ RpsError::Unauthorized)]
    pub admin: Signer<'info>,

    /// The existing main Config — we authenticate against its admin field so
    /// only the same admin who initialized RPS can stand up the SOL world.
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, Config>,

    #[account(
        init,
        payer = admin,
        space = SolConfig::SPACE,
        seeds = [b"sol_config"],
        bump,
    )]
    pub sol_config: Account<'info, SolConfig>,

    #[account(
        init,
        payer = admin,
        space = SolGlobalStats::SPACE,
        seeds = [b"sol_stats"],
        bump,
    )]
    pub sol_global_stats: Account<'info, SolGlobalStats>,

    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<InitializeSolConfig>,
    sol_treasury: Pubkey,
    sol_burn_wallet: Pubkey,
    reveal_timeout_slots: u64,
) -> Result<()> {
    let cfg = &mut ctx.accounts.sol_config;
    cfg.admin = ctx.accounts.admin.key();
    cfg.sol_treasury = sol_treasury;
    cfg.sol_burn_wallet = sol_burn_wallet;
    cfg.reveal_timeout_slots = reveal_timeout_slots;
    cfg.bump = ctx.bumps.sol_config;

    let stats = &mut ctx.accounts.sol_global_stats;
    stats.bump = ctx.bumps.sol_global_stats;

    Ok(())
}
