use anchor_lang::prelude::*;

#[error_code]
pub enum RpsError {
    #[msg("Invalid move (must be 1=Rock, 2=Paper, 3=Scissors)")]
    InvalidMove,
    #[msg("Reveal does not match the registered commitment")]
    InvalidReveal,
    #[msg("This side has already revealed")]
    AlreadyRevealed,
    #[msg("Match is no longer in AwaitingReveals state")]
    MatchNotActive,
    #[msg("Reveal timeout has not elapsed yet")]
    TimeoutNotReached,
    #[msg("Caller is not authorized")]
    Unauthorized,
    #[msg("Signer is neither the player nor the registered session key for this match side")]
    InvalidSigner,
    #[msg("Queue is not empty (use join_and_match instead)")]
    QueueNotEmpty,
    #[msg("Queue is empty (use join_solo instead)")]
    QueueEmpty,
    #[msg("Wrong queue entry index passed")]
    WrongQueueEntry,
    #[msg("Entry amount must be a positive multiple of 4 so the pot splits cleanly into eighths")]
    InvalidEntryAmount,
    #[msg("Pool ID mismatch on supplied account")]
    PoolMismatch,
    #[msg("Match ID mismatch on supplied account")]
    MatchMismatch,
    #[msg("Math overflow")]
    MathOverflow,
}
