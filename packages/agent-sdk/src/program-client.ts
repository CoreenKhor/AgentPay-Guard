import { PublicKey } from "@solana/web3.js";
import { createHash } from "node:crypto";

export const AGENTPAY_GUARD_PROGRAM_ID = new PublicKey(
  "Guard111111111111111111111111111111111111111"
);

export interface VaultAccountData {
  agentOwner: PublicKey;
  sentinelKey: PublicKey;
  bump: number;
  isFrozen: boolean;
  dailySpendLimitLamports: bigint;
  currentDailySpent: bigint;
  lastSpendTimestamp: number;
  totalDisbursedLamports: bigint;
  totalSettledTxs: number;
}

export interface PolicyAccountData {
  vault: PublicKey;
  perTxLimitLamports: bigint;
  dailyLimitLamports: bigint;
  hitlThresholdLamports: bigint;
  requireAllowlist: boolean;
  recipientCount: number;
  allowedRecipients: PublicKey[];
  bump: number;
}

export interface ExecutionReceiptData {
  sessionId: string;
  payloadHash: string;
  recipient: PublicKey;
  amountLamports: bigint;
  timestamp: number;
  bump: number;
}

/**
 * Derives the canonical Vault Authority PDA:
 * seeds = [b"vault", agent_owner.as_ref()]
 */
export function deriveVaultPda(
  agentOwner: PublicKey,
  programId: PublicKey = AGENTPAY_GUARD_PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("vault", "utf8"), agentOwner.toBuffer()],
    programId
  );
}

/**
 * Derives the canonical Spending Policy PDA:
 * seeds = [b"policy", vault.as_ref()]
 */
export function derivePolicyPda(
  vault: PublicKey,
  programId: PublicKey = AGENTPAY_GUARD_PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("policy", "utf8"), vault.toBuffer()],
    programId
  );
}

/**
 * Derives the canonical Execution Receipt PDA:
 * seeds = [b"receipt", vault.as_ref(), session_id]
 */
export function deriveReceiptPda(
  vault: PublicKey,
  sessionIdBytes: Uint8Array,
  programId: PublicKey = AGENTPAY_GUARD_PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("receipt", "utf8"), vault.toBuffer(), Buffer.from(sessionIdBytes)],
    programId
  );
}

/**
 * On-chain client & state simulator for AgentPay Guard Anchor program.
 * Validates PDA derivation, account security constraints, and settlement state.
 */
export class AgentPayGuardProgramClient {
  public vaults: Map<string, VaultAccountData> = new Map();
  public policies: Map<string, PolicyAccountData> = new Map();
  public receipts: Map<string, ExecutionReceiptData> = new Map();

  constructor(public programId: PublicKey = AGENTPAY_GUARD_PROGRAM_ID) {}

  /**
   * Initializes vault and policy PDAs for an agent owner.
   */
  public initializeVault(params: {
    agentOwner: PublicKey;
    sentinelKey: PublicKey;
    dailySpendLimitLamports: bigint;
    perTxLimitLamports: bigint;
    hitlThresholdLamports: bigint;
    requireAllowlist: boolean;
    allowedRecipients: PublicKey[];
  }): { vaultPubkey: PublicKey; policyPubkey: PublicKey } {
    const [vaultPubkey, vaultBump] = deriveVaultPda(params.agentOwner, this.programId);
    const [policyPubkey, policyBump] = derivePolicyPda(vaultPubkey, this.programId);

    const vaultData: VaultAccountData = {
      agentOwner: params.agentOwner,
      sentinelKey: params.sentinelKey,
      bump: vaultBump,
      isFrozen: false,
      dailySpendLimitLamports: params.dailySpendLimitLamports,
      currentDailySpent: 0n,
      lastSpendTimestamp: Math.floor(Date.now() / 1000),
      totalDisbursedLamports: 0n,
      totalSettledTxs: 0,
    };

    const policyData: PolicyAccountData = {
      vault: vaultPubkey,
      perTxLimitLamports: params.perTxLimitLamports,
      dailyLimitLamports: params.dailySpendLimitLamports,
      hitlThresholdLamports: params.hitlThresholdLamports,
      requireAllowlist: params.requireAllowlist,
      recipientCount: params.allowedRecipients.length,
      allowedRecipients: [...params.allowedRecipients],
      bump: policyBump,
    };

    this.vaults.set(vaultPubkey.toBase58(), vaultData);
    this.policies.set(policyPubkey.toBase58(), policyData);

    return { vaultPubkey, policyPubkey };
  }

