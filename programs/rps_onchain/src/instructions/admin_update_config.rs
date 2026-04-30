use anchor_lang::prelude::*;
use anchor_spl::token::TokenAccount;

use crate::errors::RpsError;
use crate::state::Config;

#[derive(Accounts)]
pub struct AdminUpdateConfig<'info> {
    #[account(address = config.admin @ RpsError::Unauthorized)]
    pub admin: Signer<'info>,

    #[account(mut, seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, Config>,

    /// Optional new treasury token account. Only consulted when
    /// `update_treasury` is true. Must match the config's mint.
    #[account(constraint = new_treasury.mint == config.mint @ RpsError::Unauthorized)]
    pub new_treasury: Account<'info, TokenAccount>,
}

pub fn handler(
    ctx: Context<AdminUpdateConfig>,
    new_reveal_timeout_slots: Option<u64>,
    update_treasury: bool,
) -> Result<()> {
    let cfg = &mut ctx.accounts.config;
    if let Some(t) = new_reveal_timeout_slots {
        cfg.reveal_timeout_slots = t;
    }
    if update_treasury {
        cfg.treasury = ctx.accounts.new_treasury.key();
    }
    Ok(())
}
