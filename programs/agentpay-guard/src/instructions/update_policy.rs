use crate::errors::GuardError;
use crate::events::PolicyUpdatedEvent;
use crate::state::{SpendingPolicy, VaultAuthority, MAX_ALLOWED_RECIPIENTS};
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct UpdatePolicy<'info> {
    #[account(
        seeds = [VaultAuthority::SEED_PREFIX, agent_owner.key().as_ref()],
        bump = vault.bump,
        has_one = agent_owner @ GuardError::UnauthorizedOwner,
    )]
    pub vault: Account<'info, VaultAuthority>,

    #[account(
        mut,
        seeds = [SpendingPolicy::SEED_PREFIX, vault.key().as_ref()],
        bump = policy.bump,
        has_one = vault,
    )]
    pub policy: Account<'info, SpendingPolicy>,

    pub agent_owner: Signer<'info>,
}

pub fn handle_update_policy(
    ctx: Context<UpdatePolicy>,
    max_amount_per_tx: Option<u64>,
    daily_budget_lamports: Option<u64>,
    allowed_recipients: Option<Vec<Pubkey>>,
    require_whitelist: Option<bool>,
) -> Result<()> {
    let policy = &mut ctx.accounts.policy;

    if let Some(max_limit) = max_amount_per_tx {
        policy.max_amount_per_tx = max_limit;
    }

    if let Some(daily_budget) = daily_budget_lamports {
        policy.daily_budget_lamports = daily_budget;
    }

    if let Some(recipients) = allowed_recipients {
        require!(
            recipients.len() <= MAX_ALLOWED_RECIPIENTS,
            GuardError::WhitelistOverflow
        );
        policy.allowed_recipients = recipients;
    }

    if let Some(req_whitelist) = require_whitelist {
        policy.require_whitelist = req_whitelist;
    }

    let clock = Clock::get()?;
    emit!(PolicyUpdatedEvent {
        vault: ctx.accounts.vault.key(),
        max_amount_per_tx: policy.max_amount_per_tx,
        daily_budget_lamports: policy.daily_budget_lamports,
        require_whitelist: policy.require_whitelist,
        allowed_recipients_count: policy.allowed_recipients.len() as u32,
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}
