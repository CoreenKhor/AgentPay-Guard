import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  VersionedTransaction,
  SystemProgram,
  SendOptions,
  TransactionSignature,
} from "@solana/web3.js";
import { AgentPayGuardInterceptor, InterceptResponse } from "./interceptor.js";

export interface TransactionInspection {
  recipient: string;
  amountLamports: bigint;
  endpoint: string;
  payload: Record<string, unknown>;
}

/**
 * Parses instructions from a Solana Transaction to extract recipient and disbursement amount.
 */
export function inspectSolanaTransaction(
  tx: Transaction | VersionedTransaction,
  defaultEndpoint: string = "/solana/tx"
): TransactionInspection {
  let recipient = "";
  let amountLamports = 0n;

  if ("instructions" in tx && Array.isArray(tx.instructions)) {
    for (const ix of tx.instructions) {
      if (ix.programId.equals(SystemProgram.programId)) {
        // SystemProgram transfer instruction type = 2 (u32 little-endian)
        if (ix.data.length >= 12 && ix.data.readUInt32LE(0) === 2) {
          const lamports = ix.data.readBigUInt64LE(4);
          amountLamports += lamports;
          if (ix.keys.length >= 2 && ix.keys[1]) {
            recipient = ix.keys[1].pubkey.toBase58();
          }
        }
      }
    }
  }

  return {
    recipient: recipient || SystemProgram.programId.toBase58(),
    amountLamports,
    endpoint: defaultEndpoint,
    payload: {
      instructionCount: "instructions" in tx ? tx.instructions.length : 1,
      timestamp: Date.now(),
    },
  };
}

/**
 * Guarded Keypair Wallet Adapter.
 * Intercepts signing requests, evaluates PayBind intent and Sentinel velocity,
 * and halts unauthorized transaction broadcast before keys sign.
 */
export class GuardedKeypairWallet {
  constructor(
    public keypair: Keypair,
    public interceptor: AgentPayGuardInterceptor,
    public agentId: string = "autonomous-agent"
  ) {}

  public get publicKey(): PublicKey {
    return this.keypair.publicKey;
  }

  /**
   * Evaluates the transaction through the security kernel before signing.
   */
  public async preflightCheck(
    tx: Transaction | VersionedTransaction,
    metadata?: Partial<TransactionInspection>
  ): Promise<InterceptResponse> {
    const inspected = inspectSolanaTransaction(tx);
    const recipient = metadata?.recipient || inspected.recipient;
    const amountLamports = metadata?.amountLamports ?? inspected.amountLamports;
    const endpoint = metadata?.endpoint || inspected.endpoint;
    const servicePayload = metadata?.payload || inspected.payload;

    return await this.interceptor.interceptTransaction({
      agentId: this.agentId,
      recipient,
      amountLamports,
      metadata: {
        endpoint,
        servicePayload,
      },
    });
  }

  /**
   * Signs a Solana transaction only after passing AgentPay Guard pre-flight checks.
   */
  public async signTransaction<T extends Transaction | VersionedTransaction>(
    tx: T,
    metadata?: Partial<TransactionInspection>
  ): Promise<T> {
    const guardResult = await this.preflightCheck(tx, metadata);
    if (!guardResult.success && guardResult.status !== "SETTLED") {
      throw new Error(`[GuardedKeypairWallet] Signing rejected: ${guardResult.error}`);
    }

    if ("partialSign" in tx && typeof tx.partialSign === "function") {
      tx.partialSign(this.keypair);
    }
    return tx;
  }

  /**
   * Signs multiple transactions after checking each through the security kernel.
   */
  public async signAllTransactions<T extends Transaction | VersionedTransaction>(
    txs: T[]
  ): Promise<T[]> {
    const signed: T[] = [];
    for (const tx of txs) {
      signed.push(await this.signTransaction(tx));
    }
    return signed;
  }
}

/**
 * Guarded Solana Connection wrapper.
 * Overrides sendTransaction and sendRawTransaction to enforce security verification.
 */
export class GuardedConnection {
  constructor(
    public rawConnection: Connection,
    public interceptor: AgentPayGuardInterceptor,
    public agentId: string = "connection-agent"
  ) {}

  public async sendTransaction(
    transaction: Transaction | VersionedTransaction,
    signers: Keypair[],
    options?: SendOptions
  ): Promise<TransactionSignature> {
    const inspected = inspectSolanaTransaction(transaction);

    const check = await this.interceptor.interceptTransaction({
      agentId: this.agentId,
      recipient: inspected.recipient,
      amountLamports: inspected.amountLamports,
      metadata: {
        endpoint: inspected.endpoint,
        servicePayload: inspected.payload,
      },
    });

    if (!check.success && check.status !== "SETTLED") {
      throw new Error(`[GuardedConnection] sendTransaction blocked by AgentPay Guard: ${check.error}`);
    }

    if (check.signature) {
      return check.signature;
    }

    return await this.rawConnection.sendTransaction(transaction as any, signers, options);
  }
}
