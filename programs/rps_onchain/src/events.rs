use anchor_lang::prelude::*;

#[event]
pub struct PoolInitialized {
    pub pool_id: u64,
    pub entry_amount: u64,
}

#[event]
pub struct QueueJoined {
    pub pool_id: u64,
    pub entry_index: u64,
    pub player: Pubkey,
    pub commitment: [u8; 32],
}

#[event]
pub struct Matched {
    pub pool_id: u64,
    pub match_id: u64,
    pub player_a: Pubkey,
    pub player_b: Pubkey,
    pub pot: u64,
}

#[event]
pub struct Revealed {
    pub pool_id: u64,
    pub match_id: u64,
    pub player: Pubkey,
    pub move_value: u8,
}

/// outcome: 0 = PlayerAWins, 1 = PlayerBWins, 2 = Tie
#[event]
pub struct Resolved {
    pub pool_id: u64,
    pub match_id: u64,
    pub player_a: Pubkey,
    pub player_b: Pubkey,
    pub move_a: u8,
    pub move_b: u8,
    pub outcome: u8,
    pub paid_a: u64,
    pub paid_b: u64,
    pub burned: u64,
    pub to_treasury: u64,
}

/// scenario: 0 = a_only_revealed, 1 = b_only_revealed, 2 = neither_revealed
#[event]
pub struct TimeoutResolved {
    pub pool_id: u64,
    pub match_id: u64,
    pub scenario: u8,
    pub paid_a: u64,
    pub paid_b: u64,
    pub burned: u64,
    pub to_treasury: u64,
}

#[event]
pub struct EntryCancelled {
    pub pool_id: u64,
    pub entry_index: u64,
    pub player: Pubkey,
    pub refunded: u64,
}
