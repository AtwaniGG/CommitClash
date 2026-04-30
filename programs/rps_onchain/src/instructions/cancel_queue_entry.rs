use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::errors::RpsError;
use crate::events::EntryCancelled;
use crate::state::*;

/// Refunds the head of the queue if they've been waiting longer than the reveal timeout.
/// Permissionless: anyone may call to unblock the queue.
#[derive(Accounts)]
#[instruction(pool_id: u64)]
pub struct CancelQueueEntry<'info> {
    pub caller: Signer<'info>,

    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, Config>,

    #[account(
        mut,
        seeds = [b"pool", pool_id.to_le_bytes().as_ref()],
        bump = pool.bump,
        constraint = pool.queue_tail > pool.queue_head @ RpsError::QueueEmpty,
    )]
    pub pool: Account<'info, Pool>,

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
    pub head_entry: Account<'info, QueueEntry>,

    /// CHECK: Must equal head_entry.player. Receives lamports refunded on close.
    #[account(mut, address = head_entry.player @ RpsError::WrongQueueEntry)]
    pub head_player: AccountInfo<'info>,

    #[account(
        mut,
        seeds = [b"vault", pool_id.to_le_bytes().as_ref()],
        bump = pool.vault_bump,
    )]
    pub vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = head_player_token.mint == config.mint @ RpsError::Unauthorized,
        constraint = head_player_token.owner == head_entry.player @ RpsError::Unauthorized,
    )]
    pub head_player_token: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

pub fn handler(ctx: Context<CancelQueueEntry>, pool_id: u64) -> Result<()> {
    let now = Clock::get()?.slot;
    let elapsed = now.saturating_sub(ctx.accounts.head_entry.slot_joined);
    require!(
        elapsed > ctx.accounts.config.reveal_timeout_slots,
        RpsError::TimeoutNotReached
    );

    let entry_amount = ctx.accounts.pool.entry_amount;
    let entry_index = ctx.accounts.head_entry.index;
    let player = ctx.accounts.head_entry.player;

    let pool_id_bytes = pool_id.to_le_bytes();
    let pool_bump = ctx.accounts.pool.bump;
    let bump_slice = [pool_bump];
    let pool_seeds: &[&[u8]] = &[b"pool", pool_id_bytes.as_ref(), &bump_slice];
    let signer_seeds: &[&[&[u8]]] = &[pool_seeds];

    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.vault.to_account_info(),
                to: ctx.accounts.head_player_token.to_account_info(),
                authority: ctx.accounts.pool.to_account_info(),
            },
            signer_seeds,
        ),
        entry_amount,
    )?;

    let pool = &mut ctx.accounts.pool;
    pool.queue_head = pool
        .queue_head
        .checked_add(1)
        .ok_or(RpsError::MathOverflow)?;

    emit!(EntryCancelled {
        pool_id,
        entry_index,
        player,
        refunded: entry_amount,
    });
    Ok(())
}
