import assert from "node:assert";
import { Keypair, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import nacl from "tweetnacl";
import bs58 from "bs58";
import {
  DeterministicPolicyEngine,
  computeSha256Hex,
} from "@agentpay-guard/paybind-core";
import {
  CircuitBreakerSentinel,
  HITLGateway,
} from "@agentpay-guard/anomaly-sentinel";
import {
  AgentPayGuardInterceptor,
  AgentPayGuardProgramClient,
  GuardedKeypairWallet,
  inspectSolanaTransaction,
  createGuardedLangChainTool,
  createElizaOSGuardPlugin,
  wrapSolanaAgentKitAction,
} from "../src/index.js";

console.log("\n========================================================");
console.log(" RUNNING TEST SUITE: Agent SDK & Runtime Interceptors   ");
console.log("========================================================\n");

// Setup Shared Test State
const agentKeypair = Keypair.generate();
const sentinelKeypair = Keypair.generate();
const legitimateProvider = Keypair.generate();
const hackerKeypair = Keypair.generate();

const programClient = new AgentPayGuardProgramClient();
programClient.initializeVault({
  agentOwner: agentKeypair.publicKey,
  sentinelKey: sentinelKeypair.publicKey,
  dailySpendLimitLamports: 500_000_000n, // 0.50 SOL
  perTxLimitLamports: 100_000_000n,      // 0.10 SOL
  hitlThresholdLamports: 50_000_000n,    // 0.05 SOL
  requireAllowlist: true,
  allowedRecipients: [legitimateProvider.publicKey],
});

const policyEngine = new DeterministicPolicyEngine({
  perTxLimitLamports: 100_000_000n,
  dailyBudgetLamports: 500_000_000n,
  hitlThresholdLamports: 50_000_000n,
  requireAllowlist: true,
  allowedRecipients: [legitimateProvider.publicKey.toBase58()],
});

const sentinel = new CircuitBreakerSentinel();
const operatorKeypair = nacl.sign.keyPair();
const hitlGateway = new HITLGateway([bs58.encode(operatorKeypair.publicKey)]);

const interceptor = new AgentPayGuardInterceptor(
  policyEngine,
  sentinel,
  hitlGateway,
  programClient,
  agentKeypair.publicKey,
  sentinelKeypair.publicKey
);

// 1. Transaction Interception & Settlement Tests
console.log(">> Test Group 1: Transaction Interception & Settlement");
{
  const servicePayload = { query: "weather_data", city: "Tokyo" };
  const expectedHash = computeSha256Hex(servicePayload);

  // Normal valid settlement
  const res = await interceptor.interceptTransaction({
    agentId: "agent-01",
    recipient: legitimateProvider.publicKey.toBase58(),
    amountLamports: 10_000_000n, // 0.01 SOL
    metadata: {
      endpoint: "/v1/weather",
      servicePayload,
      expectedPayloadHash: expectedHash,
      deliveredPayload: servicePayload,
    },
    idempotencyKey: "idem-key-101",
  });

  assert.strictEqual(res.status, "SETTLED");
  assert.strictEqual(res.success, true);
  assert.strictEqual(typeof res.signature, "string");
  assert.strictEqual(typeof res.receiptPubkey, "string");
  console.log(`  ✓ Transaction successfully verified & settled: signature ${res.signature?.slice(0, 16)}...`);

  // Idempotency replay check
  const replayRes = await interceptor.interceptTransaction({
    agentId: "agent-01",
    recipient: legitimateProvider.publicKey.toBase58(),
    amountLamports: 10_000_000n,
    metadata: {
      endpoint: "/v1/weather",
      servicePayload,
    },
    idempotencyKey: "idem-key-101",
  });
  assert.strictEqual(replayRes.signature, res.signature);
  console.log("  ✓ Idempotency key successfully returned cached settlement receipt");

  // Payload mismatch check (Provider tampered response)
  const tamperedPayload = { query: "weather_data", city: "Hacked" };
  const mismatchRes = await interceptor.interceptTransaction({
    agentId: "agent-01",
    recipient: legitimateProvider.publicKey.toBase58(),
    amountLamports: 10_000_000n,
    metadata: {
      endpoint: "/v1/weather",
      servicePayload,
      expectedPayloadHash: expectedHash,
      deliveredPayload: tamperedPayload,
    },
  });
  assert.strictEqual(mismatchRes.status, "PAYLOAD_MISMATCH");
  assert.strictEqual(mismatchRes.success, false);
  assert.strictEqual(mismatchRes.error?.includes("Payload substitution attack detected"), true);
  console.log("  ✓ Payload substitution attack correctly flagged with status PAYLOAD_MISMATCH");

  // Non-allowlisted recipient rejection with descriptive error string
  const rogueRes = await interceptor.interceptTransaction({
    agentId: "agent-01",
    recipient: hackerKeypair.publicKey.toBase58(),
    amountLamports: 5_000_000n,
    metadata: {
      endpoint: "/drain",
      servicePayload: {},
    },
  });
  assert.strictEqual(rogueRes.status, "REJECTED");
  assert.strictEqual(rogueRes.success, false);
  assert.strictEqual(rogueRes.error?.includes("Policy violation"), true);
  console.log(`  ✓ Unauthorized recipient rejected with LLM replanning string: ${rogueRes.error}`);
}

// 2. Solana Transaction Inspection & Guarded Wallet Adapter
console.log("\n>> Test Group 2: Solana Web3 Inspection & Guarded Wallet Adapter");
{
  sentinel.resetCircuit("Reset between test groups");
  programClient.unfreezeVault(agentKeypair.publicKey, agentKeypair.publicKey);

  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: agentKeypair.publicKey,
      toPubkey: legitimateProvider.publicKey,
      lamports: 15_000_000, // 0.015 SOL
    })
  );
  tx.recentBlockhash = "GHtXQBsoZHVnNFa9YevAzFr17DJjgHXk3ycTKD5xD3Zi";
  tx.feePayer = agentKeypair.publicKey;

  const inspection = inspectSolanaTransaction(tx);
  assert.strictEqual(inspection.recipient, legitimateProvider.publicKey.toBase58());
  assert.strictEqual(inspection.amountLamports, 15_000_000n);
  console.log("  ✓ Solana Transaction parser accurately extracted recipient and lamports");

  const guardedWallet = new GuardedKeypairWallet(agentKeypair, interceptor, "wallet-agent");
  assert.strictEqual(guardedWallet.publicKey.toBase58(), agentKeypair.publicKey.toBase58());

  // Sign transaction through guard
  const signedTx = await guardedWallet.signTransaction(tx);
  assert.strictEqual(signedTx.signatures.length >= 1, true);
  console.log("  ✓ GuardedKeypairWallet approved and signed transaction");

  // Attempt signing an unauthorized transaction (to hacker)
  const badTx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: agentKeypair.publicKey,
      toPubkey: hackerKeypair.publicKey,
      lamports: 20_000_000,
    })
  );
  badTx.recentBlockhash = "GHtXQBsoZHVnNFa9YevAzFr17DJjgHXk3ycTKD5xD3Zi";
  badTx.feePayer = agentKeypair.publicKey;

  let signingBlocked = false;
  try {
    await guardedWallet.signTransaction(badTx);
  } catch (err: any) {
    signingBlocked = true;
    assert.strictEqual(err.message.includes("Signing rejected"), true);
  }
  assert.strictEqual(signingBlocked, true);
  console.log("  ✓ Unauthorized transaction signing halted before keypair signature");
}

