use crate::errors::GuardError;
use crate::events::VaultUnfrozenEvent;
use crate::state::VaultAuthority;
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct UnfreezeVault<'info> {
    #[account(
        mut,
        seeds = [VaultAuthority::SEED_PREFIX, agent_owner.key().as_ref()],
        bump = vault.bump,
        has_one = agent_owner @ GuardError::UnauthorizedOwner,
    )]
    pub vault: Account<'info, VaultAuthority>,

    pub agent_owner: Signer<'info>,
}

pub fn handle_unfreeze_vault(ctx: Context<UnfreezeVault>) -> Result<()> {
    let vault = &mut ctx.accounts.vault;
    vault.is_frozen = false;

    let clock = Clock::get()?;
    emit!(VaultUnfrozenEvent {
        vault: vault.key(),
        restored_by: ctx.accounts.agent_owner.key(),
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}
