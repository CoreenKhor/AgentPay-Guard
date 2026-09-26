---
name: hitl-escalation-workflow
description: >-
  Use this skill when designing or implementing Human-in-the-Loop (HITL) approval workflows,
  escalation gateways, and time-bounded administrative signing callbacks for autonomous agents.
---

# Human-in-the-Loop (HITL) Escalation Architecture

For transactions that exceed autonomous threshold limits, involve unverified recipients, or exhibit unusual contextual parameters, AgentPay Guard suspends execution and requests human authorization.

## 1. Escalation Criteria Matrix

A transaction is routed to HITL if any of the following conditions trigger:
1. **Value Threshold:** Single transaction amount $\ge \text{HITL\_THRESHOLD}$ (e.g. $> 0.10$ SOL).
2. **Recipient Status:** Destination public key is not registered in the agent's verified whitelist.
3. **Velocity Warning:** Velocity heuristics exceed 75% of absolute circuit breaker limits.
4. **Context Shift:** Unfamiliar tool sequence or unexpected change in task session identifier.

---

## 2. Asynchronous Escalation Flow

```
Agent Proposed Tx ──> Policy Evaluator (Threshold Exceeded)
                            │
                            ▼
              Create Ephemeral Ticket (Pending)
              - Ticket ID: UUIDv4
              - Expiration: 180 seconds
              - Digest: SHA-256(TxParams)
                            │
                            ├──> Dispatch Alert (Telegram / Discord / Webhook)
                            │
                            ▼
                     Operator Action
                            │
         ┌──────────────────┴──────────────────┐
         ▼                                     ▼
    [APPROVE]                              [REJECT]
Operator signs digest with               Operator rejects or
authorized admin key                     ticket expires
         │                                     │
         ▼                                     ▼
Resume Tx execution                      Abort tool call &
& submit on-chain                        alert agent loop
```

---

## 3. Cryptographic Authorization Ticket

To prevent replay or tampering of human approvals, the approval payload must be signed by the registered human owner's keypair:

```typescript
export interface HumanApprovalTicket {
  ticketId: string;
  agentId: string;
  proposedTxHash: string; // SHA-256 of the exact transaction buffer
  approvedAtUnix: number;
  expiresAtUnix: number;
  operatorPubkey: string;
  signature: string; // Ed25519 signature over ticket fields
}
```

The on-chain or interceptor layer validates that:
- `ticket.expiresAtUnix > Date.now() / 1000`
- `ticket.proposedTxHash == sha256(proposedTx)`
- `verifySignature(ticket.operatorPubkey, ticket.signature)` matches an authorized operator.

---

## 4. UI / Notification Integration Checklist

- [ ] Alerts include plain-English summaries (Agent Name, Requested Amount, Target Service, Reason for Escalation).
- [ ] Direct "One-Click Approve" buttons authenticate the operator via Web3 wallet signature or secure OAuth session.
- [ ] Auto-timeout behavior: Expired tickets automatically default to a secure `REJECT` state.
