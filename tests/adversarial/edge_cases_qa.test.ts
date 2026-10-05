import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Keypair, Transaction, SystemProgram } from "@solana/web3.js";
import {
  DeterministicPolicyEngine,
  computeSha256Hex,
  verifySha256Match,
} from "@agentpay-guard/paybind-core";
import {
  CircuitBreakerSentinel,
  HITLGateway,
  SlidingWindowSentinel,
} from "@agentpay-guard/anomaly-sentinel";
import {
  AgentPayGuardProgramClient,
  AgentPayGuardInterceptor,
  inspectSolanaTransaction,
  GuardedKeypairWallet,
} from "@agentpay-guard/agent-sdk";

describe("QA Edge Cases & Boundary Defense Suite", () => {
  it("QA-01: Disallow fund disbursement prior to payload delivery validation (SEC-02 fix)", async () => {
    const agentOwner = Keypair.generate();
    const sentinelKey = Keypair.generate();
    const rogueProvider = Keypair.generate();

    const programClient = new AgentPayGuardProgramClient();
    programClient.initializeVault({
      agentOwner: agentOwner.publicKey,
      sentinelKey: sentinelKey.publicKey,
      dailySpendLimitLamports: 1_000_000_000n,
      perTxLimitLamports: 100_000_000n,
      hitlThresholdLamports: 50_000_000n,
      requireAllowlist: true,
      allowedRecipients: [rogueProvider.publicKey],
    });

    const policy = new DeterministicPolicyEngine({
      perTxLimitLamports: 100_000_000n,
      dailyBudgetLamports: 1_000_000_000n,
      allowedRecipients: [rogueProvider.publicKey.toBase58()],
    });

    const sentinel = new CircuitBreakerSentinel();
    const hitl = new HITLGateway();
    const interceptor = new AgentPayGuardInterceptor(
      policy,
      sentinel,
      hitl,
      programClient,
      agentOwner.publicKey,
      sentinelKey.publicKey
    );

    const vaultInitial = programClient.getVault(agentOwner.publicKey)!;
    const initialDisbursed = vaultInitial.totalDisbursedLamports;

    const expected = { result: "authentic_weights" };
    const poisoned = { result: "backdoored_poisoned_weights" };

    const res = await interceptor.interceptTransaction({
      agentId: "test-agent",
      recipient: rogueProvider.publicKey.toBase58(),
      amountLamports: 25_000_000n,
      metadata: {
        endpoint: "/inference",
        servicePayload: expected,
        expectedPayloadHash: computeSha256Hex(expected),
        deliveredPayload: poisoned,
      },
    });

    assert.equal(res.status, "PAYLOAD_MISMATCH");
    assert.equal(res.success, false);

    // CRITICAL: Vault must NOT disburse funds if payload was poisoned!
    const vaultAfter = programClient.getVault(agentOwner.publicKey)!;
    assert.equal(
      vaultAfter.totalDisbursedLamports,
      initialDisbursed,
      "Zero lamports should be disbursed when delivered payload hash fails verification"
    );
  });

  it("QA-02: Prevent transaction inspection sandwiching bypass on multi-instruction transactions (SEC-04 fix)", async () => {
    const agentKeypair = Keypair.generate();
    const attackerKey = Keypair.generate().publicKey;
    const whitelistedKey = Keypair.generate().publicKey;

    const programClient = new AgentPayGuardProgramClient();
    programClient.initializeVault({
      agentOwner: agentKeypair.publicKey,
      sentinelKey: Keypair.generate().publicKey,
      dailySpendLimitLamports: 1_000_000_000n,
      perTxLimitLamports: 100_000_000n,
      hitlThresholdLamports: 50_000_000n,
      requireAllowlist: true,
      allowedRecipients: [whitelistedKey],
    });

    const policy = new DeterministicPolicyEngine({
      perTxLimitLamports: 100_000_000n,
      dailyBudgetLamports: 1_000_000_000n,
      allowedRecipients: [whitelistedKey.toBase58()],
    });

    const interceptor = new AgentPayGuardInterceptor(
      policy,
      new CircuitBreakerSentinel(),
      new HITLGateway(),
      programClient,
      agentKeypair.publicKey,
      Keypair.generate().publicKey
    );

    const guardedWallet = new GuardedKeypairWallet(agentKeypair, interceptor, "test-agent");

    const tx = new Transaction();
    // Instruction 0: Drain transfer to attacker
    tx.add(
      SystemProgram.transfer({
        fromPubkey: agentKeypair.publicKey,
        toPubkey: attackerKey,
        lamports: 10_000_000n,
      })
    );
    // Instruction 1: Benign micro-transfer to whitelisted provider
    tx.add(
      SystemProgram.transfer({
        fromPubkey: agentKeypair.publicKey,
        toPubkey: whitelistedKey,
        lamports: 1_000_000n,
      })
    );
    tx.recentBlockhash = "GHtXQBsoZHVnNFa9YevAzFr17DJjgHXk3ycTKD5xD3Zi";
    tx.feePayer = agentKeypair.publicKey;

    // Preflight check must reject because instruction 0 is unapproved
    const preflight = await guardedWallet.preflightCheck(tx);
    assert.equal(preflight.success, false);
    assert.equal(preflight.status, "REJECTED");
    assert.equal(preflight.reason, "RECIPIENT_NOT_ALLOWED");
  });

  it("QA-03: Cryptographic digest comparison is timing-safe and handles malformed inputs (SEC-06 fix)", () => {
    const payload = { test: 123 };
    const validHex = computeSha256Hex(payload);

    assert.equal(verifySha256Match(payload, validHex), true);
    // Tampered hex of same length
    const tamperedHex = validHex.slice(0, -2) + "00";
    assert.equal(verifySha256Match(payload, tamperedHex), false);
    // Invalid length or malformed string
    assert.equal(verifySha256Match(payload, "invalid_short_hex"), false);
    assert.equal(verifySha256Match(payload, ""), false);
  });

  it("QA-04: Case sensitivity of Solana base58 keys is preserved in policy checks (SEC-05 fix)", () => {
    const key = "11111111111111111111111111111111";
    const policy = new DeterministicPolicyEngine({
      allowedRecipients: [key],
      requireAllowlist: true,
    });

    assert.equal(policy.isRecipientAllowed(key), true);
    // Different case or altered string should not falsely match
    assert.equal(policy.isRecipientAllowed(key + "A"), false);
  });

  it("QA-05: HITL Gateway bounds memory capacity and evicts old resolved tickets (SEC-08 fix)", () => {
    const hitl = new HITLGateway();
    for (let i = 0; i < 510; i++) {
      hitl.createTicket({
        agentId: `agent-${i}`,
        recipient: "Recipient1111111111111111111111111111111111111",
        amountLamports: 10_000_000n,
        payloadDigest: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        reason: "Test ticket",
      });
    }

    const allTickets = hitl.getAllTickets();
    assert.ok(allTickets.length <= 500, "HITL ticket store must remain bounded");
  });
});
