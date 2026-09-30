use anchor_lang::prelude::*;

#[event]
pub struct VaultInitializedEvent {
    pub vault: Pubkey,
    pub agent_owner: Pubkey,
    pub sentinel_key: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct PolicyUpdatedEvent {
    pub vault: Pubkey,
    pub max_amount_per_tx: u64,
    pub daily_budget_lamports: u64,
    pub require_whitelist: bool,
    pub allowed_recipients_count: u32,
    pub timestamp: i64,
}

#[event]
pub struct PaymentSettledEvent {
    pub vault: Pubkey,
    pub session_id: [u8; 32],
    pub payload_hash: [u8; 32],
    pub recipient: Pubkey,
    pub amount_lamports: u64,
    pub remaining_daily_budget: u64,
    pub timestamp: i64,
}

#[event]
pub struct VaultFrozenEvent {
    pub vault: Pubkey,
    pub triggered_by: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct VaultUnfrozenEvent {
    pub vault: Pubkey,
    pub restored_by: Pubkey,
    pub timestamp: i64,
}
