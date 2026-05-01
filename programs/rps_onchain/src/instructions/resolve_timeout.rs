use anchor_lang::prelude::*;
use anchor_spl::token::{self, Burn, Mint, Token, TokenAccount, Transfer};

use crate::errors::RpsError;
use crate::events::TimeoutResolved;
use crate::state::*;

#[derive(Accounts)]
#[instruction(pool_id: u64, match_id: u64)]
pub struct ResolveTimeout<'info> {
    /// Anyone can call after timeout.
    pub caller: Signer<'info>,

    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,

    #[account(
        seeds = [b"pool", pool_id.to_le_bytes().as_ref()],
        bump = pool.bump,
    )]
    pub pool: Box<Account<'info, Pool>>,

    #[account(
        mut,
        seeds = [
            b"match",
            pool_id.to_le_bytes().as_ref(),
            match_id.to_le_bytes().as_ref(),
        ],
        bump = the_match.bump,
        constraint = the_match.pool_id == pool_id @ RpsError::PoolMismatch,
        constraint = the_match.match_id == match_id @ RpsError::MatchMismatch,
        constraint = the_match.state == MatchState::AwaitingReveals @ RpsError::MatchNotActive,
    )]
    pub the_match: Box<Account<'info, Match>>,

    #[account(
        mut,
        seeds = [b"pool_stats", pool_id.to_le_bytes().as_ref()],
        bump = pool_stats.bump,
    )]
    pub pool_stats: Box<Account<'info, PoolStats>>,

    #[account(mut, seeds = [b"stats"], bump = global_stats.bump)]
    pub global_stats: Box<Account<'info, GlobalStats>>,

    #[account(
        mut,
        seeds = [b"player", the_match.player_a.as_ref()],
        bump = player_stats_a.bump,
    )]
    pub player_stats_a: Box<Account<'info, PlayerStats>>,

    #[account(
        mut,
        seeds = [b"player", the_match.player_b.as_ref()],
        bump = player_stats_b.bump,
    )]
    pub player_stats_b: Box<Account<'info, PlayerStats>>,

    #[account(mut, address = config.mint)]
    pub mint: Box<Account<'info, Mint>>,

    #[account(
        mut,
        seeds = [b"vault", pool_id.to_le_bytes().as_ref()],
        bump = pool.vault_bump,
    )]
    pub vault: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        constraint = treasury_token.key() == config.treasury @ RpsError::Unauthorized,
    )]
    pub treasury_token: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        constraint = player_a_token.mint == config.mint @ RpsError::Unauthorized,
        constraint = player_a_token.owner == the_match.player_a @ RpsError::Unauthorized,
    )]
    pub player_a_token: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        constraint = player_b_token.mint == config.mint @ RpsError::Unauthorized,
        constraint = player_b_token.owner == the_match.player_b @ RpsError::Unauthorized,
    )]
    pub player_b_token: Box<Account<'info, TokenAccount>>,

    pub token_program: Program<'info, Token>,
}

