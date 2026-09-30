import { PublicKey } from "@solana/web3.js";
import {
  DeterministicPolicyEngine,
  createPayBindManifest,
  computeSha256Hex,
  computeBlake3Hex,
  verifyDeliveredPayload,
  PayBindManifest,
} from "@agentpay-guard/paybind-core";
import {
  CircuitBreakerSentinel,
  HITLGateway,
  HumanApprovalTicket,
} from "@agentpay-guard/anomaly-sentinel";
import {
  AgentPayGuardProgramClient,
  deriveVaultPda,
} from "./program-client.js";

export interface ProposedActionMetadata {
  endpoint: string;
  servicePayload: unknown;
  expectedPayloadHash?: string;
  deliveredPayload?: unknown;
  hashAlgorithm?: "sha256" | "blake3";
}

export interface InterceptRequest {
  agentId: string;
  recipient: string;
  amountLamports: bigint;
  metadata: ProposedActionMetadata;
  idempotencyKey?: string;
  approvalTicketId?: string;
}

export type InterceptStatus =
  | "SETTLED"
  | "REJECTED"
  | "HITL_PENDING"
  | "CIRCUIT_TRIPPED"
  | "PAYLOAD_MISMATCH";

export interface InterceptResponse {
  status: InterceptStatus;
  success: boolean;
  signature?: string;
  receiptPubkey?: string;
  approvalTicket?: HumanApprovalTicket;
  payBindManifest?: PayBindManifest;
  error?: string;
  reason?: string;
  idempotencyKey?: string;
}

export class AgentPayGuardInterceptor {
  private idempotencyCache: Map<string, InterceptResponse> = new Map();

  constructor(
    public policyEngine: DeterministicPolicyEngine,
    public sentinel: CircuitBreakerSentinel,
    public hitlGateway: HITLGateway,
    public programClient: AgentPayGuardProgramClient,
    public agentOwner: PublicKey,
    public sentinelKey: PublicKey
  ) {
    // Automatically bind Sentinel circuit breaker trigger to on-chain vault freeze
    this.sentinel.setFreezeCallback(async (agentId, reason) => {
      try {
        this.programClient.freezeVault(this.agentOwner, this.sentinelKey);
      } catch (e: any) {
        console.error(`[Interceptor] On-chain freeze error: ${e.message}`);
      }
    });
  }

