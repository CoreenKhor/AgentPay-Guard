import assert from "node:assert";
import nacl from "tweetnacl";
import bs58 from "bs58";
import {
  SlidingWindowSentinel,
  RecursiveLoopDetector,
  CircuitBreakerSentinel,
  HITLGateway,
} from "../src/index.js";

console.log("\n========================================================");
console.log(" RUNNING TEST SUITE: Anomaly Sentinel & Circuit Breaker ");
console.log("========================================================\n");

// 1. Sliding Window Velocity Tracker Tests
console.log(">> Test Group 1: Sliding Window Velocity & Rate Limiters");
{
  const sentinel = new SlidingWindowSentinel([
    {
      name: "T1 Burst Protection (10s)",
      windowSeconds: 10,
      maxTransactions: 3,
      maxVolumeLamports: 100_000_000n, // 0.10 SOL
    },
    {
      name: "T2 Acceleration Protection (60s)",
      windowSeconds: 60,
      maxTransactions: 10,
      maxVolumeLamports: 300_000_000n,
    },
  ]);

  // Tx 1, 2, 3 should succeed
  assert.strictEqual(sentinel.recordAndCheck(10_000_000n, "fp-1").allowed, true);
  assert.strictEqual(sentinel.recordAndCheck(10_000_000n, "fp-2").allowed, true);
  assert.strictEqual(sentinel.recordAndCheck(10_000_000n, "fp-3").allowed, true);
  console.log("  ✓ Transactions within burst capacity allowed (3/3)");

  // Tx 4 in the same 10s window should breach frequency limit
  const burstBreach = sentinel.recordAndCheck(10_000_000n, "fp-4");
  assert.strictEqual(burstBreach.allowed, false);
  assert.strictEqual(burstBreach.metricBreached, "FREQ_10S");
  console.log(`  ✓ T1 Burst frequency breach triggered: ${burstBreach.violation}`);

  // Test volume breach on fresh window
  sentinel.reset();
  assert.strictEqual(sentinel.recordAndCheck(80_000_000n, "fp-a").allowed, true);
  const volumeBreach = sentinel.recordAndCheck(30_000_000n, "fp-b"); // 80M + 30M = 110M > 100M
  assert.strictEqual(volumeBreach.allowed, false);
  assert.strictEqual(volumeBreach.metricBreached, "VOL_10S");
  console.log(`  ✓ T1 Volume breach triggered: ${volumeBreach.violation}`);

  // Telemetry metrics
  const metrics = sentinel.getTelemetryMetrics();
  assert.strictEqual(metrics.t1BurstCount, 2);
  assert.strictEqual(metrics.t1BurstMax, 3);
  console.log("  ✓ Telemetry metrics reflect active sliding window counts");
}

// 2. Recursive Loop Detector Tests
console.log("\n>> Test Group 2: LRU Ring Buffer Recursive Loop Detector");
{
  const detector = new RecursiveLoopDetector(50, 3, 30);
  const recipient = "OracleService11111111111111111111111111111";
  const amount = 5_000_000n;
  const payloadDigest = "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890";

  const fp = detector.computeFingerprint(recipient, amount, payloadDigest);

  // Iteration 1 & 2
  const r1 = detector.recordAndCheck(fp);
  assert.strictEqual(r1.isLoop, false);
  assert.strictEqual(r1.repeatCount, 1);

  const r2 = detector.recordAndCheck(fp);
  assert.strictEqual(r2.isLoop, false);
  assert.strictEqual(r2.repeatCount, 2);
  console.log("  ✓ Normal distinct or sub-threshold tool invocations allowed");

  // Iteration 3: Tripping condition (>= 3 identical within 30s)
  const r3 = detector.recordAndCheck(fp);
  assert.strictEqual(r3.isLoop, true);
  assert.strictEqual(r3.repeatCount, 3);
  assert.strictEqual(r3.reason?.includes("Recursive execution loop detected"), true);
  console.log(`  ✓ Recursive execution loop caught at threshold 3: ${r3.reason}`);

  // Distinct call should not count toward that loop
  const fpDistinct = detector.computeFingerprint(recipient, 6_000_000n, payloadDigest);
  const rDistinct = detector.recordAndCheck(fpDistinct);
  assert.strictEqual(rDistinct.isLoop, false);
  assert.strictEqual(rDistinct.repeatCount, 1);
  console.log("  ✓ Distinct parameter signature does not falsely trip loop detector");
}

