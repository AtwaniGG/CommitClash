use anchor_lang::prelude::*;
use anchor_lang::system_program::{self, Transfer};

use crate::errors::RpsError;
use crate::events::SolMatched;
use crate::state::*;

#[derive(Accounts)]
#[instruction(pool_id: u64)]
pub struct JoinSolAndMatch<'info> {
    #[account(mut)]
    pub player: Signer<'info>,

    #[account(seeds = [b"sol_config"], bump = sol_config.bump)]
    pub sol_config: Box<Account<'info, SolConfig>>,

    #[account(
        mut,
        seeds = [b"sol_pool", pool_id.to_le_bytes().as_ref()],
        bump = sol_pool.bump,
        constraint = sol_pool.queue_tail > sol_pool.queue_head @ RpsError::QueueEmpty,
    )]
    pub sol_pool: Box<Account<'info, SolPool>>,

    #[account(
        mut,
        close = head_player,
        seeds = [
            b"sol_entry",
            pool_id.to_le_bytes().as_ref(),
            sol_pool.queue_head.to_le_bytes().as_ref(),
        ],
        bump = head_entry.bump,
        constraint = head_entry.pool_id == pool_id @ RpsError::PoolMismatch,
    )]
    pub head_entry: Box<Account<'info, SolQueueEntry>>,

    /// CHECK: Must equal head_entry.player; receives lamports refunded on close.
    #[account(mut, address = head_entry.player @ RpsError::WrongQueueEntry)]
    pub head_player: AccountInfo<'info>,

    #[account(
        init,
        payer = player,
        space = SolMatch::SPACE,
        seeds = [
            b"sol_match",
            pool_id.to_le_bytes().as_ref(),
            sol_pool.next_match_id.to_le_bytes().as_ref(),
        ],
        bump,
    )]
    pub the_match: Box<Account<'info, SolMatch>>,

    #[account(
        init_if_needed,
        payer = player,
        space = SolPlayerStats::SPACE,
        seeds = [b"sol_player", player.key().as_ref()],
        bump,
    )]
    pub sol_player_stats: Box<Account<'info, SolPlayerStats>>,

    #[account(
        mut,
        seeds = [b"sol_vault", pool_id.to_le_bytes().as_ref()],
        bump = sol_pool.vault_bump,
    )]
    pub sol_vault: Box<Account<'info, SolVault>>,

    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<JoinSolAndMatch>,
    pool_id: u64,
    commitment: [u8; 32],
    session_key: Pubkey,
) -> Result<()> {
    let player_b = ctx.accounts.player.key();
    let player_a = ctx.accounts.head_entry.player;
    let session_a = ctx.accounts.head_entry.session_key;
    require!(session_key != player_b, RpsError::InvalidSigner);
    require!(session_key != player_a, RpsError::InvalidSigner);
    require!(session_key != session_a, RpsError::InvalidSigner);
    require!(session_a != player_b, RpsError::InvalidSigner);

    let entry_amount = ctx.accounts.sol_pool.entry_amount;

    system_program::transfer(
        CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            Transfer {
                from: ctx.accounts.player.to_account_info(),
                to: ctx.accounts.sol_vault.to_account_info(),
            },
        ),
        entry_amount,
    )?;

    let head = &ctx.accounts.head_entry;
    let head_player = head.player;
    let head_session_key = head.session_key;
    let head_commitment = head.commitment;

    let the_match = &mut ctx.accounts.the_match;
    let pool = &mut ctx.accounts.sol_pool;

    the_match.pool_id = pool_id;
    the_match.match_id = pool.next_match_id;
    the_match.player_a = head_player;
    the_match.session_key_a = head_session_key;
    the_match.commitment_a = head_commitment;
    the_match.reveal_a = None;
    the_match.player_b = ctx.accounts.player.key();
    the_match.session_key_b = session_key;
    the_match.commitment_b = commitment;
    the_match.reveal_b = None;
    the_match.pot = entry_amount
        .checked_mul(2)
        .ok_or(RpsError::MathOverflow)?;
    the_match.state = MatchState::AwaitingReveals;
    the_match.slot_matched = Clock::get()?.slot;
    the_match.bump = ctx.bumps.the_match;

    let stats = &mut ctx.accounts.sol_player_stats;
    if stats.player == Pubkey::default() {
        stats.player = ctx.accounts.player.key();
        stats.bump = ctx.bumps.sol_player_stats;
    }

    pool.queue_head = pool.queue_head.checked_add(1).ok_or(RpsError::MathOverflow)?;
    pool.next_match_id = pool
        .next_match_id
        .checked_add(1)
        .ok_or(RpsError::MathOverflow)?;

    emit!(SolMatched {
        pool_id,
        match_id: the_match.match_id,
        player_a: the_match.player_a,
        player_b: the_match.player_b,
        pot: the_match.pot,
    });
    Ok(())
}
