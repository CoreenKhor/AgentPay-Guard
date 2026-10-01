---
name: paybind-intent-protocol
description: >-
  Use this skill when implementing cryptographic intent binding, payload hashing (BLAKE3/SHA-256),
  and atomic settlement verification between AI agents and external service providers.
---

# PayBind Intent Protocol Specification

The PayBind Engine creates an unbreakable cryptographic link between an agent's financial disbursement and the exact service payload it expects in return.

## 1. Problem Mitigation: Resource Substitution & Replay

In standard agent transactions:
```
Agent pays 0.05 SOL to Provider -> Provider returns arbitrary data (or cached stale response)
```
There is zero cryptographic proof linking the transferred tokens to the delivered data.

With PayBind:
```
1. Provider issues signed Quotation Manifest { resource_id, expected_hash, cost, expiry }
2. AgentPay Guard binds settlement instruction to H(Quotation Manifest)
3. Solana contract commits H(Quotation Manifest) into ExecutionReceipt PDA
4. Provider releases Resource Payload
5. Agent verifies H(Delivered Payload) == Expected Hash before accepting
```

---

## 2. Canonical Payload Serialization & Hashing

To ensure cross-language determinism between TypeScript (SDK), Python (Agent), and Rust (Solana Program):

1. **JSON Canonicalization (RFC 8785):**
   Keys must be sorted lexicographically, floats formatted according to standard ECMAScript rules, and whitespace removed.

2. **Digest Computation:**
   Use BLAKE3 (or SHA-256 for native Solana compatibility):

```typescript
import {
  createPayBindManifest,
  canonicalizeJson,
  computeSha256Hex,
  computeBlake3Hex,
  PayBindManifest,
} from "@agentpay-guard/paybind-core";

export function generatePayBindDigest(manifest: PayBindManifest): { sha256: string; blake3: string } {
  const canonicalString = canonicalizeJson(manifest);
  return {
    sha256: computeSha256Hex(canonicalString),
    blake3: computeBlake3Hex(canonicalString),
  };
}
```

---

## 3. On-Chain Verification Logic

The Anchor program must confirm that the payload hash logged in the instruction matches the hash bound to the agent session:

```rust
pub fn bind_and_settle(
    ctx: Context<SettlePayment>,
    session_id: [u8; 32],
    payload_hash: [u8; 32],
    amount: u64,
) -> Result<()> {
    let receipt = &mut ctx.accounts.receipt;
    receipt.session_id = session_id;
    receipt.payload_hash = payload_hash;
    receipt.recipient = ctx.accounts.recipient.key();
    receipt.amount_lamports = amount;
    receipt.timestamp = Clock::get()?.unix_timestamp;

    // Execute transfer via PDA signer seeds
    // ...
    Ok(())
}
```

---

## 4. Implementation Checklist

- [ ] Canonical serialization conforms strictly to RFC 8785 (no arbitrary whitespace or unsorted keys).
- [ ] Nonces or blockhash timeouts are included in manifests to eliminate receipt replay attacks.
- [ ] Program Derived Address for receipts incorporates both `vault_pubkey` and `session_id`.
- [ ] Agent runtime rejects service responses if the hash of the delivered payload does not match the registered PayBind digest.
