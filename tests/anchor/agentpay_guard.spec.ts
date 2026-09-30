import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { PublicKey, Keypair } from "@solana/web3.js";
import { sha256 } from "@noble/hashes/sha256";

// Program ID definition
const PROGRAM_ID = new PublicKey("APGuard111111111111111111111111111111111111");

// Helper to derive Anchor 8-byte instruction discriminator
function getAnchorDiscriminator(name: string): Buffer {
  const hash = sha256(`global:${name}`);
  return Buffer.from(hash.slice(0, 8));
}

// Helpers for PDA derivation
function deriveVaultPDA(agentOwner: PublicKey, programId: PublicKey = PROGRAM_ID): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), agentOwner.toBuffer()],
    programId
  );
}

function derivePolicyPDA(vaultPDA: PublicKey, programId: PublicKey = PROGRAM_ID): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("policy"), vaultPDA.toBuffer()],
    programId
  );
}

function deriveReceiptPDA(
  vaultPDA: PublicKey,
  sessionId: Uint8Array,
  programId: PublicKey = PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("receipt"), vaultPDA.toBuffer(), Buffer.from(sessionId)],
    programId
  );
}

// Simulated On-Chain State Model matching Rust structs
interface VaultAuthorityState {
  agentOwner: PublicKey;
  sentinelKey: PublicKey;
  bump: number;
  isFrozen: boolean;
  createdAt: bigint;
  lamports: bigint;
}

interface SpendingPolicyState {
  vault: PublicKey;
  maxAmountPerTx: bigint;
  dailyBudgetLamports: bigint;
  currentDailySpent: bigint;
  lastSpendTimestamp: bigint;
  requireWhitelist: boolean;
  allowedRecipients: PublicKey[];
  bump: number;
}

interface ExecutionReceiptState {
  vault: PublicKey;
  sessionId: Uint8Array;
  payloadHash: Uint8Array;
  recipient: PublicKey;
  amountLamports: bigint;
  timestamp: bigint;
  bump: number;
}

// Simulated Anchor Program Context & State Machine
class MockAgentPayGuardContract {
  public vaults = new Map<string, VaultAuthorityState>();
  public policies = new Map<string, SpendingPolicyState>();
  public receipts = new Map<string, ExecutionReceiptState>();
  public currentTime: bigint = BigInt(Math.floor(Date.now() / 1000));

  initializeVault(
    agentOwner: PublicKey,
    sentinelKey: PublicKey,
    maxAmountPerTx: bigint,
    dailyBudgetLamports: bigint,
    allowedRecipients: PublicKey[],
    requireWhitelist: boolean,
    initialDepositLamports: bigint = 10_000_000_000n
  ): { vaultPDA: PublicKey; policyPDA: PublicKey } {
    const [vaultPDA, vaultBump] = deriveVaultPDA(agentOwner);
    const [policyPDA, policyBump] = derivePolicyPDA(vaultPDA);

    if (this.vaults.has(vaultPDA.toBase58())) {
      throw new Error("VaultAlreadyInitialized");
    }

    if (allowedRecipients.length > 16) {
      throw new Error("WhitelistOverflow");
    }

    const vaultState: VaultAuthorityState = {
      agentOwner,
      sentinelKey,
      bump: vaultBump,
      isFrozen: false,
      createdAt: this.currentTime,
      lamports: initialDepositLamports,
    };

    const policyState: SpendingPolicyState = {
      vault: vaultPDA,
      maxAmountPerTx,
      dailyBudgetLamports,
      currentDailySpent: 0n,
      lastSpendTimestamp: this.currentTime,
      requireWhitelist,
      allowedRecipients: [...allowedRecipients],
      bump: policyBump,
    };

    this.vaults.set(vaultPDA.toBase58(), vaultState);
    this.policies.set(policyPDA.toBase58(), policyState);

    return { vaultPDA, policyPDA };
  }

