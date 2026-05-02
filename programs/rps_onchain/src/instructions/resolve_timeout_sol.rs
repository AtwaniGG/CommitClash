use anchor_lang::prelude::*;

use crate::errors::RpsError;
use crate::events::SolTimeoutResolved;
use crate::instructions::reveal_sol::pay_lamports;
use crate::state::*;

#[derive(Accounts)]
#[instruction(pool_id: u64, match_id: u64)]
pub struct ResolveTimeoutSol<'info> {
    pub caller: Signer<'info>,

    #[account(seeds = [b"sol_config"], bump = sol_config.bump)]
    pub sol_config: Box<Account<'info, SolConfig>>,

    #[account(
        seeds = [b"sol_pool", pool_id.to_le_bytes().as_ref()],
        bump = sol_pool.bump,
    )]
    pub sol_pool: Box<Account<'info, SolPool>>,

    #[account(
        mut,
        seeds = [
            b"sol_match",
            pool_id.to_le_bytes().as_ref(),
            match_id.to_le_bytes().as_ref(),
        ],
        bump = the_match.bump,
        constraint = the_match.pool_id == pool_id @ RpsError::PoolMismatch,
        constraint = the_match.match_id == match_id @ RpsError::MatchMismatch,
        constraint = the_match.state == MatchState::AwaitingReveals @ RpsError::MatchNotActive,
    )]
    pub the_match: Box<Account<'info, SolMatch>>,

    #[account(
        mut,
        seeds = [b"sol_pool_stats", pool_id.to_le_bytes().as_ref()],
        bump = sol_pool_stats.bump,
    )]
    pub sol_pool_stats: Box<Account<'info, SolPoolStats>>,

    #[account(mut, seeds = [b"sol_stats"], bump = sol_global_stats.bump)]
    pub sol_global_stats: Box<Account<'info, SolGlobalStats>>,

    #[account(
        mut,
        seeds = [b"sol_player", the_match.player_a.as_ref()],
        bump = sol_player_stats_a.bump,
    )]
    pub sol_player_stats_a: Box<Account<'info, SolPlayerStats>>,

    #[account(
        mut,
        seeds = [b"sol_player", the_match.player_b.as_ref()],
        bump = sol_player_stats_b.bump,
    )]
    pub sol_player_stats_b: Box<Account<'info, SolPlayerStats>>,

    #[account(
        mut,
        seeds = [b"sol_vault", pool_id.to_le_bytes().as_ref()],
        bump = sol_pool.vault_bump,
    )]
    pub sol_vault: Box<Account<'info, SolVault>>,

    /// CHECK: lamport recipient — must equal SolConfig.sol_treasury
    #[account(mut, address = sol_config.sol_treasury @ RpsError::Unauthorized)]
    pub sol_treasury: AccountInfo<'info>,

    /// CHECK: lamport recipient — must equal SolConfig.sol_burn_wallet
    #[account(mut, address = sol_config.sol_burn_wallet @ RpsError::Unauthorized)]
    pub sol_burn_wallet: AccountInfo<'info>,

    /// CHECK: lamport recipient — must equal the_match.player_a
    #[account(mut, address = the_match.player_a @ RpsError::Unauthorized)]
    pub player_a: AccountInfo<'info>,

    /// CHECK: lamport recipient — must equal the_match.player_b
    #[account(mut, address = the_match.player_b @ RpsError::Unauthorized)]
    pub player_b: AccountInfo<'info>,
}

