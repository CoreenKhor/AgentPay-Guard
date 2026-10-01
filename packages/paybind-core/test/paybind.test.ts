import { describe, it } from "node:test";
import assert from "node:assert";
import {
  canonicalizeJson,
  computeSha256Digest,
  computeSha256Hex,
  computeBlake3Digest,
  computeBlake3Hex,
  verifySha256Match,
  verifyBlake3Match,
  verifyDigestMatch,
  createPayBindManifest,
  manifestToDigestBytes,
  manifestToDigestHex,
  verifyDeliveredPayload,
  DeterministicPolicyEngine,
} from "../src/index.js";

console.log("\n========================================================");
console.log(" RUNNING TEST SUITE: PayBind Core & Deterministic Policy");
console.log("========================================================\n");

// 1. RFC 8785 Canonicalization Tests
console.log(">> Test Group 1: RFC 8785 JSON Canonicalization Scheme (JCS)");
{
  // Test key sorting
  const unordered = { z: 1, a: 2, m: { b: 3, a: 4 } };
  const canonical = canonicalizeJson(unordered);
  assert.strictEqual(canonical, '{"a":2,"m":{"a":4,"b":3},"z":1}');
  console.log("  ✓ Lexicographical UTF-16 key sorting passes");

  // Test primitive values and number formatting
  assert.strictEqual(canonicalizeJson(null), "null");
  assert.strictEqual(canonicalizeJson(true), "true");
  assert.strictEqual(canonicalizeJson(false), "false");
  assert.strictEqual(canonicalizeJson(42), "42");
  assert.strictEqual(canonicalizeJson("solana"), '"solana"');
  console.log("  ✓ Primitives (null, boolean, numbers, string) serialize correctly");

  // Test array preservation and undefined omission
  const arrayWithOmissions = [1, undefined, null, "item"];
  assert.strictEqual(canonicalizeJson(arrayWithOmissions), '[1,null,null,"item"]');

  const objWithOmissions = {
    keep: "yes",
    fn: () => {},
    undef: undefined,
    sym: Symbol("test"),
  };
  assert.strictEqual(canonicalizeJson(objWithOmissions), '{"keep":"yes"}');
  console.log("  ✓ Undefined/function/symbol omission rules conform to RFC 8785");
}

// 2. SHA-256 and BLAKE3 Hashing Tests
console.log("\n>> Test Group 2: SHA-256 and BLAKE3 Payload Hashing");
{
  const payload = { quoteId: "q-9921", costLamports: "5000000", provider: "QuickNode" };

  // SHA-256
  const shaDigest = computeSha256Digest(payload);
  const shaHex = computeSha256Hex(payload);
  assert.strictEqual(shaDigest.length, 32, "SHA-256 digest must be 32 bytes");
  assert.strictEqual(shaHex.length, 64, "SHA-256 hex must be 64 characters");
  assert.strictEqual(verifySha256Match(payload, shaHex), true);
  assert.strictEqual(verifySha256Match(payload, "00".repeat(32)), false);
  console.log("  ✓ SHA-256 32-byte digest and hex verified");

  // BLAKE3
  const blakeDigest = computeBlake3Digest(payload);
  const blakeHex = computeBlake3Hex(payload);
  assert.strictEqual(blakeDigest.length, 32, "BLAKE3 digest must be 32 bytes");
  assert.strictEqual(blakeHex.length, 64, "BLAKE3 hex must be 64 characters");
  assert.strictEqual(verifyBlake3Match(payload, blakeHex), true);
  assert.strictEqual(verifyBlake3Match(payload, "ff".repeat(32)), false);
  console.log("  ✓ BLAKE3 32-byte digest and hex verified");

  // Universal verification
  assert.strictEqual(verifyDigestMatch(payload, shaHex, "sha256"), true);
  assert.strictEqual(verifyDigestMatch(payload, blakeHex, "blake3"), true);
  console.log("  ✓ Universal verifyDigestMatch works for both SHA-256 and BLAKE3");
}

// 3. PayBind Intent Manifest & Verification Utilities
console.log("\n>> Test Group 3: PayBind Intent Manifest & Delivery Verification");
{
  const expectedData = { inferenceResult: "model_weights_pass", confidence: 0.985 };
  const expectedHash = computeSha256Hex(expectedData);

  const manifest = createPayBindManifest({
    providerPubkey: "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R",
    resourceEndpoint: "/v1/llm/inference",
    expectedPayloadHash: expectedHash,
    maxCostLamports: 10_000_000n,
    ttlSeconds: 60,
  });

  assert.strictEqual(typeof manifest.sessionId, "string");
  assert.strictEqual(manifest.sessionId.length >= 16, true);
  assert.strictEqual(manifest.expectedPayloadHash, expectedHash);
  assert.strictEqual(manifest.maxCostLamports, "10000000");

  const digestBytes = manifestToDigestBytes(manifest);
  assert.strictEqual(digestBytes.length, 32);

  // Delivery check with authentic data
  const authenticCheck = verifyDeliveredPayload(manifest, expectedData);
  assert.strictEqual(authenticCheck.isValid, true);
  assert.strictEqual(authenticCheck.actual, expectedHash);
  console.log("  ✓ Authentic service response successfully verified against manifest");

  // Delivery check with tampered/poisoned data
  const tamperedData = { inferenceResult: "adversarial_injected_response", confidence: 0.1 };
  const tamperedCheck = verifyDeliveredPayload(manifest, tamperedData);
  assert.strictEqual(tamperedCheck.isValid, false);
  assert.notStrictEqual(tamperedCheck.actual, expectedHash);
  console.log("  ✓ Tampered payload substitution successfully rejected");
}

