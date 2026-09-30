use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct ExecutionReceipt {
    /// Associated VaultAuthority PDA
    pub vault: Pubkey,
    /// Unique session identifier preventing receipt replay
    pub session_id: [u8; 32],
    /// BLAKE3 or SHA-256 canonical hash of the intent payload
    pub payload_hash: [u8; 32],
    /// Settled recipient address
    pub recipient: Pubkey,
    /// Amount transferred in lamports
    pub amount_lamports: u64,
    /// Settlement execution timestamp
    pub timestamp: i64,
    /// PDA bump seed
    pub bump: u8,
}

impl ExecutionReceipt {
    pub const SEED_PREFIX: &'static [u8] = b"receipt";
}
