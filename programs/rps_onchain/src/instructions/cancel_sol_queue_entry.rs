use anchor_lang::prelude::*;

use crate::errors::RpsError;
use crate::events::SolEntryCancelled;
use crate::instructions::reveal_sol::pay_lamports;
use crate::state::*;

#[derive(Accounts)]
#[instruction(pool_id: u64)]
pub struct CancelSolQueueEntry<'info> {
    pub caller: Signer<'info>,

    #[account(seeds = [b"sol_config"], bump = sol_config.bump)]
    pub sol_config: Account<'info, SolConfig>,

    #[account(
        mut,
        seeds = [b"sol_pool", pool_id.to_le_bytes().as_ref()],
        bump = sol_pool.bump,
        constraint = sol_pool.queue_tail > sol_pool.queue_head @ RpsError::QueueEmpty,
    )]
    pub sol_pool: Account<'info, SolPool>,

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
    pub head_entry: Account<'info, SolQueueEntry>,

    /// CHECK: Must equal head_entry.player. Receives lamports refunded on close + the entry stake.
    #[account(mut, address = head_entry.player @ RpsError::WrongQueueEntry)]
    pub head_player: AccountInfo<'info>,

    #[account(
        mut,
        seeds = [b"sol_vault", pool_id.to_le_bytes().as_ref()],
        bump = sol_pool.vault_bump,
    )]
    pub sol_vault: Account<'info, SolVault>,
}

pub fn handler(ctx: Context<CancelSolQueueEntry>, pool_id: u64) -> Result<()> {
    let now = Clock::get()?.slot;
    let elapsed = now.saturating_sub(ctx.accounts.head_entry.slot_joined);
    require!(
        elapsed > ctx.accounts.sol_config.reveal_timeout_slots,
        RpsError::TimeoutNotReached
    );

    let entry_amount = ctx.accounts.sol_pool.entry_amount;
    let entry_index = ctx.accounts.head_entry.index;
    let player = ctx.accounts.head_entry.player;

    pay_lamports(
        &ctx.accounts.sol_vault.to_account_info(),
        &ctx.accounts.head_player,
        entry_amount,
    )?;

    let pool = &mut ctx.accounts.sol_pool;
    pool.queue_head = pool
        .queue_head
        .checked_add(1)
        .ok_or(RpsError::MathOverflow)?;

    emit!(SolEntryCancelled {
        pool_id,
        entry_index,
        player,
        refunded: entry_amount,
    });
    Ok(())
}
