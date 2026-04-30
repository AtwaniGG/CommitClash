use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::errors::RpsError;
use crate::events::Matched;
use crate::state::*;

#[derive(Accounts)]
#[instruction(pool_id: u64)]
pub struct JoinAndMatch<'info> {
    #[account(mut)]
    pub player: Signer<'info>,

    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,

    #[account(
        mut,
        seeds = [b"pool", pool_id.to_le_bytes().as_ref()],
        bump = pool.bump,
        constraint = pool.queue_tail > pool.queue_head @ RpsError::QueueEmpty,
    )]
    pub pool: Box<Account<'info, Pool>>,

    #[account(
        mut,
        close = head_player,
        seeds = [
            b"entry",
            pool_id.to_le_bytes().as_ref(),
            pool.queue_head.to_le_bytes().as_ref(),
        ],
        bump = head_entry.bump,
        constraint = head_entry.pool_id == pool_id @ RpsError::PoolMismatch,
    )]
    pub head_entry: Box<Account<'info, QueueEntry>>,

    /// CHECK: Must equal head_entry.player; receives lamports refunded on QueueEntry close.
    #[account(mut, address = head_entry.player @ RpsError::WrongQueueEntry)]
    pub head_player: AccountInfo<'info>,

    #[account(
        init,
        payer = player,
        space = Match::SPACE,
        seeds = [
            b"match",
            pool_id.to_le_bytes().as_ref(),
            pool.next_match_id.to_le_bytes().as_ref(),
        ],
        bump,
    )]
    pub the_match: Box<Account<'info, Match>>,

    #[account(
        init_if_needed,
        payer = player,
        space = PlayerStats::SPACE,
        seeds = [b"player", player.key().as_ref()],
        bump,
    )]
    pub player_stats: Box<Account<'info, PlayerStats>>,

    #[account(
        mut,
        constraint = player_token_account.mint == config.mint @ RpsError::Unauthorized,
        constraint = player_token_account.owner == player.key() @ RpsError::Unauthorized,
    )]
    pub player_token_account: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        seeds = [b"vault", pool_id.to_le_bytes().as_ref()],
        bump = pool.vault_bump,
    )]
    pub vault: Box<Account<'info, TokenAccount>>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn handler(
    ctx: Context<JoinAndMatch>,
    pool_id: u64,
    commitment: [u8; 32],
    session_key: Pubkey,
) -> Result<()> {
    // H1: enforce that all four key slots (player_a, session_a, player_b, session_b)
    // are pairwise distinct, so the reveal-side classifier is unambiguous.
    let player_b = ctx.accounts.player.key();
    let player_a = ctx.accounts.head_entry.player;
    let session_a = ctx.accounts.head_entry.session_key;
    require!(session_key != player_b, RpsError::InvalidSigner);
    require!(session_key != player_a, RpsError::InvalidSigner);
    require!(session_key != session_a, RpsError::InvalidSigner);
    // B can also catch the case where A pre-emptively set session_a == player_b.
    require!(session_a != player_b, RpsError::InvalidSigner);

    let entry_amount = ctx.accounts.pool.entry_amount;

    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.player_token_account.to_account_info(),
                to: ctx.accounts.vault.to_account_info(),
                authority: ctx.accounts.player.to_account_info(),
            },
        ),
        entry_amount,
    )?;

    let head = &ctx.accounts.head_entry;
    let head_player = head.player;
    let head_session_key = head.session_key;
    let head_commitment = head.commitment;

    let the_match = &mut ctx.accounts.the_match;
    let pool = &mut ctx.accounts.pool;

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

    let player_stats = &mut ctx.accounts.player_stats;
    if player_stats.player == Pubkey::default() {
        player_stats.player = ctx.accounts.player.key();
        player_stats.bump = ctx.bumps.player_stats;
    }

    pool.queue_head = pool
        .queue_head
        .checked_add(1)
        .ok_or(RpsError::MathOverflow)?;
    pool.next_match_id = pool
        .next_match_id
        .checked_add(1)
        .ok_or(RpsError::MathOverflow)?;

    emit!(Matched {
        pool_id,
        match_id: the_match.match_id,
        player_a: the_match.player_a,
        player_b: the_match.player_b,
        pot: the_match.pot,
    });
    Ok(())
}
