import { randomUUID, createHash } from "node:crypto";
import nacl from "tweetnacl";
import bs58 from "bs58";

export type TicketStatus = "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED";

export interface HumanApprovalTicket {
  ticketId: string;
  agentId: string;
  proposedTxHash: string;
  amountLamports: string;
  recipient: string;
  reason: string;
  createdAtUnix: number;
  approvedAtUnix?: number;
  expiresAtUnix: number;
  operatorPubkey?: string;
  signature?: string; // Base58-encoded Ed25519 signature
  status: TicketStatus;
}

export interface CreateTicketParams {
  agentId: string;
  recipient: string;
  amountLamports: bigint;
  payloadDigest: string;
  reason: string;
  ttlSeconds?: number;
}

export class HITLGateway {
  private tickets: Map<string, HumanApprovalTicket> = new Map();
  private listeners: Array<(ticket: HumanApprovalTicket) => void> = [];

  constructor(private authorizedOperators: string[] = []) {}

  public addAuthorizedOperator(pubkey: string): void {
    if (!this.authorizedOperators.includes(pubkey)) {
      this.authorizedOperators.push(pubkey);
    }
  }

  public onTicketUpdate(listener: (ticket: HumanApprovalTicket) => void): void {
    this.listeners.push(listener);
  }

  private notify(ticket: HumanApprovalTicket): void {
    for (const listener of this.listeners) {
      try {
        listener(ticket);
      } catch (err) {
        console.error("[HITLGateway] Notification error:", err);
      }
    }
  }

  /**
   * Computes deterministic SHA-256 hash of ticket parameters for cryptographic signing.
   */
  public computeTicketDigest(ticket: HumanApprovalTicket): Uint8Array {
    const message = `${ticket.ticketId}:${ticket.agentId}:${ticket.recipient}:${ticket.amountLamports}:${ticket.proposedTxHash}:${ticket.expiresAtUnix}`;
    return new Uint8Array(createHash("sha256").update(message, "utf8").digest());
  }

  /**
   * Creates an ephemeral escalation ticket.
   */
  public createTicket(params: CreateTicketParams): HumanApprovalTicket {
    const ticketId = randomUUID();
    const now = Math.floor(Date.now() / 1000);
    const ttl = params.ttlSeconds ?? 180; // 180 seconds default expiry

    const ticket: HumanApprovalTicket = {
      ticketId,
      agentId: params.agentId,
      proposedTxHash: params.payloadDigest,
      amountLamports: params.amountLamports.toString(),
      recipient: params.recipient,
      reason: params.reason,
      createdAtUnix: now,
      expiresAtUnix: now + ttl,
      status: "PENDING",
    };

    this.tickets.set(ticketId, ticket);
    this.notify(ticket);
    return ticket;
  }

  /**
   * Approves a ticket with an Ed25519 secret key signature.
   */
  public approveTicket(ticketId: string, operatorSecretKey: Uint8Array): HumanApprovalTicket {
    const ticket = this.getTicket(ticketId);
    if (!ticket) {
      throw new Error(`Ticket not found: ${ticketId}`);
    }

    const now = Math.floor(Date.now() / 1000);
    if (now > ticket.expiresAtUnix) {
      ticket.status = "EXPIRED";
      this.notify(ticket);
      throw new Error(`Ticket ${ticketId} has expired`);
    }

    const keypair = nacl.sign.keyPair.fromSecretKey(operatorSecretKey);
    const operatorPubkey = bs58.encode(keypair.publicKey);

    // Compute message hash and sign with Ed25519
    const digest = this.computeTicketDigest(ticket);
    const signatureBytes = nacl.sign.detached(digest, operatorSecretKey);
    const signature = bs58.encode(signatureBytes);

    ticket.status = "APPROVED";
    ticket.approvedAtUnix = now;
    ticket.operatorPubkey = operatorPubkey;
    ticket.signature = signature;

    this.notify(ticket);
    return ticket;
  }

  /**
   * Rejects an escalation ticket.
   */
  public rejectTicket(ticketId: string, operatorPubkey?: string, reason?: string): HumanApprovalTicket {
    const ticket = this.getTicket(ticketId);
    if (!ticket) {
      throw new Error(`Ticket not found: ${ticketId}`);
    }

    ticket.status = "REJECTED";
    if (operatorPubkey) ticket.operatorPubkey = operatorPubkey;
    if (reason) ticket.reason = `${ticket.reason} | Rejected: ${reason}`;

    this.notify(ticket);
    return ticket;
  }

  /**
   * Cryptographically verifies an approved ticket.
   */
  public verifyApproval(ticket: HumanApprovalTicket): { valid: boolean; reason?: string } {
    if (ticket.status !== "APPROVED") {
      return { valid: false, reason: `Ticket is not in APPROVED state (current: ${ticket.status})` };
    }

    const now = Math.floor(Date.now() / 1000);
    if (now > ticket.expiresAtUnix) {
      return { valid: false, reason: "Approval ticket has expired" };
    }

    if (!ticket.operatorPubkey || !ticket.signature) {
      return { valid: false, reason: "Missing operator signature or public key" };
    }

    // Verify authorized operator list if non-empty
    if (this.authorizedOperators.length > 0) {
      if (!this.authorizedOperators.includes(ticket.operatorPubkey)) {
        return { valid: false, reason: `Operator ${ticket.operatorPubkey} is not authorized` };
      }
    }

    try {
      const pubkeyBytes = bs58.decode(ticket.operatorPubkey);
      const signatureBytes = bs58.decode(ticket.signature);
      const digest = this.computeTicketDigest(ticket);

      const isValid = nacl.sign.detached.verify(digest, signatureBytes, pubkeyBytes);
      if (!isValid) {
        return { valid: false, reason: "Cryptographic Ed25519 signature verification failed" };
      }

      return { valid: true };
    } catch (err: any) {
      return { valid: false, reason: `Signature verification error: ${err.message}` };
    }
  }

  public getTicket(ticketId: string): HumanApprovalTicket | undefined {
    this.refreshExpired();
    return this.tickets.get(ticketId);
  }

  public getAllTickets(): HumanApprovalTicket[] {
    this.refreshExpired();
    return Array.from(this.tickets.values()).sort((a, b) => b.createdAtUnix - a.createdAtUnix);
  }

  public getPendingTickets(): HumanApprovalTicket[] {
    this.refreshExpired();
    return Array.from(this.tickets.values()).filter((t) => t.status === "PENDING");
  }

  private refreshExpired(): void {
    const now = Math.floor(Date.now() / 1000);
    for (const [, ticket] of this.tickets.entries()) {
      if (ticket.status === "PENDING" && now > ticket.expiresAtUnix) {
        ticket.status = "EXPIRED";
        this.notify(ticket);
      }
    }
  }
}
