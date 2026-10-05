import { createHash, timingSafeEqual } from "node:crypto";
import { blake3 } from "@noble/hashes/blake3";
import { bytesToHex } from "@noble/hashes/utils";
import { canonicalizeJson } from "./canonicalize.js";

/**
 * Computes a SHA-256 digest of any payload after RFC 8785 canonicalization.
 * Returns raw 32-byte Uint8Array for Solana instruction alignment.
 */
export function computeSha256Digest(payload: unknown): Uint8Array {
  const canonical = typeof payload === "string" ? payload : canonicalizeJson(payload);
  const hash = createHash("sha256").update(canonical, "utf8").digest();
  return new Uint8Array(hash);
}

/**
 * Computes a hex-encoded SHA-256 string for audit receipts and telemetry logging.
 */
export function computeSha256Hex(payload: unknown): string {
  const canonical = typeof payload === "string" ? payload : canonicalizeJson(payload);
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

/**
 * Computes a BLAKE3 digest of any payload after RFC 8785 canonicalization.
 * Returns raw 32-byte Uint8Array.
 */
export function computeBlake3Digest(payload: unknown): Uint8Array {
  const canonical = typeof payload === "string" ? payload : canonicalizeJson(payload);
  const data = new TextEncoder().encode(canonical);
  return blake3(data);
}

/**
 * Computes a hex-encoded BLAKE3 string for ultra-fast payload commitment.
 */
export function computeBlake3Hex(payload: unknown): string {
  const digest = computeBlake3Digest(payload);
  return bytesToHex(digest);
}

/**
 * Verifies that a delivered service payload matches an expected SHA-256 digest.
 * Employs constant-time timingSafeEqual comparison to eliminate timing side-channel leaks.
 */
export function verifySha256Match(payload: unknown, expectedHex: string): boolean {
  try {
    const computedDigest = computeSha256Digest(payload);
    const expectedBuffer = Buffer.from(expectedHex.trim(), "hex");
    if (computedDigest.length !== expectedBuffer.length) {
      return false;
    }
    return timingSafeEqual(Buffer.from(computedDigest), expectedBuffer);
  } catch {
    return false;
  }
}

/**
 * Verifies that a delivered service payload matches an expected BLAKE3 digest.
 * Employs constant-time timingSafeEqual comparison to eliminate timing side-channel leaks.
 */
export function verifyBlake3Match(payload: unknown, expectedHex: string): boolean {
  try {
    const computedDigest = computeBlake3Digest(payload);
    const expectedBuffer = Buffer.from(expectedHex.trim(), "hex");
    if (computedDigest.length !== expectedBuffer.length) {
      return false;
    }
    return timingSafeEqual(Buffer.from(computedDigest), expectedBuffer);
  } catch {
    return false;
  }
}

/**
 * Universal digest matcher: checks matching against either SHA-256 or BLAKE3 digests.
 */
export function verifyDigestMatch(
  payload: unknown,
  expectedHex: string,
  algorithm: "sha256" | "blake3" = "sha256"
): boolean {
  if (algorithm === "blake3") {
    return verifyBlake3Match(payload, expectedHex);
  }
  return verifySha256Match(payload, expectedHex);
}
