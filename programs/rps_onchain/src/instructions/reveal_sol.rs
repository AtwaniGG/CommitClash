use anchor_lang::prelude::*;

use crate::errors::RpsError;
use crate::events::{SolResolved, SolRevealed};
use crate::state::*;

#[derive(Accounts)]
#[instruction(pool_id: u64, match_id: u64)]
pub struct RevealSol<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,

    #[account(seeds = [b"sol_config"], bump = sol_config.bump)]
    pub sol_config: Box<Account<'info, SolConfig>>,

    #[account(
        mut,
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

pub fn handler(
    ctx: Context<RevealSol>,
    pool_id: u64,
    _match_id: u64,
    move_value: u8,
    nonce: [u8; 32],
) -> Result<()> {
    require!(is_valid_move(move_value), RpsError::InvalidMove);

    let signer_key = ctx.accounts.signer.key();
    let player_a = ctx.accounts.the_match.player_a;
    let session_a = ctx.accounts.the_match.session_key_a;
    let commitment_a = ctx.accounts.the_match.commitment_a;
    let player_b = ctx.accounts.the_match.player_b;
    let session_b = ctx.accounts.the_match.session_key_b;
    let commitment_b = ctx.accounts.the_match.commitment_b;

    let is_a = signer_key == player_a || signer_key == session_a;
    let is_b = signer_key == player_b || signer_key == session_b;
    require!(is_a ^ is_b, RpsError::InvalidSigner);

    {
        let m = &mut ctx.accounts.the_match;
        if is_a {
            require!(m.reveal_a.is_none(), RpsError::AlreadyRevealed);
            let expected = compute_commitment(move_value, &nonce, &player_a);
            require!(expected == commitment_a, RpsError::InvalidReveal);
            m.reveal_a = Some(move_value);
            emit!(SolRevealed {
                pool_id,
                match_id: m.match_id,
                player: player_a,
                move_value,
            });
        } else {
            require!(m.reveal_b.is_none(), RpsError::AlreadyRevealed);
            let expected = compute_commitment(move_value, &nonce, &player_b);
            require!(expected == commitment_b, RpsError::InvalidReveal);
            m.reveal_b = Some(move_value);
            emit!(SolRevealed {
                pool_id,
                match_id: m.match_id,
                player: player_b,
                move_value,
            });
        }
    }

    let move_a_opt = ctx.accounts.the_match.reveal_a;
    let move_b_opt = ctx.accounts.the_match.reveal_b;
    if let (Some(move_a), Some(move_b)) = (move_a_opt, move_b_opt) {
        do_resolve(ctx, pool_id, move_a, move_b)?;
    }

    Ok(())
}