// 3. Automated Circuit Breaker Daemon Tests
console.log("\n>> Test Group 3: Automated Circuit Breaker Sentinel");
{
  let freezeDispatchedFor = "";
  let freezeReason = "";
  let listenerEventCaught = false;

  const sentinel = new CircuitBreakerSentinel(async (agentId, reason) => {
    freezeDispatchedFor = agentId;
    freezeReason = reason;
  });

  sentinel.onIncident((event) => {
    listenerEventCaught = true;
    assert.strictEqual(event.circuitStatus, "TRIPPED");
  });

  assert.strictEqual(sentinel.getStatus(), "CLOSED");
  assert.strictEqual(sentinel.isTripped(), false);
  console.log("  ✓ Initial circuit status: CLOSED");

  // Execute 3 identical transactions to trigger recursive loop
  const agentId = "agent-alpha-01";
  const recipient = "ProviderKey11111111111111111111111111111111";
  const amount = 1_000_000n;
  const digest = "hash111111111111111111111111111111111111111111111111111111111111";

  await sentinel.evaluateTransaction(agentId, recipient, amount, digest);
  await sentinel.evaluateTransaction(agentId, recipient, amount, digest);
  const tripEval = await sentinel.evaluateTransaction(agentId, recipient, amount, digest);

  assert.strictEqual(tripEval.allowed, false);
  assert.strictEqual(tripEval.circuitStatus, "TRIPPED");
  assert.strictEqual(sentinel.getStatus(), "TRIPPED");
  assert.strictEqual(sentinel.isTripped(), true);
  assert.strictEqual(freezeDispatchedFor, agentId);
  assert.strictEqual(listenerEventCaught, true);
  console.log("  ✓ Circuit breaker automatically TRIPPED upon anomaly detection");
  console.log(`  ✓ On-chain freeze callback dispatched for ${freezeDispatchedFor}`);

  // Subsequent transaction while tripped must be immediately blocked
  const blockedEval = await sentinel.evaluateTransaction(agentId, recipient, 100n, "new-digest");
  assert.strictEqual(blockedEval.allowed, false);
  assert.strictEqual(blockedEval.circuitStatus, "TRIPPED");
  console.log("  ✓ Subsequent transaction immediately blocked while circuit is TRIPPED");

  // Operator reset
  sentinel.resetCircuit("Operator cleared anomaly after inspection");
  assert.strictEqual(sentinel.getStatus(), "CLOSED");
  assert.strictEqual(sentinel.isTripped(), false);
  console.log("  ✓ Circuit manually reset by operator back to CLOSED");
}

// 4. Human-in-the-Loop Gateway Cryptographic Ticket Tests
console.log("\n>> Test Group 4: Human-in-the-Loop (HITL) Gateway");
{
  const operatorKeypair = nacl.sign.keyPair();
  const operatorPubkey = bs58.encode(operatorKeypair.publicKey);

  const hitlGateway = new HITLGateway([operatorPubkey]);

  // Create ticket
  const ticket = hitlGateway.createTicket({
    agentId: "agent-exec-01",
    recipient: "VendorPubkey111111111111111111111111111111111",
    amountLamports: 75_000_000n,
    payloadDigest: "digest-value-12345",
    reason: "Transaction exceeds 0.05 SOL autonomous ceiling",
    ttlSeconds: 60,
  });

  assert.strictEqual(ticket.status, "PENDING");
  assert.strictEqual(ticket.amountLamports, "75000000");
  console.log(`  ✓ Ticket created: ${ticket.ticketId} (status: PENDING)`);

  // Verification before approval should fail
  assert.strictEqual(hitlGateway.verifyApproval(ticket).valid, false);

  // Approve with operator secret key
  const approvedTicket = hitlGateway.approveTicket(ticket.ticketId, operatorKeypair.secretKey);
  assert.strictEqual(approvedTicket.status, "APPROVED");
  assert.strictEqual(approvedTicket.operatorPubkey, operatorPubkey);
  assert.strictEqual(typeof approvedTicket.signature, "string");

  // Cryptographic verification
  const verification = hitlGateway.verifyApproval(approvedTicket);
  assert.strictEqual(verification.valid, true);
  console.log("  ✓ Ed25519 signature cryptographically verified against operator pubkey");

  // Forgery test: tampered signature
  const fakeTicket = { ...approvedTicket, signature: bs58.encode(new Uint8Array(64).fill(7)) };
  const fakeVerification = hitlGateway.verifyApproval(fakeTicket);
  assert.strictEqual(fakeVerification.valid, false);
  console.log("  ✓ Forged/tampered operator signature successfully rejected");
}

console.log("\n========================================================");
console.log(" ALL ANOMALY SENTINEL TESTS PASSED SUCCESSFULLY (100%) ");
console.log("========================================================\n");
