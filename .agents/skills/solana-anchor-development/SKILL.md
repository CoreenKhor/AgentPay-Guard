---
name: solana-anchor-development
description: >-
  Use this skill when developing, testing, auditing, or deploying Solana smart contracts
  using the Anchor framework, with a focus on PDA derivation, account security, and fast testing.
---

# Solana Anchor Program Development

This skill provides best practices, account validation patterns, and testing procedures for developing high-security Solana smart contracts using the Anchor framework.

## 1. Core Architecture Principles

1. **Strict PDA Derivation & Seeds:**
   - Always validate seeds and bumps explicitly using `seeds = [...]` and `bump = ...` in the `#[derive(Accounts)]` struct.
   - Store the bump seed in the account struct during initialization to save compute units on subsequent calls instead of re-finding the PDA.

2. **Signer & Mutability Constraints:**
   - Minimize mutable accounts (`#[account(mut)]`) to only those modified during execution.
   - Ensure treasury vaults are program-owned PDAs with no private keys.
   - Separate administrative authorities from operational authorities (e.g., `admin` vs `sentinel`).

3. **Reentrancy and CPI Safety:**
   - Execute internal state transitions and balance deductions before invoking external CPIs (Cross-Program Invocations).
   - Use `anchor_lang::solana_program::program::invoke_signed` for CPI transfers from PDAs.

---

## 2. Standard Account Patterns for AgentPay Guard

### Vault Authority & State Accounts

```rust
use anchor_lang::prelude::*;

pub const MAX_ALLOWED_RECIPIENTS: usize = 16;

#[account]
#[derive(InitSpace)]
pub struct VaultAuthority {
    pub agent_owner: Pubkey,
    pub sentinel_key: Pubkey,
    pub bump: u8,
    pub is_frozen: bool,
    pub created_at: i64,
}

#[account]
#[derive(InitSpace)]
pub struct SpendingPolicy {
    pub vault: Pubkey,
    pub max_amount_per_tx: u64,
    pub daily_budget_lamports: u64,
    pub current_daily_spent: u64,
    pub last_spend_timestamp: i64,
    pub require_whitelist: bool,
    #[max_len(MAX_ALLOWED_RECIPIENTS)]
    pub allowed_recipients: Vec<Pubkey>,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct ExecutionReceipt {
    pub vault: Pubkey,
    pub session_id: [u8; 32],
    pub payload_hash: [u8; 32],
    pub recipient: Pubkey,
    pub amount_lamports: u64,
    pub timestamp: i64,
    pub bump: u8,
}
```

### Account Validation Struct for Settlement

```rust
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

    #[account(mut)]
    pub payer: Signer<'info>,

    pub system_program: Program<'info, System>,
}
```

### Circuit Breaker Freeze Handler

```rust
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
```

---

## 3. Testing Workflow & Node Test Runner

Run tests against the contract specification:

```typescript
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { PublicKey, Keypair } from "@solana/web3.js";

describe("agentpay-guard settlement and circuit breaker tests", () => {
  it("freezes vault when sentinel triggers circuit breaker", async () => {
    // Settle, Freeze and Unfreeze instruction tests
  });
});
```

---

## 4. Verification & Security Checklist

- [ ] All PDAs derive from static seeds combined with specific entity pubkeys.
- [ ] Every mutable account has appropriate authorization checks (`has_one` or `constraint`).
- [ ] No unconstrained `AccountInfo` without explicit comment and verification logic.
- [ ] System transfer CPIs from PDA use `seeds` with signer seeds: `&[&[b"vault", agent_key.as_ref(), &[bump]]]`
- [ ] Program deployed and verified with `anchor verify <program_id>`.
