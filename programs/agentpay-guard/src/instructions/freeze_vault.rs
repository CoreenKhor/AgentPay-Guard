use crate::errors::GuardError;
use crate::events::VaultFrozenEvent;
use crate::state::VaultAuthority;
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct FreezeVault<'info> {
    #[account(
        mut,
        seeds = [VaultAuthority::SEED_PREFIX, vault.agent_owner.as_ref()],
        bump = vault.bump,
        constraint = (
            caller.key() == vault.sentinel_key || caller.key() == vault.agent_owner
        ) @ GuardError::UnauthorizedSentinel,
    )]
    pub vault: Account<'info, VaultAuthority>,

    pub caller: Signer<'info>,
}

pub fn handle_freeze_vault(ctx: Context<FreezeVault>) -> Result<()> {
    let vault = &mut ctx.accounts.vault;
    vault.is_frozen = true;

    let clock = Clock::get()?;
    emit!(VaultFrozenEvent {
        vault: vault.key(),
        triggered_by: ctx.accounts.caller.key(),
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}
