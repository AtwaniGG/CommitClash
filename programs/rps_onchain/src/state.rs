use anchor_lang::prelude::*;

pub const ROCK: u8 = 1;
pub const PAPER: u8 = 2;
pub const SCISSORS: u8 = 3;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub enum MatchState {
    AwaitingReveals,
    Resolved,
    TimedOut,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub enum Outcome {
    PlayerAWins,
    PlayerBWins,
    Tie,
}

#[account]
pub struct Config {
    pub admin: Pubkey,
    pub mint: Pubkey,
    pub treasury: Pubkey,
    pub reveal_timeout_slots: u64,
    pub bump: u8,
}
impl Config {
    pub const SPACE: usize = 8 + 32 + 32 + 32 + 8 + 1;
}

#[account]
pub struct Pool {
    pub pool_id: u64,
    pub entry_amount: u64,
    pub queue_head: u64,
    pub queue_tail: u64,
    pub next_match_id: u64,
    pub vault_bump: u8,
    pub bump: u8,
}
impl Pool {
    pub const SPACE: usize = 8 + 8 + 8 + 8 + 8 + 8 + 1 + 1;
}

#[account]
pub struct QueueEntry {
    pub pool_id: u64,
    pub index: u64,
    pub player: Pubkey,
    pub session_key: Pubkey,
    pub commitment: [u8; 32],
    pub slot_joined: u64,
    pub bump: u8,
}
impl QueueEntry {
    pub const SPACE: usize = 8 + 8 + 8 + 32 + 32 + 32 + 8 + 1;
}

#[account]
pub struct Match {
    pub pool_id: u64,
    pub match_id: u64,
    pub player_a: Pubkey,
    pub session_key_a: Pubkey,
    pub commitment_a: [u8; 32],
    pub reveal_a: Option<u8>,
    pub player_b: Pubkey,
    pub session_key_b: Pubkey,
    pub commitment_b: [u8; 32],
    pub reveal_b: Option<u8>,
    pub pot: u64,
    pub state: MatchState,
    pub slot_matched: u64,
    pub bump: u8,
}
impl Match {
    // Option<u8> serialized = 1 (tag) + 1 (value) = 2 bytes; enum variants = 1 byte
    pub const SPACE: usize =
        8 + 8 + 8 + 32 + 32 + 32 + 2 + 32 + 32 + 32 + 2 + 8 + 1 + 8 + 1;
}

#[account]
pub struct GlobalStats {
    pub rounds_played: u64,
    pub total_burned: u64,
    pub total_to_treasury: u64,
    pub total_volume: u64,
    pub bump: u8,
}
impl GlobalStats {
    pub const SPACE: usize = 8 + 8 + 8 + 8 + 8 + 1;
}

#[account]
pub struct PoolStats {
    pub pool_id: u64,
    pub rounds_played: u64,
    pub volume: u64,
    pub burned: u64,
    pub bump: u8,
}
impl PoolStats {
    pub const SPACE: usize = 8 + 8 + 8 + 8 + 8 + 1;
}

#[account]
pub struct PlayerStats {
    pub player: Pubkey,
    pub wins: u64,
    pub losses: u64,
    pub ties: u64,
    pub current_streak: u32,
    pub best_streak: u32,
    pub total_wagered: u64,
    pub total_won: u64,
    pub bump: u8,
}
impl PlayerStats {
    pub const SPACE: usize = 8 + 32 + 8 + 8 + 8 + 4 + 4 + 8 + 8 + 1;
}

// ─── SOL parallel world ────────────────────────────────────────────────────
// Same FIFO + commit-reveal semantics as the RPS pools, but the entry,
// vault, and payout flows operate in raw lamports instead of SPL tokens.
// Accounts are kept fully separate so the existing RPS code is untouched.

#[account]
pub struct SolConfig {
    pub admin: Pubkey,
    pub sol_treasury: Pubkey,    // wallet pubkey, receives lamports directly
    pub sol_burn_wallet: Pubkey, // deployer wallet for off-chain RPS buyback+burn
    pub reveal_timeout_slots: u64,
    pub bump: u8,
}
impl SolConfig {
    pub const SPACE: usize = 8 + 32 + 32 + 32 + 8 + 1;
}

#[account]
pub struct SolPool {
    pub pool_id: u64,
    pub entry_amount: u64, // lamports
    pub queue_head: u64,
    pub queue_tail: u64,
    pub next_match_id: u64,
    pub vault_bump: u8,
    pub bump: u8,
}
impl SolPool {
    pub const SPACE: usize = 8 + 8 + 8 + 8 + 8 + 8 + 1 + 1;
}

/// Empty struct — only exists so the PDA has a discriminator and is owned by
/// the program. Lamports flow in via system_program::transfer (any owner can
/// receive) and out via direct lamports mutation (program-owned PDA can do this).
#[account]
pub struct SolVault {}
impl SolVault {
    pub const SPACE: usize = 8;
}

#[account]
pub struct SolQueueEntry {
    pub pool_id: u64,
    pub index: u64,
    pub player: Pubkey,
    pub session_key: Pubkey,
    pub commitment: [u8; 32],
    pub slot_joined: u64,
    pub bump: u8,
}
impl SolQueueEntry {
    pub const SPACE: usize = 8 + 8 + 8 + 32 + 32 + 32 + 8 + 1;
}

#[account]
pub struct SolMatch {
    pub pool_id: u64,
    pub match_id: u64,
    pub player_a: Pubkey,
    pub session_key_a: Pubkey,
    pub commitment_a: [u8; 32],
    pub reveal_a: Option<u8>,
    pub player_b: Pubkey,
    pub session_key_b: Pubkey,
    pub commitment_b: [u8; 32],
    pub reveal_b: Option<u8>,
    pub pot: u64,
    pub state: MatchState,
    pub slot_matched: u64,
    pub bump: u8,
}
impl SolMatch {
    pub const SPACE: usize =
        8 + 8 + 8 + 32 + 32 + 32 + 2 + 32 + 32 + 32 + 2 + 8 + 1 + 8 + 1;
}

#[account]
pub struct SolGlobalStats {
    pub rounds_played: u64,
    pub total_burned: u64,      // lamports routed to sol_burn_wallet
    pub total_to_treasury: u64, // lamports routed to sol_treasury
    pub total_volume: u64,
    pub bump: u8,
}
impl SolGlobalStats {
    pub const SPACE: usize = 8 + 8 + 8 + 8 + 8 + 1;
}

#[account]
pub struct SolPoolStats {
    pub pool_id: u64,
    pub rounds_played: u64,
    pub volume: u64,
    pub burned: u64,
    pub bump: u8,
}
impl SolPoolStats {
    pub const SPACE: usize = 8 + 8 + 8 + 8 + 8 + 1;
}

#[account]
pub struct SolPlayerStats {
    pub player: Pubkey,
    pub wins: u64,
    pub losses: u64,
    pub ties: u64,
    pub current_streak: u32,
    pub best_streak: u32,
    pub total_wagered: u64,
    pub total_won: u64,
    pub bump: u8,
}
impl SolPlayerStats {
    pub const SPACE: usize = 8 + 32 + 8 + 8 + 8 + 4 + 4 + 8 + 8 + 1;
}

pub fn is_valid_move(m: u8) -> bool {
    m == ROCK || m == PAPER || m == SCISSORS
}

pub fn compare_moves(a: u8, b: u8) -> Outcome {
    if a == b {
        return Outcome::Tie;
    }
    let a_wins = matches!(
        (a, b),
        (ROCK, SCISSORS) | (PAPER, ROCK) | (SCISSORS, PAPER)
    );
    if a_wins {
        Outcome::PlayerAWins
    } else {
        Outcome::PlayerBWins
    }
}

pub fn compute_commitment(move_value: u8, nonce: &[u8; 32], player: &Pubkey) -> [u8; 32] {
    let mut data = Vec::with_capacity(1 + 32 + 32);
    data.push(move_value);
    data.extend_from_slice(nonce);
    data.extend_from_slice(player.as_ref());
    anchor_lang::solana_program::keccak::hash(&data).to_bytes()
}