  updatePolicy(
    caller: PublicKey,
    vaultPDA: PublicKey,
    updates: {
      maxAmountPerTx?: bigint;
      dailyBudgetLamports?: bigint;
      allowedRecipients?: PublicKey[];
      requireWhitelist?: boolean;
    }
  ): void {
    const vault = this.vaults.get(vaultPDA.toBase58());
    if (!vault) throw new Error("VaultNotFound");
    if (!vault.agentOwner.equals(caller)) {
      throw new Error("UnauthorizedOwner");
    }

    const [policyPDA] = derivePolicyPDA(vaultPDA);
    const policy = this.policies.get(policyPDA.toBase58());
    if (!policy) throw new Error("PolicyNotFound");

    if (updates.maxAmountPerTx !== undefined) policy.maxAmountPerTx = updates.maxAmountPerTx;
    if (updates.dailyBudgetLamports !== undefined) policy.dailyBudgetLamports = updates.dailyBudgetLamports;
    if (updates.allowedRecipients !== undefined) {
      if (updates.allowedRecipients.length > 16) throw new Error("WhitelistOverflow");
      policy.allowedRecipients = [...updates.allowedRecipients];
    }
    if (updates.requireWhitelist !== undefined) policy.requireWhitelist = updates.requireWhitelist;
  }

  settlePayment(
    vaultPDA: PublicKey,
    recipient: PublicKey,
    sessionId: Uint8Array,
    payloadHash: Uint8Array,
    amountLamports: bigint
  ): { receiptPDA: PublicKey } {
    const vault = this.vaults.get(vaultPDA.toBase58());
    if (!vault) throw new Error("VaultNotFound");

    if (vault.isFrozen) {
      throw new Error("VaultFrozen");
    }

    // Zero-hash check
    if (payloadHash.every((b) => b === 0)) {
      throw new Error("InvalidPayloadHash");
    }

    const [policyPDA] = derivePolicyPDA(vaultPDA);
    const policy = this.policies.get(policyPDA.toBase58());
    if (!policy) throw new Error("PolicyNotFound");

    // Single-tx limit check
    if (amountLamports > policy.maxAmountPerTx) {
      throw new Error("ExceedsPerTxLimit");
    }

    // Refresh 24-hour daily budget window
    const SECONDS_PER_DAY = 86_400n;
    if (this.currentTime - policy.lastSpendTimestamp >= SECONDS_PER_DAY) {
      policy.currentDailySpent = 0n;
      policy.lastSpendTimestamp = this.currentTime;
    }

    // Daily budget check
    const newDailySpent = policy.currentDailySpent + amountLamports;
    if (newDailySpent > policy.dailyBudgetLamports) {
      throw new Error("ExceedsDailyBudget");
    }

    // Whitelist check
    if (policy.requireWhitelist) {
      const isAllowed = policy.allowedRecipients.some((r) => r.equals(recipient));
      if (!isAllowed) {
        throw new Error("RecipientNotAllowed");
      }
    }

    // Vault balance check (leave minimum 1000 lamports rent)
    const minRent = 1_000n;
    if (vault.lamports < amountLamports + minRent) {
      throw new Error("InsufficientVaultBalance");
    }

    // Receipt uniqueness check (prevent replay attack)
    const [receiptPDA, receiptBump] = deriveReceiptPDA(vaultPDA, sessionId);
    if (this.receipts.has(receiptPDA.toBase58())) {
      throw new Error("ReceiptAlreadyExists");
    }

    // Commit state transitions
    policy.currentDailySpent = newDailySpent;
    vault.lamports -= amountLamports;

    const receiptState: ExecutionReceiptState = {
      vault: vaultPDA,
      sessionId,
      payloadHash,
      recipient,
      amountLamports,
      timestamp: this.currentTime,
      bump: receiptBump,
    };

    this.receipts.set(receiptPDA.toBase58(), receiptState);
    return { receiptPDA };
  }

