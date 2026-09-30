use anchor_lang::prelude::*;

pub mod errors;
pub mod events;
pub mod instructions;
pub mod state;

use instructions::*;

declare_id!("APGuard111111111111111111111111111111111111");

#[program]
pub mod agentpay_guard {
    use super::*;

    /// Initialize an agent treasury vault PDA with authorized sentinel and spending policies
    pub fn initialize_vault(
        ctx: Context<InitializeVault>,
        sentinel_key: Pubkey,
        max_amount_per_tx: u64,
        daily_budget_lamports: u64,
        allowed_recipients: Vec<Pubkey>,
        require_whitelist: bool,
    ) -> Result<()> {
        instructions::handle_initialize_vault(
            ctx,
            sentinel_key,
            max_amount_per_tx,
            daily_budget_lamports,
            allowed_recipients,
            require_whitelist,
        )
    }

    /// Update spending limits, rolling budgets, or allowed recipient whitelists
    pub fn update_policy(
        ctx: Context<UpdatePolicy>,
        max_amount_per_tx: Option<u64>,
        daily_budget_lamports: Option<u64>,
        allowed_recipients: Option<Vec<Pubkey>>,
        require_whitelist: Option<bool>,
    ) -> Result<()> {
        instructions::handle_update_policy(
            ctx,
            max_amount_per_tx,
            daily_budget_lamports,
            allowed_recipients,
            require_whitelist,
        )
    }

    /// Settle verified payment atomically, enforce policies, write ExecutionReceipt PDA, and disburse lamports
    pub fn settle_payment(
        ctx: Context<SettlePayment>,
        session_id: [u8; 32],
        payload_hash: [u8; 32],
        amount_lamports: u64,
    ) -> Result<()> {
        instructions::handle_settle_payment(ctx, session_id, payload_hash, amount_lamports)
    }

    /// Emergency circuit breaker trigger: freeze vault immediately (callable by sentinel or owner)
    pub fn freeze_vault(ctx: Context<FreezeVault>) -> Result<()> {
        instructions::handle_freeze_vault(ctx)
    }

    /// Unfreeze vault to resume autonomous settlements (callable strictly by agent owner)
    pub fn unfreeze_vault(ctx: Context<UnfreezeVault>) -> Result<()> {
        instructions::handle_unfreeze_vault(ctx)
    }
}
