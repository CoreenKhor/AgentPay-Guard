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

### Vault Authority & Policy State

```rust
use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct VaultAuthority {
    pub agent_owner: Pubkey,
    pub sentinel_key: Pubkey,
    pub bump: u8,
    pub is_frozen: bool,
    pub daily_spend_limit_lamports: u64,
    pub current_daily_spent: u64,
    pub last_spend_timestamp: i64,
}

#[account]
#[derive(InitSpace)]
pub struct ExecutionReceipt {
    pub session_id: [u8; 32],
    pub payload_hash: [u8; 32],
    pub recipient: Pubkey,
    pub amount_lamports: u64,
    pub timestamp: i64,
}
```

### Account Validation Struct for Settlement

```rust
#[derive(Accounts)]
#[instruction(session_id: [u8; 32], payload_hash: [u8; 32], amount: u64)]
pub struct SettlePayment<'info> {
    #[account(
        mut,
        seeds = [b"vault", vault.agent_owner.as_ref()],
        bump = vault.bump,
        constraint = !vault.is_frozen @ GuardError::VaultFrozen,
    )]
    pub vault: Account<'info, VaultAuthority>,

    /// CHECK: Recipient account verified against spending policy allowlist
    #[account(mut)]
    pub recipient: AccountInfo<'info>,

    #[account(
        init,
        payer = payer,
        space = 8 + ExecutionReceipt::INIT_SPACE,
        seeds = [b"receipt", vault.key().as_ref(), session_id.as_ref()],
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
        seeds = [b"vault", vault.agent_owner.as_ref()],
        bump = vault.bump,
        has_one = sentinel_key @ GuardError::UnauthorizedSentinel
    )]
    pub vault: Account<'info, VaultAuthority>,

    pub sentinel_key: Signer<'info>,
}

pub fn handle_freeze_vault(ctx: Context<FreezeVault>) -> Result<()> {
    let vault = &mut ctx.accounts.vault;
    vault.is_frozen = true;
    emit!(VaultFrozenEvent {
        agent_owner: vault.agent_owner,
        timestamp: Clock::get()?.unix_timestamp,
    });
    Ok(())
}
```

---

## 3. Fast Testing Workflow (LiteSVM & Bankrun)

Avoid slow local validator boot times by utilizing `solana-bankrun` or `litesvm` for microsecond-level unit tests:

```typescript
import { startAnchor } from "solana-bankrun";
import { PublicKey } from "@solana/web3.js";

describe("agentpay-guard settlement tests", () => {
  it("freezes vault when sentinel triggers circuit breaker", async () => {
    const context = await startAnchor(".", [{ name: "agentpay_guard", programId }], []);
    const client = context.banksClient;
    
    // Execute freeze instruction
    // Assert vault.is_frozen === true
    // Verify subsequent settlement CPI fails with GuardError::VaultFrozen
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