pub fn handler(ctx: Context<ResolveTimeout>, pool_id: u64, _match_id: u64) -> Result<()> {
    let now = Clock::get()?.slot;
    let elapsed = now.saturating_sub(ctx.accounts.the_match.slot_matched);
    require!(
        elapsed > ctx.accounts.config.reveal_timeout_slots,
        RpsError::TimeoutNotReached
    );

    let pot = ctx.accounts.the_match.pot;
    let entry_amount = pot / 2;
    let reveal_a = ctx.accounts.the_match.reveal_a;
    let reveal_b = ctx.accounts.the_match.reveal_b;

    let pool_id_bytes = pool_id.to_le_bytes();
    let pool_bump = ctx.accounts.pool.bump;
    let bump_slice = [pool_bump];
    let pool_seeds: &[&[u8]] = &[b"pool", pool_id_bytes.as_ref(), &bump_slice];
    let signer_seeds: &[&[&[u8]]] = &[pool_seeds];

    let mut paid_a: u64 = 0;
    let mut paid_b: u64 = 0;
    let mut burned: u64 = 0;
    let mut to_treasury: u64 = 0;
    let scenario: u8;

    match (reveal_a.is_some(), reveal_b.is_some()) {
        (true, false) => {
            // A wins by forfeit
            scenario = 0;
            // 85/7.5/7.5 split; pot * 3 / 40 == 7.5%
            burned = pot.checked_mul(3).ok_or(RpsError::MathOverflow)? / 40;
            to_treasury = burned;
            paid_a = pot - burned - to_treasury;

            token::burn(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    Burn {
                        mint: ctx.accounts.mint.to_account_info(),
                        from: ctx.accounts.vault.to_account_info(),
                        authority: ctx.accounts.pool.to_account_info(),
                    },
                    signer_seeds,
                ),
                burned,
            )?;
            token::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    Transfer {
                        from: ctx.accounts.vault.to_account_info(),
                        to: ctx.accounts.treasury_token.to_account_info(),
                        authority: ctx.accounts.pool.to_account_info(),
                    },
                    signer_seeds,
                ),
                to_treasury,
            )?;
            token::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    Transfer {
                        from: ctx.accounts.vault.to_account_info(),
                        to: ctx.accounts.player_a_token.to_account_info(),
                        authority: ctx.accounts.pool.to_account_info(),
                    },
                    signer_seeds,
                ),
                paid_a,
            )?;
        }
        (false, true) => {
            // B wins by forfeit
            scenario = 1;
            // 85/7.5/7.5 split; pot * 3 / 40 == 7.5%
            burned = pot.checked_mul(3).ok_or(RpsError::MathOverflow)? / 40;
            to_treasury = burned;
            paid_b = pot - burned - to_treasury;

            token::burn(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    Burn {
                        mint: ctx.accounts.mint.to_account_info(),
                        from: ctx.accounts.vault.to_account_info(),
                        authority: ctx.accounts.pool.to_account_info(),
                    },
                    signer_seeds,
                ),
                burned,
            )?;
            token::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    Transfer {
                        from: ctx.accounts.vault.to_account_info(),
                        to: ctx.accounts.treasury_token.to_account_info(),
                        authority: ctx.accounts.pool.to_account_info(),
                    },
                    signer_seeds,
                ),
                to_treasury,
            )?;
            token::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    Transfer {
                        from: ctx.accounts.vault.to_account_info(),
                        to: ctx.accounts.player_b_token.to_account_info(),
                        authority: ctx.accounts.pool.to_account_info(),
                    },
                    signer_seeds,
                ),
                paid_b,
            )?;
        }
        (false, false) => {
            // Neither revealed → refund both, no fees
            scenario = 2;
            paid_a = entry_amount;
            paid_b = entry_amount;

            token::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    Transfer {
                        from: ctx.accounts.vault.to_account_info(),
                        to: ctx.accounts.player_a_token.to_account_info(),
                        authority: ctx.accounts.pool.to_account_info(),
                    },
                    signer_seeds,
                ),
                entry_amount,
            )?;
            token::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    Transfer {
                        from: ctx.accounts.vault.to_account_info(),
                        to: ctx.accounts.player_b_token.to_account_info(),
                        authority: ctx.accounts.pool.to_account_info(),
                    },
                    signer_seeds,
                ),
                entry_amount,
            )?;
        }
        (true, true) => {
            // Should not happen — reveal would have already resolved.
            return err!(RpsError::MatchNotActive);
        }
    }

    // Stats — only update on forfeit (scenario != neither). Refund-both is a no-op for stats.
    if scenario != 2 {
        let mut ctx = ctx;
        if scenario == 0 {
            // A wins
            {
                let s = &mut ctx.accounts.player_stats_a;
                s.wins = s.wins.saturating_add(1);
                s.current_streak = s.current_streak.saturating_add(1);
                if s.current_streak > s.best_streak {
                    s.best_streak = s.current_streak;
                }
                s.total_wagered = s.total_wagered.saturating_add(entry_amount);
                s.total_won = s.total_won.saturating_add(paid_a);
            }
            {
                let s = &mut ctx.accounts.player_stats_b;
                s.losses = s.losses.saturating_add(1);
                s.current_streak = 0;
                s.total_wagered = s.total_wagered.saturating_add(entry_amount);
            }
        } else {
            // B wins (scenario == 1)
            {
                let s = &mut ctx.accounts.player_stats_b;
                s.wins = s.wins.saturating_add(1);
                s.current_streak = s.current_streak.saturating_add(1);
                if s.current_streak > s.best_streak {
                    s.best_streak = s.current_streak;
                }
                s.total_wagered = s.total_wagered.saturating_add(entry_amount);
                s.total_won = s.total_won.saturating_add(paid_b);
            }
            {
                let s = &mut ctx.accounts.player_stats_a;
                s.losses = s.losses.saturating_add(1);
                s.current_streak = 0;
                s.total_wagered = s.total_wagered.saturating_add(entry_amount);
            }
        }
        {
            let ps = &mut ctx.accounts.pool_stats;
            ps.rounds_played = ps.rounds_played.saturating_add(1);
            ps.volume = ps.volume.saturating_add(pot);
            ps.burned = ps.burned.saturating_add(burned);
        }
        {
            let gs = &mut ctx.accounts.global_stats;
            gs.rounds_played = gs.rounds_played.saturating_add(1);
            gs.total_burned = gs.total_burned.saturating_add(burned);
            gs.total_to_treasury = gs.total_to_treasury.saturating_add(to_treasury);
            gs.total_volume = gs.total_volume.saturating_add(pot);
        }
        ctx.accounts.the_match.state = MatchState::Resolved;

        emit!(TimeoutResolved {
            pool_id,
            match_id: ctx.accounts.the_match.match_id,
            scenario,
            paid_a,
            paid_b,
            burned,
            to_treasury,
        });
    } else {
        // Neither revealed — fully refunded, mark TimedOut
        let mut ctx = ctx;
        ctx.accounts.the_match.state = MatchState::TimedOut;
        emit!(TimeoutResolved {
            pool_id,
            match_id: ctx.accounts.the_match.match_id,
            scenario,
            paid_a,
            paid_b,
            burned,
            to_treasury,
        });
    }

    Ok(())
}
