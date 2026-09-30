import { randomBytes } from "node:crypto";
import { computeSha256Digest, computeSha256Hex, computeBlake3Hex, verifyDigestMatch } from "./hashing.js";
import { canonicalizeJson } from "./canonicalize.js";

export interface PayBindManifest {
  sessionId: string;
  providerPubkey: string;
  resourceEndpoint: string;
  expectedPayloadHash: string; // 32-byte hex hash of expected quote or data schema
  maxCostLamports: string;     // Stored as string for JSON serialization safety
  nonce: number;
  deadlineUnix: number;
  hashAlgorithm?: "sha256" | "blake3";
}

export interface CreateManifestParams {
  providerPubkey: string;
  resourceEndpoint: string;
  expectedPayloadHash: string;
  maxCostLamports: bigint;
  ttlSeconds?: number;
  customSessionId?: string;
  hashAlgorithm?: "sha256" | "blake3";
}

/**
 * Creates a cryptographically bound PayBind intent manifest.
 */
export function createPayBindManifest(params: CreateManifestParams): PayBindManifest {
  const sessionId = params.customSessionId || randomBytes(16).toString("hex").padStart(32, "0");
  const ttl = params.ttlSeconds ?? 120;
  const deadlineUnix = Math.floor(Date.now() / 1000) + ttl;
  const nonce = Math.floor(Math.random() * 1_000_000_000);
  const hashAlgorithm = params.hashAlgorithm ?? "sha256";

  return {
    sessionId,
    providerPubkey: params.providerPubkey,
    resourceEndpoint: params.resourceEndpoint,
    expectedPayloadHash: params.expectedPayloadHash.toLowerCase(),
    maxCostLamports: params.maxCostLamports.toString(),
    nonce,
    deadlineUnix,
    hashAlgorithm,
  };
}

/**
 * Computes the 32-byte binding digest of the manifest for submission to the Solana program.
 */
export function manifestToDigestBytes(manifest: PayBindManifest): Uint8Array {
  return computeSha256Digest(manifest);
}

/**
 * Computes the hex-encoded digest of the manifest.
 */
export function manifestToDigestHex(manifest: PayBindManifest): string {
  return computeSha256Hex(manifest);
}

/**
 * Verifies that the provider's delivered response matches the expected payload hash.
 * Protects autonomous agents against payload substitution and MITM attacks.
 */
export function verifyDeliveredPayload(
  manifest: PayBindManifest,
  deliveredPayload: unknown
): { isValid: boolean; expected: string; actual: string; algorithm: "sha256" | "blake3" } {
  const algorithm = manifest.hashAlgorithm ?? "sha256";
  const actual = algorithm === "blake3"
    ? computeBlake3Hex(deliveredPayload)
    : computeSha256Hex(deliveredPayload);

  const isValid = actual.toLowerCase() === manifest.expectedPayloadHash.toLowerCase();
  return {
    isValid,
    expected: manifest.expectedPayloadHash,
    actual,
    algorithm,
  };
}
