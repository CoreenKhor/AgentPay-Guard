use crate::errors::GuardError;
use crate::events::VaultInitializedEvent;
use crate::state::{SpendingPolicy, VaultAuthority, MAX_ALLOWED_RECIPIENTS};
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct InitializeVault<'info> {
    #[account(
        init,
        payer = agent_owner,
        space = 8 + VaultAuthority::INIT_SPACE,
        seeds = [VaultAuthority::SEED_PREFIX, agent_owner.key().as_ref()],
        bump
    )]
    pub vault: Account<'info, VaultAuthority>,

    #[account(
        init,
        payer = agent_owner,
        space = 8 + SpendingPolicy::INIT_SPACE,
        seeds = [SpendingPolicy::SEED_PREFIX, vault.key().as_ref()],
        bump
    )]
    pub policy: Account<'info, SpendingPolicy>,

    #[account(mut)]
    pub agent_owner: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handle_initialize_vault(
    ctx: Context<InitializeVault>,
    sentinel_key: Pubkey,
    max_amount_per_tx: u64,
    daily_budget_lamports: u64,
    allowed_recipients: Vec<Pubkey>,
    require_whitelist: bool,
) -> Result<()> {
    require!(
        allowed_recipients.len() <= MAX_ALLOWED_RECIPIENTS,
        GuardError::WhitelistOverflow
    );

    let clock = Clock::get()?;
    let current_timestamp = clock.unix_timestamp;

    let vault = &mut ctx.accounts.vault;
    vault.agent_owner = ctx.accounts.agent_owner.key();
    vault.sentinel_key = sentinel_key;
    vault.bump = ctx.bumps.vault;
    vault.is_frozen = false;
    vault.created_at = current_timestamp;

    let policy = &mut ctx.accounts.policy;
    policy.vault = vault.key();
    policy.max_amount_per_tx = max_amount_per_tx;
    policy.daily_budget_lamports = daily_budget_lamports;
    policy.current_daily_spent = 0;
    policy.last_spend_timestamp = current_timestamp;
    policy.require_whitelist = require_whitelist;
    policy.allowed_recipients = allowed_recipients;
    policy.bump = ctx.bumps.policy;

    emit!(VaultInitializedEvent {
        vault: vault.key(),
        agent_owner: vault.agent_owner,
        sentinel_key: vault.sentinel_key,
        timestamp: current_timestamp,
    });

    Ok(())
}