  freezeVault(caller: PublicKey, vaultPDA: PublicKey): void {
    const vault = this.vaults.get(vaultPDA.toBase58());
    if (!vault) throw new Error("VaultNotFound");

    if (!caller.equals(vault.sentinelKey) && !caller.equals(vault.agentOwner)) {
      throw new Error("UnauthorizedSentinel");
    }

    vault.isFrozen = true;
  }

  unfreezeVault(caller: PublicKey, vaultPDA: PublicKey): void {
    const vault = this.vaults.get(vaultPDA.toBase58());
    if (!vault) throw new Error("VaultNotFound");

    if (!caller.equals(vault.agentOwner)) {
      throw new Error("UnauthorizedOwner");
    }

    vault.isFrozen = false;
  }
}

// ---------------------------------------------------------------------------
// Unit & Integration Test Suite for AgentPay Guard On-Chain Program
// ---------------------------------------------------------------------------
describe("AgentPay Guard: Solana On-Chain Program & Financial Hub", () => {
  const owner = Keypair.generate();
  const sentinel = Keypair.generate();
  const unauthorizedUser = Keypair.generate();
  const recipientA = Keypair.generate();
  const recipientB = Keypair.generate();
  const rogueRecipient = Keypair.generate();

  let contract: MockAgentPayGuardContract;
  let vaultPDA: PublicKey;
  let policyPDA: PublicKey;

  const MAX_PER_TX = 1_000_000_000n; // 1 SOL
  const DAILY_BUDGET = 5_000_000_000n; // 5 SOL

  it("calculates accurate Anchor 8-byte instruction discriminators", () => {
    const initDisc = getAnchorDiscriminator("initialize_vault");
    const settleDisc = getAnchorDiscriminator("settle_payment");
    const freezeDisc = getAnchorDiscriminator("freeze_vault");

    assert.equal(initDisc.length, 8);
    assert.equal(settleDisc.length, 8);
    assert.equal(freezeDisc.length, 8);
    assert.notDeepEqual(initDisc, settleDisc);
  });

  it("derives deterministic canonical PDAs for VaultAuthority and SpendingPolicy", () => {
    const [pda1, bump1] = deriveVaultPDA(owner.publicKey);
    const [pda2, bump2] = deriveVaultPDA(owner.publicKey);

    assert.equal(pda1.toBase58(), pda2.toBase58());
    assert.equal(bump1, bump2);
    assert.ok(bump1 >= 0 && bump1 <= 255);

    const [polPDA, polBump] = derivePolicyPDA(pda1);
    assert.ok(polPDA);
    assert.ok(polBump >= 0);
  });

  it("successfully initializes an agent vault with strict spending policy", () => {
    contract = new MockAgentPayGuardContract();
    const result = contract.initializeVault(
      owner.publicKey,
      sentinel.publicKey,
      MAX_PER_TX,
      DAILY_BUDGET,
      [recipientA.publicKey, recipientB.publicKey],
      true,
      10_000_000_000n // 10 SOL
    );

    vaultPDA = result.vaultPDA;
    policyPDA = result.policyPDA;

    const vault = contract.vaults.get(vaultPDA.toBase58());
    assert.ok(vault);
    assert.equal(vault.isFrozen, false);
    assert.equal(vault.agentOwner.toBase58(), owner.publicKey.toBase58());
    assert.equal(vault.sentinelKey.toBase58(), sentinel.publicKey.toBase58());

    const policy = contract.policies.get(policyPDA.toBase58());
    assert.ok(policy);
    assert.equal(policy.maxAmountPerTx, MAX_PER_TX);
    assert.equal(policy.dailyBudgetLamports, DAILY_BUDGET);
    assert.equal(policy.currentDailySpent, 0n);
    assert.equal(policy.requireWhitelist, true);
    assert.equal(policy.allowedRecipients.length, 2);
  });

  it("executes valid payment settlement, deducts balance, and writes ExecutionReceipt", () => {
    const sessionId = new Uint8Array(32).fill(1);
    const payloadHash = new Uint8Array(32).fill(42);
    const spendAmount = 500_000_000n; // 0.5 SOL

    const { receiptPDA } = contract.settlePayment(
      vaultPDA,
      recipientA.publicKey,
      sessionId,
      payloadHash,
      spendAmount
    );

    assert.ok(receiptPDA);
    const receipt = contract.receipts.get(receiptPDA.toBase58());
    assert.ok(receipt);
    assert.equal(receipt.amountLamports, spendAmount);
    assert.deepEqual(receipt.payloadHash, payloadHash);

    const policy = contract.policies.get(policyPDA.toBase58());
    assert.equal(policy?.currentDailySpent, spendAmount);

    const vault = contract.vaults.get(vaultPDA.toBase58());
    assert.equal(vault?.lamports, 10_000_000_000n - spendAmount);
  });

  it("blocks settlement exceeding single-transaction policy limit (ExceedsPerTxLimit)", () => {
    const sessionId = new Uint8Array(32).fill(2);
    const payloadHash = new Uint8Array(32).fill(42);
    const excessiveAmount = 2_000_000_000n; // 2 SOL > 1 SOL limit

    assert.throws(
      () => {
        contract.settlePayment(
          vaultPDA,
          recipientA.publicKey,
          sessionId,
          payloadHash,
          excessiveAmount
        );
      },
      { message: "ExceedsPerTxLimit" }
    );
  });

  it("blocks settlement to unauthorized / non-whitelisted recipient (RecipientNotAllowed)", () => {
    const sessionId = new Uint8Array(32).fill(3);
    const payloadHash = new Uint8Array(32).fill(42);
    const spendAmount = 100_000_000n;

    assert.throws(
      () => {
        contract.settlePayment(
          vaultPDA,
          rogueRecipient.publicKey,
          sessionId,
          payloadHash,
          spendAmount
        );
      },
      { message: "RecipientNotAllowed" }
    );
  });

  it("blocks settlement with empty payload hash (InvalidPayloadHash)", () => {
    const sessionId = new Uint8Array(32).fill(4);
    const zeroPayloadHash = new Uint8Array(32).fill(0);

    assert.throws(
      () => {
        contract.settlePayment(
          vaultPDA,
          recipientA.publicKey,
          sessionId,
          zeroPayloadHash,
          100_000_000n
        );
      },
      { message: "InvalidPayloadHash" }
    );
  });

  it("prevents transaction replay attacks with identical session ID (ReceiptAlreadyExists)", () => {
    const sessionId = new Uint8Array(32).fill(1); // Reusing session ID from earlier test
    const payloadHash = new Uint8Array(32).fill(99);

    assert.throws(
      () => {
        contract.settlePayment(
          vaultPDA,
          recipientA.publicKey,
          sessionId,
          payloadHash,
          100_000_000n
        );
      },
      { message: "ReceiptAlreadyExists" }
    );
  });

  it("blocks settlements exceeding daily cumulative budget (ExceedsDailyBudget)", () => {
    // Current daily spent is 0.5 SOL out of 5 SOL
    const spend1 = 1_000_000_000n; // +1 SOL = 1.5 SOL
    const spend2 = 1_000_000_000n; // +1 SOL = 2.5 SOL
    const spend3 = 1_000_000_000n; // +1 SOL = 3.5 SOL
    const spend4 = 1_000_000_000n; // +1 SOL = 4.5 SOL

    contract.settlePayment(vaultPDA, recipientA.publicKey, new Uint8Array(32).fill(10), new Uint8Array(32).fill(1), spend1);
    contract.settlePayment(vaultPDA, recipientA.publicKey, new Uint8Array(32).fill(11), new Uint8Array(32).fill(1), spend2);
    contract.settlePayment(vaultPDA, recipientA.publicKey, new Uint8Array(32).fill(12), new Uint8Array(32).fill(1), spend3);
    contract.settlePayment(vaultPDA, recipientA.publicKey, new Uint8Array(32).fill(13), new Uint8Array(32).fill(1), spend4);

    // Now current spent is 4.5 SOL. Attempting 1.0 SOL should fail as 4.5 + 1.0 = 5.5 > 5.0 SOL
    assert.throws(
      () => {
        contract.settlePayment(
          vaultPDA,
          recipientA.publicKey,
          new Uint8Array(32).fill(14),
          new Uint8Array(32).fill(1),
          1_000_000_000n
        );
      },
      { message: "ExceedsDailyBudget" }
    );
  });

  it("automatically rolls over daily budget after 24 hours (86,400s)", () => {
    // Advance time by 86,401 seconds
    contract.currentTime += 86_401n;

    // Settle 1.0 SOL now; should succeed as accumulator resets
    const { receiptPDA } = contract.settlePayment(
      vaultPDA,
      recipientA.publicKey,
      new Uint8Array(32).fill(15),
      new Uint8Array(32).fill(1),
      1_000_000_000n
    );
    assert.ok(receiptPDA);

    const policy = contract.policies.get(policyPDA.toBase58());
    assert.equal(policy?.currentDailySpent, 1_000_000_000n);
  });

  it("enforces sentinel authority for emergency freeze", () => {
    // Unauthorized user cannot freeze vault
    assert.throws(
      () => {
        contract.freezeVault(unauthorizedUser.publicKey, vaultPDA);
      },
      { message: "UnauthorizedSentinel" }
    );

    // Authorized sentinel triggers emergency freeze
    contract.freezeVault(sentinel.publicKey, vaultPDA);
    const vault = contract.vaults.get(vaultPDA.toBase58());
    assert.equal(vault?.isFrozen, true);

    // Any payment settlement must be immediately blocked
    assert.throws(
      () => {
        contract.settlePayment(
          vaultPDA,
          recipientA.publicKey,
          new Uint8Array(32).fill(16),
          new Uint8Array(32).fill(1),
          100_000_000n
        );
      },
      { message: "VaultFrozen" }
    );
  });

  it("strictly requires agent owner to unfreeze the vault", () => {
    // Sentinel cannot unfreeze
    assert.throws(
      () => {
        contract.unfreezeVault(sentinel.publicKey, vaultPDA);
      },
      { message: "UnauthorizedOwner" }
    );

    // Master owner unfreezes
    contract.unfreezeVault(owner.publicKey, vaultPDA);
    const vault = contract.vaults.get(vaultPDA.toBase58());
    assert.equal(vault?.isFrozen, false);

    // Settlements resume normally
    const { receiptPDA } = contract.settlePayment(
      vaultPDA,
      recipientB.publicKey,
      new Uint8Array(32).fill(17),
      new Uint8Array(32).fill(1),
      100_000_000n
    );
    assert.ok(receiptPDA);
  });

  it("allows owner to update policy limits and whitelist", () => {
    // Unauthorized caller cannot update policy
    assert.throws(
      () => {
        contract.updatePolicy(unauthorizedUser.publicKey, vaultPDA, {
          maxAmountPerTx: 2_000_000_000n,
        });
      },
      { message: "UnauthorizedOwner" }
    );

    // Owner updates policy
    contract.updatePolicy(owner.publicKey, vaultPDA, {
      maxAmountPerTx: 3_000_000_000n,
      requireWhitelist: false,
    });

    const policy = contract.policies.get(policyPDA.toBase58());
    assert.equal(policy?.maxAmountPerTx, 3_000_000_000n);
    assert.equal(policy?.requireWhitelist, false);

    // Rogue recipient now permitted because requireWhitelist is false
    const { receiptPDA } = contract.settlePayment(
      vaultPDA,
      rogueRecipient.publicKey,
      new Uint8Array(32).fill(18),
      new Uint8Array(32).fill(1),
      2_000_000_000n
    );
    assert.ok(receiptPDA);
  });
});