// 4. Deterministic Spending Policy Engine Tests
console.log("\n>> Test Group 4: Deterministic Spending Policy Engine");
{
  const approvedRecipient = "ApprovedRecipient1111111111111111111111111111";
  const rogueRecipient = "RogueHacker11111111111111111111111111111111111";

  const policy = new DeterministicPolicyEngine({
    perTxLimitLamports: 100_000_000n, // 0.10 SOL
    dailyBudgetLamports: 500_000_000n, // 0.50 SOL
    hitlThresholdLamports: 50_000_000n, // 0.05 SOL
    allowedRecipients: [approvedRecipient],
    requireAllowlist: true,
  });

  // Zero amount
  const zeroRes = policy.evaluate({
    recipient: approvedRecipient,
    amountLamports: 0n,
    currentDailySpentLamports: 0n,
  });
  assert.strictEqual(zeroRes.status, "REJECTED");
  assert.strictEqual(zeroRes.category, "ZERO_OR_NEGATIVE_AMOUNT");
  console.log("  ✓ Zero or negative amount correctly rejected");

  // Non-whitelisted recipient
  const rogueRes = policy.evaluate({
    recipient: rogueRecipient,
    amountLamports: 1_000_000n,
    currentDailySpentLamports: 0n,
  });
  assert.strictEqual(rogueRes.status, "REJECTED");
  assert.strictEqual(rogueRes.category, "RECIPIENT_NOT_ALLOWED");
  console.log("  ✓ Unapproved recipient correctly rejected by policy allowlist");

  // Per-tx hard cap
  const excessiveRes = policy.evaluate({
    recipient: approvedRecipient,
    amountLamports: 150_000_000n, // 0.15 SOL > 0.10 SOL
    currentDailySpentLamports: 0n,
  });
  assert.strictEqual(excessiveRes.status, "REJECTED");
  assert.strictEqual(excessiveRes.category, "PER_TX_LIMIT_EXCEEDED");
  console.log("  ✓ Single transaction exceeding cap rejected");

  // Daily budget cumulative cap
  const dailyExcessRes = policy.evaluate({
    recipient: approvedRecipient,
    amountLamports: 40_000_000n,
    currentDailySpentLamports: 480_000_000n, // 480M + 40M = 520M > 500M
  });
  assert.strictEqual(dailyExcessRes.status, "REJECTED");
  assert.strictEqual(dailyExcessRes.category, "DAILY_BUDGET_EXCEEDED");
  console.log("  ✓ Cumulative spend exceeding 24h rolling budget rejected");

  // HITL escalation threshold
  const hitlRes = policy.evaluate({
    recipient: approvedRecipient,
    amountLamports: 60_000_000n, // 0.06 SOL >= 0.05 SOL threshold
    currentDailySpentLamports: 0n,
  });
  assert.strictEqual(hitlRes.status, "HITL_REQUIRED");
  assert.strictEqual(hitlRes.requiresHITL, true);
  assert.strictEqual(hitlRes.category, "HITL_ESCALATION_REQUIRED");
  console.log("  ✓ Transaction above autonomous threshold routes to HITL escalation");

  // Approved transaction within standard limits
  const approvedRes = policy.evaluate({
    recipient: approvedRecipient,
    amountLamports: 20_000_000n, // 0.02 SOL < 0.05 SOL
    currentDailySpentLamports: 0n,
  });
  assert.strictEqual(approvedRes.status, "APPROVED");
  assert.strictEqual(approvedRes.allowed, true);
  assert.strictEqual(approvedRes.requiresHITL, false);
  console.log("  ✓ Transaction passing all deterministic checks approved");

  // Dynamic recipient management
  policy.addAllowedRecipient(rogueRecipient);
  assert.strictEqual(policy.isRecipientAllowed(rogueRecipient), true);
  policy.removeAllowedRecipient(rogueRecipient);
  assert.strictEqual(policy.isRecipientAllowed(rogueRecipient), false);
  console.log("  ✓ Allowlist add/remove dynamic updates verified");
}

console.log("\n========================================================");
console.log(" ALL PAYBIND CORE TESTS PASSED SUCCESSFULLY (100%)      ");
console.log("========================================================\n");