pub fn handler(ctx: Context<ResolveTimeoutSol>, pool_id: u64, _match_id: u64) -> Result<()> {
    let now = Clock::get()?.slot;
    let elapsed = now.saturating_sub(ctx.accounts.the_match.slot_matched);
    require!(
        elapsed > ctx.accounts.sol_config.reveal_timeout_slots,
        RpsError::TimeoutNotReached
    );

    let pot = ctx.accounts.the_match.pot;
    let entry_amount = pot / 2;
    let reveal_a = ctx.accounts.the_match.reveal_a;
    let reveal_b = ctx.accounts.the_match.reveal_b;

    let mut paid_a: u64 = 0;
    let mut paid_b: u64 = 0;
    let mut burned: u64 = 0;
    let mut to_treasury: u64 = 0;
    let scenario: u8;

    match (reveal_a.is_some(), reveal_b.is_some()) {
        (true, false) => {
            scenario = 0;
            burned = pot.checked_mul(3).ok_or(RpsError::MathOverflow)? / 40;
            to_treasury = burned;
            paid_a = pot - burned - to_treasury;

            pay_lamports(
                &ctx.accounts.sol_vault.to_account_info(),
                &ctx.accounts.sol_burn_wallet,
                burned,
            )?;
            pay_lamports(
                &ctx.accounts.sol_vault.to_account_info(),
                &ctx.accounts.sol_treasury,
                to_treasury,
            )?;
            pay_lamports(
                &ctx.accounts.sol_vault.to_account_info(),
                &ctx.accounts.player_a,
                paid_a,
            )?;
        }
        (false, true) => {
            scenario = 1;
            burned = pot.checked_mul(3).ok_or(RpsError::MathOverflow)? / 40;
            to_treasury = burned;
            paid_b = pot - burned - to_treasury;

            pay_lamports(
                &ctx.accounts.sol_vault.to_account_info(),
                &ctx.accounts.sol_burn_wallet,
                burned,
            )?;
            pay_lamports(
                &ctx.accounts.sol_vault.to_account_info(),
                &ctx.accounts.sol_treasury,
                to_treasury,
            )?;
            pay_lamports(
                &ctx.accounts.sol_vault.to_account_info(),
                &ctx.accounts.player_b,
                paid_b,
            )?;
        }
        (false, false) => {
            scenario = 2;
            paid_a = entry_amount;
            paid_b = entry_amount;
            pay_lamports(
                &ctx.accounts.sol_vault.to_account_info(),
                &ctx.accounts.player_a,
                entry_amount,
            )?;
            pay_lamports(
                &ctx.accounts.sol_vault.to_account_info(),
                &ctx.accounts.player_b,
                entry_amount,
            )?;
        }
        (true, true) => {
            return err!(RpsError::MatchNotActive);
        }
    }

    if scenario != 2 {
        let mut ctx = ctx;
        if scenario == 0 {
            {
                let s = &mut ctx.accounts.sol_player_stats_a;
                s.wins = s.wins.saturating_add(1);
                s.current_streak = s.current_streak.saturating_add(1);
                if s.current_streak > s.best_streak {
                    s.best_streak = s.current_streak;
                }
                s.total_wagered = s.total_wagered.saturating_add(entry_amount);
                s.total_won = s.total_won.saturating_add(paid_a);
            }
            {
                let s = &mut ctx.accounts.sol_player_stats_b;
                s.losses = s.losses.saturating_add(1);
                s.current_streak = 0;
                s.total_wagered = s.total_wagered.saturating_add(entry_amount);
            }
        } else {
            {
                let s = &mut ctx.accounts.sol_player_stats_b;
                s.wins = s.wins.saturating_add(1);
                s.current_streak = s.current_streak.saturating_add(1);
                if s.current_streak > s.best_streak {
                    s.best_streak = s.current_streak;
                }
                s.total_wagered = s.total_wagered.saturating_add(entry_amount);
                s.total_won = s.total_won.saturating_add(paid_b);
            }
            {
                let s = &mut ctx.accounts.sol_player_stats_a;
                s.losses = s.losses.saturating_add(1);
                s.current_streak = 0;
                s.total_wagered = s.total_wagered.saturating_add(entry_amount);
            }
        }
        {
            let ps = &mut ctx.accounts.sol_pool_stats;
            ps.rounds_played = ps.rounds_played.saturating_add(1);
            ps.volume = ps.volume.saturating_add(pot);
            ps.burned = ps.burned.saturating_add(burned);
        }
        {
            let gs = &mut ctx.accounts.sol_global_stats;
            gs.rounds_played = gs.rounds_played.saturating_add(1);
            gs.total_burned = gs.total_burned.saturating_add(burned);
            gs.total_to_treasury = gs.total_to_treasury.saturating_add(to_treasury);
            gs.total_volume = gs.total_volume.saturating_add(pot);
        }
        ctx.accounts.the_match.state = MatchState::Resolved;

        emit!(SolTimeoutResolved {
            pool_id,
            match_id: ctx.accounts.the_match.match_id,
            scenario,
            paid_a,
            paid_b,
            burned,
            to_treasury,
        });
    } else {
        let mut ctx = ctx;
        ctx.accounts.the_match.state = MatchState::TimedOut;
        emit!(SolTimeoutResolved {
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
