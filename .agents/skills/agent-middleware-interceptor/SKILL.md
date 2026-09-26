---
name: agent-middleware-interceptor
description: >-
  Use this skill when developing runtime middleware, tool call interceptors, or proxy layers
  for autonomous agent frameworks such as LangChain, ElizaOS, or the Solana Agent Kit.
---

# Agent Runtime Middleware & Interceptor Architecture

The AgentPay Guard Interceptor intercepts proposed economic actions generated during agent tool calls or reasoning iterations, executing verification checks before any on-chain transaction is broadcast.

## 1. Interceptor Lifecycle & Hook Points

```
+-----------------------------------------------------------------------+
| 1. AGENT TOOL INVOCATION                                              |
|    Agent calls `pay_service({ provider: "...", amount: 0.05 })`       |
+-----------------------------------------------------------------------+
                                  |
                                  v
+-----------------------------------------------------------------------+
| 2. INTERCEPTOR PRE-FLIGHT                                             |
|    - Intercept tool call before reaching Solana Web3 provider         |
|    - Parse intended recipient, amount, and service payload metadata   |
+-----------------------------------------------------------------------+
                                  |
                                  v
+-----------------------------------------------------------------------+
| 3. POLICY & SENTINEL EVALUATION                                       |
|    - Check Anomaly Sentinel velocity (sliding window)                 |
|    - Check Deterministic Policy (per-tx ceiling, daily spend budget)  |
|    - Compute PayBind payload digest                                   |
+-----------------------------------------------------------------------+
                                  |
         +------------------------+------------------------+
         |                                                 |
         v (Pass)                                          v (Breach)
+-----------------------------------+     +-----------------------------------+
| 4. ASSEMBLE TRANSACTION           |     | 4. EMERGENCY CIRCUIT BREAKER      |
|    - Build Anchor instruction     |     |    - Reject tool execution        |
|    - Pass to PDA signing pipeline |     |    - Dispatch freeze instruction  |
|    - Broadcast to Solana cluster  |     |    - Alert operator dashboard     |
+-----------------------------------+     +-----------------------------------+
```

---

## 2. Implementing an Interceptor for ElizaOS / LangChain

### TypeScript Middleware Adapter Pattern

```typescript
import { Transaction, VersionedTransaction } from "@solana/web3.js";

export interface PolicyCheckResult {
  allowed: boolean;
  reason?: string;
  requiresHITL?: boolean;
}

export class AgentPayGuardInterceptor {
  constructor(
    private policyEngine: DeterministicPolicyEngine,
    private sentinel: AnomalySentinelClient,
    private vaultProgram: AgentPayGuardProgramClient
  ) {}

  /**
   * Intercepts a proposed transaction before signing
   */
  async interceptTransaction(
    agentId: string,
    proposedTx: Transaction | VersionedTransaction,
    metadata: { endpoint: string; servicePayload: any }
  ): Promise<{ signature?: string; rejected: boolean; error?: string }> {
    // 1. Analyze velocity heuristics
    const velocityStatus = await this.sentinel.recordAndEvaluate(agentId, proposedTx);
    if (velocityStatus.isAnomalous) {
      await this.vaultProgram.triggerEmergencyFreeze(agentId, velocityStatus.reason);
      return { rejected: true, error: `Circuit breaker tripped: ${velocityStatus.reason}` };
    }

    // 2. Validate spending policies
    const policyResult = await this.policyEngine.evaluate(proposedTx);
    if (!policyResult.allowed) {
      if (policyResult.requiresHITL) {
        return await this.routeToHITL(agentId, proposedTx, metadata);
      }
      return { rejected: true, error: `Policy violation: ${policyResult.reason}` };
    }

    // 3. Bind intent and execute via on-chain Financial Hub
    const signature = await this.vaultProgram.executeSettlement(proposedTx, metadata);
    return { signature, rejected: false };
  }

  private async routeToHITL(...) { /* Escalation webhook */ }
}
```

---

## 3. Tool Wrapping & Integration Guidelines

1. **Wrap At the Provider Layer:**
   - Instead of wrapping each tool individually, wrap the agent's Solana `Connection` or `WalletAdapter`.
   - Override `sendTransaction` or `signAndSendTransaction` so all programmatic paths are forced through the security kernel.

2. **Idempotency Keys:**
   - Attach a deterministic idempotency key to each intercepted tool call to protect against rapid client-side retries caused by network timeouts.

3. **Graceful Agent Error Handling:**
   - Return clear, non-lethal error strings to the LLM when transactions are rejected so the agent can replan (e.g., "Transaction exceeded single-query limit of 0.01 SOL. Request approved budget escalation or select alternative provider.").
