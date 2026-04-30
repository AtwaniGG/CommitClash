use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::errors::RpsError;
use crate::events::QueueJoined;
use crate::state::*;

#[derive(Accounts)]
#[instruction(pool_id: u64)]
pub struct JoinSolo<'info> {
    #[account(mut)]
    pub player: Signer<'info>,

    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, Config>,

    #[account(
        mut,
        seeds = [b"pool", pool_id.to_le_bytes().as_ref()],
        bump = pool.bump,
        constraint = pool.queue_head == pool.queue_tail @ RpsError::QueueNotEmpty,
    )]
    pub pool: Account<'info, Pool>,

    #[account(
        init,
        payer = player,
        space = QueueEntry::SPACE,
        seeds = [
            b"entry",
            pool_id.to_le_bytes().as_ref(),
            pool.queue_tail.to_le_bytes().as_ref(),
        ],
        bump,
    )]
    pub queue_entry: Account<'info, QueueEntry>,

    #[account(
        init_if_needed,
        payer = player,
        space = PlayerStats::SPACE,
        seeds = [b"player", player.key().as_ref()],
        bump,
    )]
    pub player_stats: Account<'info, PlayerStats>,

    #[account(
        mut,
        constraint = player_token_account.mint == config.mint @ RpsError::Unauthorized,
        constraint = player_token_account.owner == player.key() @ RpsError::Unauthorized,
    )]
    pub player_token_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [b"vault", pool_id.to_le_bytes().as_ref()],
        bump = pool.vault_bump,
    )]
    pub vault: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn handler(
    ctx: Context<JoinSolo>,
    pool_id: u64,
    commitment: [u8; 32],
    session_key: Pubkey,
) -> Result<()> {
    // H1: session key must not collide with the joiner's own wallet, otherwise
    // the reveal-side classifier in `reveal::handler` becomes ambiguous.
    require!(
        session_key != ctx.accounts.player.key(),
        RpsError::InvalidSigner
    );

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

    let entry = &mut ctx.accounts.queue_entry;
    entry.pool_id = pool_id;
    entry.index = ctx.accounts.pool.queue_tail;
    entry.player = ctx.accounts.player.key();
    entry.session_key = session_key;
    entry.commitment = commitment;
    entry.slot_joined = Clock::get()?.slot;
    entry.bump = ctx.bumps.queue_entry;

    let player_stats = &mut ctx.accounts.player_stats;
    if player_stats.player == Pubkey::default() {
        player_stats.player = ctx.accounts.player.key();
        player_stats.bump = ctx.bumps.player_stats;
    }

    let pool = &mut ctx.accounts.pool;
    pool.queue_tail = pool
        .queue_tail
        .checked_add(1)
        .ok_or(RpsError::MathOverflow)?;

    emit!(QueueJoined {
        pool_id,
        entry_index: entry.index,
        player: entry.player,
        commitment,
    });
    Ok(())
}
