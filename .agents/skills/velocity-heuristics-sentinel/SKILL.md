---
name: velocity-heuristics-sentinel
description: >-
  Use this skill when designing, tuning, or implementing real-time velocity heuristics,
  sliding-window rate limiters, recursive loop detectors, and automated circuit breakers for autonomous agents.
---

# Anomaly Sentinel: Velocity Heuristics & Loop Detectors

The Anomaly Sentinel functions as a high-speed telemetry engine that evaluates transaction frequency, burst acceleration, and repeating parameter patterns to trap rogue agent behavior before severe balance leakage occurs.

## 1. Detection Heuristics & Mathematical Models

### 1. Sliding Window Velocity Tracker
Tracks transactions within discrete rolling time intervals:
- **Interval $T_1$ (10 seconds):** Burst protection. Maximum 3 micro-transactions.
- **Interval $T_2$ (60 seconds):** Acceleration protection. Maximum 15 micro-transactions.
- **Interval $T_3$ (1 hour):** Cumulative budget ceiling. Maximum 0.50 SOL.

### 2. Leaky Bucket Algorithm for Micro-Settlements
Maintains a virtual counter representing consumed capacity:
$$\text{CurrentLevel} = \max(0, \text{PreviousLevel} - (\Delta t \times \text{LeakRate})) + \text{Cost}_{\text{tx}}$$
If $\text{CurrentLevel} > \text{Capacity}$, the circuit breaker trips.

### 3. Reasoning Loop & Parameter Cycle Detector
Autonomous agents in an unhandled error state often repeat the exact same tool invocation with identical parameters:
- Maintain an LRU ring buffer of the last $N$ transaction hashes: $H(\text{recipient} \parallel \text{amount} \parallel \text{payload\_digest})$.
- If identical transaction fingerprints occur $\ge 3$ times within 30 seconds, classify the state as a **Recursive Execution Loop** and trigger an immediate freeze.

---

## 2. Sliding Window Implementation

```typescript
export interface VelocityRule {
  windowSeconds: number;
  maxTransactions: number;
  maxVolumeLamports: bigint;
}

export class SlidingWindowSentinel {
  private history: { timestamp: number; amount: bigint; hash: string }[] = [];

  constructor(private rules: VelocityRule[]) {}

  public recordAndCheck(amount: bigint, txFingerprint: string): { allowed: boolean; violation?: string } {
    const now = Date.now();
    this.history.push({ timestamp: now, amount, hash: txFingerprint });

    // Prune entries older than largest window
    const maxWindowMs = Math.max(...this.rules.map(r => r.windowSeconds)) * 1000;
    this.history = this.history.filter(entry => now - entry.timestamp <= maxWindowMs);

    // 1. Check for infinite identical loops
    const recentIdentical = this.history.filter(
      e => now - e.timestamp <= 30_000 && e.hash === txFingerprint
    );
    if (recentIdentical.length >= 3) {
      return { allowed: false, violation: "Recursive loop detected: 3 identical calls in 30s" };
    }

    // 2. Check sliding window rules
    for (const rule of this.rules) {
      const windowStart = now - (rule.windowSeconds * 1000);
      const entriesInWindow = this.history.filter(e => e.timestamp >= windowStart);

      if (entriesInWindow.length > rule.maxTransactions) {
        return {
          allowed: false,
          violation: `Frequency breach: ${entriesInWindow.length} txs in ${rule.windowSeconds}s (max: ${rule.maxTransactions})`
        };
      }

      const totalVolume = entriesInWindow.reduce((acc, curr) => acc + curr.amount, 0n);
      if (totalVolume > rule.maxVolumeLamports) {
        return {
          allowed: false,
          violation: `Volume breach: ${totalVolume} lamports in ${rule.windowSeconds}s (max: ${rule.maxVolumeLamports})`
        };
      }
    }

    return { allowed: true };
  }
}
```

---

## 3. Circuit Breaker Execution Strategy

When a heuristic is violated:
1. **Immediate In-Memory Block:** Interceptor rejects the tool call immediately.
2. **On-Chain Freeze Broadcast:** Sentinel service dispatches `agentpay_guard::freeze_vault` signed by `sentinel_key`.
3. **Escalation Notification:** Broadcasts a critical alert to Discord/Telegram/Dashboard with stack trace, agent ID, and offending instruction trace.
