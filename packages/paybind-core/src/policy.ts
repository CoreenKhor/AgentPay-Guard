export type PolicyDecisionStatus = "APPROVED" | "REJECTED" | "HITL_REQUIRED";

export type RejectionCategory =
  | "ZERO_OR_NEGATIVE_AMOUNT"
  | "RECIPIENT_NOT_ALLOWED"
  | "PER_TX_LIMIT_EXCEEDED"
  | "DAILY_BUDGET_EXCEEDED"
  | "HITL_ESCALATION_REQUIRED";

export interface SpendingPolicyConfig {
  perTxLimitLamports: bigint;
  dailyBudgetLamports: bigint;
  hitlThresholdLamports: bigint;
  allowedRecipients: string[];
  requireAllowlist: boolean;
}

export interface PolicyEvaluationRequest {
  recipient: string;
  amountLamports: bigint;
  currentDailySpentLamports: bigint;
  toolName?: string;
}

export interface PolicyEvaluationResult {
  status: PolicyDecisionStatus;
  allowed: boolean;
  requiresHITL: boolean;
  reason: string;
  category?: RejectionCategory;
  amountLamports: bigint;
  recipient: string;
}

export class DeterministicPolicyEngine {
  private config: SpendingPolicyConfig;

  constructor(config: Partial<SpendingPolicyConfig> = {}) {
    this.config = {
      perTxLimitLamports: config.perTxLimitLamports ?? 100_000_000n, // 0.10 SOL
      dailyBudgetLamports: config.dailyBudgetLamports ?? 500_000_000n, // 0.50 SOL
      hitlThresholdLamports: config.hitlThresholdLamports ?? 50_000_000n, // 0.05 SOL
      allowedRecipients: config.allowedRecipients ? [...config.allowedRecipients] : [],
      requireAllowlist: config.requireAllowlist ?? true,
    };
  }

  public getConfig(): Readonly<SpendingPolicyConfig> {
    return { ...this.config, allowedRecipients: [...this.config.allowedRecipients] };
  }

  public updateConfig(newConfig: Partial<SpendingPolicyConfig>): void {
    this.config = {
      ...this.config,
      ...newConfig,
      allowedRecipients: newConfig.allowedRecipients
        ? [...newConfig.allowedRecipients]
        : this.config.allowedRecipients,
    };
  }

  public addAllowedRecipient(recipient: string): void {
    const normalized = recipient.trim();
    if (!this.config.allowedRecipients.some((r) => r.trim() === normalized)) {
      this.config.allowedRecipients.push(normalized);
    }
  }

  public removeAllowedRecipient(recipient: string): void {
    const normalized = recipient.trim();
    this.config.allowedRecipients = this.config.allowedRecipients.filter(
      (r) => r.trim() !== normalized
    );
  }

  public isRecipientAllowed(recipient: string): boolean {
    if (!this.config.requireAllowlist) return true;
    const normalized = recipient.trim();
    return this.config.allowedRecipients.some((r) => r.trim() === normalized);
  }

  /**
   * Deterministically evaluates a proposed economic action.
   * Explicitly differentiates between hard policy rejections and HITL-eligible escalations.
   */
  public evaluate(request: PolicyEvaluationRequest): PolicyEvaluationResult {
    const { recipient, amountLamports, currentDailySpentLamports } = request;

    // 1. Zero or negative amount check (Hard Rejection)
    if (amountLamports <= 0n) {
      return {
        status: "REJECTED",
        allowed: false,
        requiresHITL: false,
        category: "ZERO_OR_NEGATIVE_AMOUNT",
        reason: "Invalid transaction amount: must be strictly greater than zero",
        amountLamports,
        recipient,
      };
    }

    // 2. Strict Recipient Allowlist Check (Hard Rejection)
    if (this.config.requireAllowlist && !this.isRecipientAllowed(recipient)) {
      return {
        status: "REJECTED",
        allowed: false,
        requiresHITL: false,
        category: "RECIPIENT_NOT_ALLOWED",
        reason: `Recipient ${recipient} is not present in approved policy allowlist`,
        amountLamports,
        recipient,
      };
    }

    // 3. Single-Transaction Hard Cap (Hard Rejection)
    if (amountLamports > this.config.perTxLimitLamports) {
      return {
        status: "REJECTED",
        allowed: false,
        requiresHITL: false,
        category: "PER_TX_LIMIT_EXCEEDED",
        reason: `Transaction amount ${amountLamports} lamports exceeds maximum per-tx limit ${this.config.perTxLimitLamports} lamports`,
        amountLamports,
        recipient,
      };
    }

    // 4. Daily Cumulative Budget Check (Hard Rejection)
    const projectedDaily = currentDailySpentLamports + amountLamports;
    if (projectedDaily > this.config.dailyBudgetLamports) {
      return {
        status: "REJECTED",
        allowed: false,
        requiresHITL: false,
        category: "DAILY_BUDGET_EXCEEDED",
        reason: `Projected cumulative spend ${projectedDaily} lamports exceeds 24h rolling budget cap ${this.config.dailyBudgetLamports} lamports`,
        amountLamports,
        recipient,
      };
    }

    // 5. Human-in-the-Loop Threshold Check (HITL Escalation)
    if (amountLamports >= this.config.hitlThresholdLamports) {
      return {
        status: "HITL_REQUIRED",
        allowed: false,
        requiresHITL: true,
        category: "HITL_ESCALATION_REQUIRED",
        reason: `Transaction amount ${amountLamports} lamports meets or exceeds HITL threshold ${this.config.hitlThresholdLamports} lamports`,
        amountLamports,
        recipient,
      };
    }

    // 6. Approved under autonomous threshold
    return {
      status: "APPROVED",
      allowed: true,
      requiresHITL: false,
      reason: "Transaction passed all deterministic spending policy constraints",
      amountLamports,
      recipient,
    };
  }
}
