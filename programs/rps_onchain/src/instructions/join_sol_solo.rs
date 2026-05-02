use anchor_lang::prelude::*;
use anchor_lang::system_program::{self, Transfer};

use crate::errors::RpsError;
use crate::events::SolQueueJoined;
use crate::state::*;

#[derive(Accounts)]
#[instruction(pool_id: u64)]
pub struct JoinSolSolo<'info> {
    #[account(mut)]
    pub player: Signer<'info>,

    #[account(seeds = [b"sol_config"], bump = sol_config.bump)]
    pub sol_config: Account<'info, SolConfig>,

    #[account(
        mut,
        seeds = [b"sol_pool", pool_id.to_le_bytes().as_ref()],
        bump = sol_pool.bump,
        constraint = sol_pool.queue_head == sol_pool.queue_tail @ RpsError::QueueNotEmpty,
    )]
    pub sol_pool: Account<'info, SolPool>,

    #[account(
        init,
        payer = player,
        space = SolQueueEntry::SPACE,
        seeds = [
            b"sol_entry",
            pool_id.to_le_bytes().as_ref(),
            sol_pool.queue_tail.to_le_bytes().as_ref(),
        ],
        bump,
    )]
    pub sol_queue_entry: Account<'info, SolQueueEntry>,

    #[account(
        init_if_needed,
        payer = player,
        space = SolPlayerStats::SPACE,
        seeds = [b"sol_player", player.key().as_ref()],
        bump,
    )]
    pub sol_player_stats: Account<'info, SolPlayerStats>,

    #[account(
        mut,
        seeds = [b"sol_vault", pool_id.to_le_bytes().as_ref()],
        bump = sol_pool.vault_bump,
    )]
    pub sol_vault: Account<'info, SolVault>,

    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<JoinSolSolo>,
    pool_id: u64,
    commitment: [u8; 32],
    session_key: Pubkey,
) -> Result<()> {
    require!(
        session_key != ctx.accounts.player.key(),
        RpsError::InvalidSigner
    );

    let entry_amount = ctx.accounts.sol_pool.entry_amount;

    // Player → SolVault transfer. Player wallet is owned by SystemProgram so
    // SystemProgram::transfer with player as source signer is valid.
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

    let entry = &mut ctx.accounts.sol_queue_entry;
    entry.pool_id = pool_id;
    entry.index = ctx.accounts.sol_pool.queue_tail;
    entry.player = ctx.accounts.player.key();
    entry.session_key = session_key;
    entry.commitment = commitment;
    entry.slot_joined = Clock::get()?.slot;
    entry.bump = ctx.bumps.sol_queue_entry;

    let stats = &mut ctx.accounts.sol_player_stats;
    if stats.player == Pubkey::default() {
        stats.player = ctx.accounts.player.key();
        stats.bump = ctx.bumps.sol_player_stats;
    }

    let pool = &mut ctx.accounts.sol_pool;
    pool.queue_tail = pool
        .queue_tail
        .checked_add(1)
        .ok_or(RpsError::MathOverflow)?;

    emit!(SolQueueJoined {
        pool_id,
        entry_index: entry.index,
        player: entry.player,
        commitment,
    });
    Ok(())
}