// 3. Framework Integrations: LangChain, ElizaOS, Solana Agent Kit
console.log("\n>> Test Group 3: Agent Framework Integrations");
{
  sentinel.resetCircuit("Reset between test groups");
  programClient.unfreezeVault(agentKeypair.publicKey, agentKeypair.publicKey);
  // A. LangChain Tool Wrapper
  const guardedLangChainTool = createGuardedLangChainTool(
    interceptor,
    "fetch_market_depth",
    legitimateProvider.publicKey.toBase58(),
    (input: { pair: string }) => 5_000_000n,
    async (input: { pair: string }) => {
      return { pair: input.pair, bids: [180.5, 180.2], asks: [180.6, 180.8] };
    }
  );

  const lcSuccess = await guardedLangChainTool({ pair: "SOL/USDC" });
  assert.strictEqual(lcSuccess.success, true);
  assert.strictEqual(lcSuccess.data?.pair, "SOL/USDC");
  console.log("  ✓ LangChain guarded tool executed with verified payment");

  // B. ElizaOS Plugin
  const elizaPlugin = createElizaOSGuardPlugin(interceptor);
  assert.strictEqual(elizaPlugin.name, "agentpay-guard");
  assert.strictEqual(elizaPlugin.actions.length, 2);

  const elizaAction = elizaPlugin.actions.find((a) => a.name === "EXECUTE_GUARDED_PAYMENT")!;
  const elizaRes = await elizaAction.handler("eliza-agent-42", {
    recipient: legitimateProvider.publicKey.toBase58(),
    amountLamports: "8000000",
    payload: { action: "query_sentiment" },
  });
  assert.strictEqual(elizaRes.status, "SETTLED");
  console.log("  ✓ ElizaOS Guard Plugin action handler validated successfully");

  // C. Solana Agent Kit Wrapper
  let kitExecuted = false;
  const guardedKitAction = wrapSolanaAgentKitAction(
    interceptor,
    "buy_gpu_compute",
    async (params: { hours: number }) => {
      kitExecuted = true;
      return { computeJobId: "job-gpu-881" };
    }
  );

  const kitResult = await guardedKitAction({
    hours: 2,
    recipient: legitimateProvider.publicKey.toBase58(),
    amountLamports: 10_000_000n,
  });
  assert.strictEqual(kitExecuted, true);
  assert.strictEqual(kitResult.computeJobId, "job-gpu-881");
  console.log("  ✓ Solana Agent Kit wrapper validated successfully");
}

console.log("\n========================================================");
console.log(" ALL AGENT SDK TESTS PASSED SUCCESSFULLY (100%)         ");
console.log("========================================================\n");
