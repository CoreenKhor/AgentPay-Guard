use anchor_lang::prelude::*;

#[error_code]
pub enum GuardError {
    #[msg("Vault is currently frozen by the emergency circuit breaker")]
    VaultFrozen,

    #[msg("Caller is not authorized as the registered sentinel")]
    UnauthorizedSentinel,

    #[msg("Caller is not authorized as the agent owner")]
    UnauthorizedOwner,

    #[msg("Requested transfer amount exceeds maximum single-transaction limit")]
    ExceedsPerTxLimit,

    #[msg("Requested transfer amount exceeds remaining 24-hour daily budget")]
    ExceedsDailyBudget,

    #[msg("Recipient address is not present in the allowed whitelist")]
    RecipientNotAllowed,

    #[msg("Payload hash cannot be zero/empty")]
    InvalidPayloadHash,

    #[msg("Recipient whitelist capacity exceeded")]
    WhitelistOverflow,

    #[msg("Insufficient vault lamports to disburse payment")]
    InsufficientVaultBalance,
}
