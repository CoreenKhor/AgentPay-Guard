use crate::errors::GuardError;
use crate::events::PaymentSettledEvent;
use crate::state::{ExecutionReceipt, SpendingPolicy, VaultAuthority};
use anchor_lang::prelude::*;

#[derive(Accounts)]
#[instruction(session_id: [u8; 32], payload_hash: [u8; 32], amount_lamports: u64)]
pub struct SettlePayment<'info> {
    #[account(
        mut,
        seeds = [VaultAuthority::SEED_PREFIX, vault.agent_owner.as_ref()],
        bump = vault.bump,
        constraint = !vault.is_frozen @ GuardError::VaultFrozen,
    )]
    pub vault: Account<'info, VaultAuthority>,

    #[account(
        mut,
        seeds = [SpendingPolicy::SEED_PREFIX, vault.key().as_ref()],
        bump = policy.bump,
        has_one = vault,
    )]
    pub policy: Account<'info, SpendingPolicy>,

    /// CHECK: Target recipient account. Validated against whitelist if require_whitelist is enabled.
    #[account(mut)]
    pub recipient: AccountInfo<'info>,

    #[account(
        init,
        payer = payer,
        space = 8 + ExecutionReceipt::INIT_SPACE,
        seeds = [ExecutionReceipt::SEED_PREFIX, vault.key().as_ref(), session_id.as_ref()],
        bump
    )]
    pub receipt: Account<'info, ExecutionReceipt>,

    #[account(
        mut,
        constraint = (
            payer.key() == vault.agent_owner || payer.key() == vault.sentinel_key
        ) @ GuardError::UnauthorizedOwner,
    )]
    pub payer: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handle_settle_payment(
    ctx: Context<SettlePayment>,
    session_id: [u8; 32],
    payload_hash: [u8; 32],
    amount_lamports: u64,
) -> Result<()> {
    // 1. Verify payload hash is non-zero
    require!(payload_hash != [0u8; 32], GuardError::InvalidPayloadHash);

    // 2. Enforce single-transaction limit
    let policy = &mut ctx.accounts.policy;
    require!(
        amount_lamports <= policy.max_amount_per_tx,
        GuardError::ExceedsPerTxLimit
    );

    // 3. Enforce and refresh rolling 24-hour daily budget
    let clock = Clock::get()?;
    let current_timestamp = clock.unix_timestamp;
    policy.refresh_daily_window(current_timestamp);

    let new_daily_spent = policy
        .current_daily_spent
        .checked_add(amount_lamports)
        .ok_or(GuardError::ExceedsDailyBudget)?;

    require!(
        new_daily_spent <= policy.daily_budget_lamports,
        GuardError::ExceedsDailyBudget
    );
    policy.current_daily_spent = new_daily_spent;

    // 4. Enforce recipient whitelist if enabled
    if policy.require_whitelist {
        let recipient_key = ctx.accounts.recipient.key();
        require!(
            policy.allowed_recipients.contains(&recipient_key),
            GuardError::RecipientNotAllowed
        );
    }

    // 5. Verify vault balance and retain rent exemption
    let rent = Rent::get()?;
    let min_rent = rent.minimum_balance(8 + VaultAuthority::INIT_SPACE);
    let available_lamports = ctx
        .accounts
        .vault
        .to_account_info()
        .lamports()
        .saturating_sub(min_rent);

    require!(
        available_lamports >= amount_lamports,
        GuardError::InsufficientVaultBalance
    );

    // 6. Record immutable ExecutionReceipt
    let receipt = &mut ctx.accounts.receipt;
    receipt.vault = ctx.accounts.vault.key();
    receipt.session_id = session_id;
    receipt.payload_hash = payload_hash;
    receipt.recipient = ctx.accounts.recipient.key();
    receipt.amount_lamports = amount_lamports;
    receipt.timestamp = current_timestamp;
    receipt.bump = ctx.bumps.receipt;

    // 7. Atomic lamport transfer from Vault PDA to Recipient
    **ctx
        .accounts
        .vault
        .to_account_info()
        .try_borrow_mut_lamports()? -= amount_lamports;
    **ctx
        .accounts
        .recipient
        .to_account_info()
        .try_borrow_mut_lamports()? += amount_lamports;

    // 8. Emit PaymentSettledEvent
    let remaining_budget = policy
        .daily_budget_lamports
        .saturating_sub(policy.current_daily_spent);
    emit!(PaymentSettledEvent {
        vault: ctx.accounts.vault.key(),
        session_id,
        payload_hash,
        recipient: ctx.accounts.recipient.key(),
        amount_lamports,
        remaining_daily_budget: remaining_budget,
        timestamp: current_timestamp,
    });

    Ok(())
}