  /**
   * Main runtime security kernel: intercepts proposed agent transactions before signing.
   */
  public async interceptTransaction(request: InterceptRequest): Promise<InterceptResponse> {
    const { agentId, recipient, amountLamports, metadata, idempotencyKey, approvalTicketId } = request;

    // 1. Idempotency Check: Protects against duplicate tool call replays from network timeouts
    if (idempotencyKey && this.idempotencyCache.has(idempotencyKey)) {
      return this.idempotencyCache.get(idempotencyKey)!;
    }

    // 2. Vault Freeze State: Fast-fail if treasury is currently frozen
    const vault = this.programClient.getVault(this.agentOwner);
    if (vault?.isFrozen || this.sentinel.isTripped()) {
      return {
        status: "CIRCUIT_TRIPPED",
        success: false,
        error: "Execution halted: Treasury vault is frozen by Sentinel circuit breaker. Contact human administrator to unfreeze.",
        reason: "VAULT_FROZEN",
      };
    }

    // 3. Layer 1: PayBind Intent Manifest & Digest Computation
    const algorithm = metadata.hashAlgorithm ?? "sha256";
    const expectedHash = metadata.expectedPayloadHash || (
      algorithm === "blake3"
        ? computeBlake3Hex(metadata.servicePayload)
        : computeSha256Hex(metadata.servicePayload)
    );

    const manifest = createPayBindManifest({
      providerPubkey: recipient,
      resourceEndpoint: metadata.endpoint,
      expectedPayloadHash: expectedHash,
      maxCostLamports: amountLamports,
      hashAlgorithm: algorithm,
    });
    const payloadDigestHex = manifest.expectedPayloadHash;

    // Check if resuming with an approved human escalation ticket
    if (approvalTicketId) {
      const ticket = this.hitlGateway.getTicket(approvalTicketId);
      if (!ticket) {
        return {
          status: "REJECTED",
          success: false,
          error: `Approval ticket '${approvalTicketId}' not found or expired. Re-request approval.`,
        };
      }

      const verification = this.hitlGateway.verifyApproval(ticket);
      if (!verification.valid) {
        return {
          status: "REJECTED",
          success: false,
          error: `Human operator authorization invalid: ${verification.reason}`,
        };
      }
    } else {
      // 4. Layer 2: Anomaly Sentinel Velocity & Recursive Loop Detection
      const sentinelEval = await this.sentinel.evaluateTransaction(
        agentId,
        recipient,
        amountLamports,
        payloadDigestHex
      );

      if (!sentinelEval.allowed) {
        const response: InterceptResponse = {
          status: "CIRCUIT_TRIPPED",
          success: false,
          error: `Circuit breaker tripped: ${sentinelEval.violationReason}. Economic dispatch suspended.`,
          reason: sentinelEval.violationReason,
        };
        if (idempotencyKey) this.idempotencyCache.set(idempotencyKey, response);
        return response;
      }

      // 5. Layer 3: Deterministic Spending Policy Evaluation
      const currentDaily = vault?.currentDailySpent ?? 0n;
      const policyResult = this.policyEngine.evaluate({
        recipient,
        amountLamports,
        currentDailySpentLamports: currentDaily,
      });

      if (policyResult.status === "REJECTED") {
        const response: InterceptResponse = {
          status: "REJECTED",
          success: false,
          error: `Policy violation: ${policyResult.reason}. Adjust parameters or choose an approved provider.`,
          reason: policyResult.reason,
        };
        if (idempotencyKey) this.idempotencyCache.set(idempotencyKey, response);
        return response;
      }

      // If policy requires Human-in-the-Loop review
      if (policyResult.status === "HITL_REQUIRED") {
        const ticket = this.hitlGateway.createTicket({
          agentId,
          recipient,
          amountLamports,
          payloadDigest: payloadDigestHex,
          reason: policyResult.reason,
        });

        const response: InterceptResponse = {
          status: "HITL_PENDING",
          success: false,
          approvalTicket: ticket,
          payBindManifest: manifest,
          reason: "Transaction exceeds autonomous ceiling. Human operator approval ticket created.",
          error: `HITL_REQUIRED: Ticket ${ticket.ticketId} created. Awaiting administrator Ed25519 signature before execution.`,
        };
        return response;
      }
    }

    // 6. Layer 4: Financial Hub Settlement on Solana
    let recipientPubkey: PublicKey;
    try {
      recipientPubkey = new PublicKey(recipient);
    } catch {
      return {
        status: "REJECTED",
        success: false,
        error: `Invalid Solana recipient public key: '${recipient}'`,
      };
    }

    try {
      const sessionIdBytes = Buffer.from(manifest.sessionId.padEnd(32, "0").slice(0, 32), "utf8");

      const settlement = this.programClient.settlePayment({
        agentOwner: this.agentOwner,
        recipient: recipientPubkey,
        amountLamports,
        sessionIdBytes: new Uint8Array(sessionIdBytes),
        payloadHashHex: payloadDigestHex,
      });

      // 7. Layer 5: Post-Settlement PayBind Resource Delivery Verification (if response payload supplied)
      if (metadata.deliveredPayload !== undefined) {
        const deliveryCheck = verifyDeliveredPayload(manifest, metadata.deliveredPayload);
        if (!deliveryCheck.isValid) {
          const response: InterceptResponse = {
            status: "PAYLOAD_MISMATCH",
            success: false,
            signature: settlement.txSignature,
            receiptPubkey: settlement.receiptPubkey.toBase58(),
            payBindManifest: manifest,
            error: `Payload substitution attack detected! Delivered hash ${deliveryCheck.actual} != Expected ${deliveryCheck.expected}`,
          };
          return response;
        }
      }

      const response: InterceptResponse = {
        status: "SETTLED",
        success: true,
        signature: settlement.txSignature,
        receiptPubkey: settlement.receiptPubkey.toBase58(),
        payBindManifest: manifest,
        reason: "Payment successfully verified and settled via Financial Hub PDA",
      };

      if (idempotencyKey) {
        this.idempotencyCache.set(idempotencyKey, response);
      }
      return response;
    } catch (err: any) {
      return {
        status: "REJECTED",
        success: false,
        error: `On-chain settlement failure: ${err.message}`,
      };
    }
  }

  public clearIdempotencyCache(): void {
    this.idempotencyCache.clear();
  }
}
