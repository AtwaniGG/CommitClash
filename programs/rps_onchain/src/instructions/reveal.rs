use anchor_lang::prelude::*;
use anchor_spl::token::{self, Burn, Mint, Token, TokenAccount, Transfer};

use crate::errors::RpsError;
use crate::events::{Resolved, Revealed};
use crate::state::*;

#[derive(Accounts)]
#[instruction(pool_id: u64, match_id: u64)]
pub struct Reveal<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,

    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,

    #[account(
        mut,
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

pub fn handler(
    ctx: Context<Reveal>,
    pool_id: u64,
    _match_id: u64,
    move_value: u8,
    nonce: [u8; 32],
) -> Result<()> {
    require!(is_valid_move(move_value), RpsError::InvalidMove);

    let signer_key = ctx.accounts.signer.key();

    // Snapshot read-only fields needed for verification
    let player_a = ctx.accounts.the_match.player_a;
    let session_a = ctx.accounts.the_match.session_key_a;
    let commitment_a = ctx.accounts.the_match.commitment_a;
    let player_b = ctx.accounts.the_match.player_b;
    let session_b = ctx.accounts.the_match.session_key_b;
    let commitment_b = ctx.accounts.the_match.commitment_b;

    let is_a = signer_key == player_a || signer_key == session_a;
    let is_b = signer_key == player_b || signer_key == session_b;
    require!(is_a ^ is_b, RpsError::InvalidSigner);

    // Record the reveal
    {
        let m = &mut ctx.accounts.the_match;
        if is_a {
            require!(m.reveal_a.is_none(), RpsError::AlreadyRevealed);
            let expected = compute_commitment(move_value, &nonce, &player_a);
            require!(expected == commitment_a, RpsError::InvalidReveal);
            m.reveal_a = Some(move_value);
            emit!(Revealed {
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
            emit!(Revealed {
                pool_id,
                match_id: m.match_id,
                player: player_b,
                move_value,
            });
        }
    }

    // If both sides revealed, run resolution
    let move_a_opt = ctx.accounts.the_match.reveal_a;
    let move_b_opt = ctx.accounts.the_match.reveal_b;
    if let (Some(move_a), Some(move_b)) = (move_a_opt, move_b_opt) {
        do_resolve(ctx, pool_id, move_a, move_b)?;
    }

    Ok(())
}

fn do_resolve(
    ctx: Context<Reveal>,
    pool_id: u64,
    move_a: u8,
    move_b: u8,
) -> Result<()> {
    let outcome = compare_moves(move_a, move_b);
    let pot = ctx.accounts.the_match.pot;
    let burn_amount = pot / 8;
    let treasury_amount = pot / 8;
    let remaining = pot
        .checked_sub(burn_amount)
        .and_then(|v| v.checked_sub(treasury_amount))
        .ok_or(RpsError::MathOverflow)?;

    let (paid_a, paid_b) = match outcome {
        Outcome::PlayerAWins => (remaining, 0u64),
        Outcome::PlayerBWins => (0u64, remaining),
        Outcome::Tie => (remaining / 2, remaining / 2),
    };

    // CPI: burn 12.5% (decreases Mint.supply on-chain)
    let pool_id_bytes = pool_id.to_le_bytes();
    let pool_bump = ctx.accounts.pool.bump;
    let bump_slice = [pool_bump];
    let pool_seeds: &[&[u8]] = &[b"pool", pool_id_bytes.as_ref(), &bump_slice];
    let signer_seeds: &[&[&[u8]]] = &[pool_seeds];

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
        burn_amount,
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
        treasury_amount,
    )?;

    if paid_a > 0 {
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
    if paid_b > 0 {
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

    // Player stats — done via consuming ctx (no nested borrows)
    let entry_amount = pot / 2;
    let mut ctx = ctx;
    {
        let stats_a = &mut ctx.accounts.player_stats_a;
        stats_a.total_wagered = stats_a.total_wagered.saturating_add(entry_amount);
        stats_a.total_won = stats_a.total_won.saturating_add(paid_a);
    }
    {
        let stats_b = &mut ctx.accounts.player_stats_b;
        stats_b.total_wagered = stats_b.total_wagered.saturating_add(entry_amount);
        stats_b.total_won = stats_b.total_won.saturating_add(paid_b);
    }
    match outcome {
        Outcome::PlayerAWins => {
            {
                let s = &mut ctx.accounts.player_stats_a;
                s.wins = s.wins.saturating_add(1);
                s.current_streak = s.current_streak.saturating_add(1);
                if s.current_streak > s.best_streak {
                    s.best_streak = s.current_streak;
                }
            }
            let s = &mut ctx.accounts.player_stats_b;
            s.losses = s.losses.saturating_add(1);
            s.current_streak = 0;
        }
        Outcome::PlayerBWins => {
            {
                let s = &mut ctx.accounts.player_stats_b;
                s.wins = s.wins.saturating_add(1);
                s.current_streak = s.current_streak.saturating_add(1);
                if s.current_streak > s.best_streak {
                    s.best_streak = s.current_streak;
                }
            }
            let s = &mut ctx.accounts.player_stats_a;
            s.losses = s.losses.saturating_add(1);
            s.current_streak = 0;
        }
        Outcome::Tie => {
            ctx.accounts.player_stats_a.ties =
                ctx.accounts.player_stats_a.ties.saturating_add(1);
            ctx.accounts.player_stats_b.ties =
                ctx.accounts.player_stats_b.ties.saturating_add(1);
            // Streaks frozen — no modifications
        }
    }

    {
        let ps = &mut ctx.accounts.pool_stats;
        ps.rounds_played = ps.rounds_played.saturating_add(1);
        ps.volume = ps.volume.saturating_add(pot);
        ps.burned = ps.burned.saturating_add(burn_amount);
    }
    {
        let gs = &mut ctx.accounts.global_stats;
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

    emit!(Resolved {
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