  /**
   * Triggers emergency freeze instruction signed by sentinel authority.
   */
  public freezeVault(agentOwner: PublicKey, signerSentinelKey: PublicKey): void {
    const [vaultPubkey] = deriveVaultPda(agentOwner, this.programId);
    const vault = this.vaults.get(vaultPubkey.toBase58());

    if (!vault) {
      throw new Error(`Vault not found for agent ${agentOwner.toBase58()}`);
    }

    if (!vault.sentinelKey.equals(signerSentinelKey)) {
      throw new Error("GuardError::UnauthorizedSentinel: Signer is not the designated sentinel authority");
    }

    vault.isFrozen = true;
  }

  /**
   * Unfreezes vault instruction signed by agent owner.
   */
  public unfreezeVault(agentOwner: PublicKey, signerAgentOwner: PublicKey): void {
    const [vaultPubkey] = deriveVaultPda(agentOwner, this.programId);
    const vault = this.vaults.get(vaultPubkey.toBase58());

    if (!vault) {
      throw new Error(`Vault not found for agent ${agentOwner.toBase58()}`);
    }

    if (!vault.agentOwner.equals(signerAgentOwner)) {
      throw new Error("GuardError::UnauthorizedAgent: Signer is not the designated agent owner");
    }

    vault.isFrozen = false;
  }

  /**
   * Settles payment and commits immutable execution receipt PDA.
   */
  public settlePayment(params: {
    agentOwner: PublicKey;
    recipient: PublicKey;
    amountLamports: bigint;
    sessionIdBytes: Uint8Array;
    payloadHashHex: string;
  }): { receiptPubkey: PublicKey; txSignature: string } {
    const [vaultPubkey] = deriveVaultPda(params.agentOwner, this.programId);
    const [policyPubkey] = derivePolicyPda(vaultPubkey, this.programId);

    const vault = this.vaults.get(vaultPubkey.toBase58());
    const policy = this.policies.get(policyPubkey.toBase58());

    if (!vault) {
      throw new Error("VaultAccountNotFound");
    }

    // Constraint: Vault must NOT be frozen
    if (vault.isFrozen) {
      throw new Error("GuardError::VaultFrozen: Vault is frozen by circuit breaker sentinel");
    }

    if (params.amountLamports <= 0n) {
      throw new Error("GuardError::ZeroAmount: Amount must be greater than zero");
    }

    // Constraint: Spending limits
    if (params.amountLamports > policy!.perTxLimitLamports) {
      throw new Error("GuardError::SpendingLimitExceeded: Requested amount exceeds single-transaction spending ceiling");
    }

    // Constraint: Whitelist check
    if (policy!.requireAllowlist) {
      const allowed = policy!.allowedRecipients.some((r) => r.equals(params.recipient));
      if (!allowed) {
        throw new Error("GuardError::RecipientNotAllowed: Recipient address is not in the approved policy allowlist");
      }
    }

    // Daily budget check
    const now = Math.floor(Date.now() / 1000);
    if (now - vault.lastSpendTimestamp >= 86400) {
      vault.currentDailySpent = 0n;
      vault.lastSpendTimestamp = now;
    }

    if (vault.currentDailySpent + params.amountLamports > vault.dailySpendLimitLamports) {
      throw new Error("GuardError::DailySpendLimitExceeded: Cumulative spending exceeds 24-hour rolling budget limit");
    }

    // Derive receipt PDA and verify uniqueness (anti-replay collision)
    const [receiptPubkey, receiptBump] = deriveReceiptPda(vaultPubkey, params.sessionIdBytes, this.programId);
    if (this.receipts.has(receiptPubkey.toBase58())) {
      throw new Error("GuardError::ReceiptAlreadyClaimed: Execution receipt for this session has already been claimed");
    }

    // Update state
    vault.currentDailySpent += params.amountLamports;
    vault.totalDisbursedLamports += params.amountLamports;
    vault.totalSettledTxs += 1;

    const receiptData: ExecutionReceiptData = {
      sessionId: Buffer.from(params.sessionIdBytes).toString("hex"),
      payloadHash: params.payloadHashHex,
      recipient: params.recipient,
      amountLamports: params.amountLamports,
      timestamp: now,
      bump: receiptBump,
    };
    this.receipts.set(receiptPubkey.toBase58(), receiptData);

    const txSignature = createHash("sha256")
      .update(`${receiptPubkey.toBase58()}:${now}`)
      .digest("hex")
      .slice(0, 88);

    return { receiptPubkey, txSignature };
  }

  public getVault(agentOwner: PublicKey): VaultAccountData | undefined {
    const [vaultPubkey] = deriveVaultPda(agentOwner, this.programId);
    return this.vaults.get(vaultPubkey.toBase58());
  }

  public getReceipt(receiptPubkey: PublicKey): ExecutionReceiptData | undefined {
    return this.receipts.get(receiptPubkey.toBase58());
  }
}
