use anchor_lang::prelude::*;

pub const MAX_ALLOWED_RECIPIENTS: usize = 16;

#[account]
#[derive(InitSpace)]
pub struct SpendingPolicy {
    /// The associated VaultAuthority PDA
    pub vault: Pubkey,
    /// Maximum allowable single transaction in lamports
    pub max_amount_per_tx: u64,
    /// 24-hour total budget ceiling in lamports
    pub daily_budget_lamports: u64,
    /// Rolling volume spent in the current 24-hour window
    pub current_daily_spent: u64,
    /// Unix timestamp of the last spend / budget window epoch
    pub last_spend_timestamp: i64,
    /// If true, recipient must exist within allowed_recipients
    pub require_whitelist: bool,
    /// List of pre-approved recipient public keys (up to MAX_ALLOWED_RECIPIENTS)
    #[max_len(MAX_ALLOWED_RECIPIENTS)]
    pub allowed_recipients: Vec<Pubkey>,
    /// PDA bump seed
    pub bump: u8,
}

impl SpendingPolicy {
    pub const SEED_PREFIX: &'static [u8] = b"policy";
    pub const SECONDS_PER_DAY: i64 = 86_400;

    /// Refresh daily spent accumulator if 24 hours have elapsed
    pub fn refresh_daily_window(&mut self, current_time: i64) {
        if current_time - self.last_spend_timestamp >= Self::SECONDS_PER_DAY {
            self.current_daily_spent = 0;
            self.last_spend_timestamp = current_time;
        }
    }
}
