use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct VaultAuthority {
    /// The master operator or agent key controlling the vault
    pub agent_owner: Pubkey,
    /// Authorized off-chain sentinel daemon allowed to trip emergency freeze
    pub sentinel_key: Pubkey,
    /// Canonical PDA bump seed for the vault
    pub bump: u8,
    /// Circuit-breaker freeze flag
    pub is_frozen: bool,
    /// Timestamp of vault initialization
    pub created_at: i64,
}

impl VaultAuthority {
    pub const SEED_PREFIX: &'static [u8] = b"vault";
}