fn do_resolve(
    ctx: Context<RevealSol>,
    pool_id: u64,
    move_a: u8,
    move_b: u8,
) -> Result<()> {
    let outcome = compare_moves(move_a, move_b);
    let pot = ctx.accounts.the_match.pot;

    let burn_amount = pot.checked_mul(3).ok_or(RpsError::MathOverflow)? / 40;
    let treasury_amount = burn_amount;
    let remaining = pot
        .checked_sub(burn_amount)
        .and_then(|v| v.checked_sub(treasury_amount))
        .ok_or(RpsError::MathOverflow)?;

    let (paid_a, paid_b) = match outcome {
        Outcome::PlayerAWins => (remaining, 0u64),
        Outcome::PlayerBWins => (0u64, remaining),
        Outcome::Tie => (remaining / 2, remaining / 2),
    };

    // Direct lamport mutation. SolVault is program-owned (we're allowed to
    // decrement). All recipients are System-owned wallets (allowed to receive
    // arbitrary lamport credits). Vault keeps its rent-exempt baseline because
    // the only lamports above baseline are pot lamports, and we drain exactly
    // burn + treasury + paid_a + paid_b == pot.
    pay_lamports(
        &ctx.accounts.sol_vault.to_account_info(),
        &ctx.accounts.sol_burn_wallet,
        burn_amount,
    )?;
    pay_lamports(
        &ctx.accounts.sol_vault.to_account_info(),
        &ctx.accounts.sol_treasury,
        treasury_amount,
    )?;
    if paid_a > 0 {
        pay_lamports(
            &ctx.accounts.sol_vault.to_account_info(),
            &ctx.accounts.player_a,
            paid_a,
        )?;
    }
    if paid_b > 0 {
        pay_lamports(
            &ctx.accounts.sol_vault.to_account_info(),
            &ctx.accounts.player_b,
            paid_b,
        )?;
    }

    let entry_amount = pot / 2;
    let mut ctx = ctx;
    {
        let s = &mut ctx.accounts.sol_player_stats_a;
        s.total_wagered = s.total_wagered.saturating_add(entry_amount);
        s.total_won = s.total_won.saturating_add(paid_a);
    }
    {
        let s = &mut ctx.accounts.sol_player_stats_b;
        s.total_wagered = s.total_wagered.saturating_add(entry_amount);
        s.total_won = s.total_won.saturating_add(paid_b);
    }
    match outcome {
        Outcome::PlayerAWins => {
            {
                let s = &mut ctx.accounts.sol_player_stats_a;
                s.wins = s.wins.saturating_add(1);
                s.current_streak = s.current_streak.saturating_add(1);
                if s.current_streak > s.best_streak {
                    s.best_streak = s.current_streak;
                }
            }
            let s = &mut ctx.accounts.sol_player_stats_b;
            s.losses = s.losses.saturating_add(1);
            s.current_streak = 0;
        }
        Outcome::PlayerBWins => {
            {
                let s = &mut ctx.accounts.sol_player_stats_b;
                s.wins = s.wins.saturating_add(1);
                s.current_streak = s.current_streak.saturating_add(1);
                if s.current_streak > s.best_streak {
                    s.best_streak = s.current_streak;
                }
            }
            let s = &mut ctx.accounts.sol_player_stats_a;
            s.losses = s.losses.saturating_add(1);
            s.current_streak = 0;
        }
        Outcome::Tie => {
            ctx.accounts.sol_player_stats_a.ties =
                ctx.accounts.sol_player_stats_a.ties.saturating_add(1);
            ctx.accounts.sol_player_stats_b.ties =
                ctx.accounts.sol_player_stats_b.ties.saturating_add(1);
        }
    }

    {
        let ps = &mut ctx.accounts.sol_pool_stats;
        ps.rounds_played = ps.rounds_played.saturating_add(1);
        ps.volume = ps.volume.saturating_add(pot);
        ps.burned = ps.burned.saturating_add(burn_amount);
    }
    {
        let gs = &mut ctx.accounts.sol_global_stats;
        gs.rounds_played = gs.rounds_played.saturating_add(1);
        gs.total_burned = gs.total_burned.saturating_add(burn_amount);
        gs.total_to_treasury = gs.total_to_treasury.saturating_add(treasury_amount);
        gs.total_volume = gs.total_volume.saturating_add(pot);
    }

    let outcome_byte = match outcome {
        Outcome::PlayerAWins => 0u8,
        Outcome::PlayerBWins => 1u8,
        Outcome::Tie => 2u8,
    };
    let match_id;
    let player_a;
    let player_b;
    {
        let m = &mut ctx.accounts.the_match;
        m.state = MatchState::Resolved;
        match_id = m.match_id;
        player_a = m.player_a;
        player_b = m.player_b;
    }

    emit!(SolResolved {
        pool_id,
        match_id,
        player_a,
        player_b,
        move_a,
        move_b,
        outcome: outcome_byte,
        paid_a,
        paid_b,
        burned: burn_amount,
        to_treasury: treasury_amount,
    });

    Ok(())
}

/// Move `amount` lamports from a program-owned PDA to any account.
/// Caller must ensure `from` is owned by this program AND that `from` retains
/// its rent-exempt minimum after the deduction.
pub fn pay_lamports<'info>(
    from: &AccountInfo<'info>,
    to: &AccountInfo<'info>,
    amount: u64,
) -> Result<()> {
    if amount == 0 {
        return Ok(());
    }
    let from_lamports = from.lamports();
    let to_lamports = to.lamports();
    let new_from = from_lamports
        .checked_sub(amount)
        .ok_or(RpsError::MathOverflow)?;
    let new_to = to_lamports
        .checked_add(amount)
        .ok_or(RpsError::MathOverflow)?;
    **from.try_borrow_mut_lamports()? = new_from;
    **to.try_borrow_mut_lamports()? = new_to;
    Ok(())
}
