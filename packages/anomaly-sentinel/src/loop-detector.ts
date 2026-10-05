import { createHash } from "node:crypto";

export interface LoopDetectionResult {
  isLoop: boolean;
  repeatCount: number;
  timeWindowSeconds: number;
  fingerprint: string;
  reason?: string;
}

export class RecursiveLoopDetector {
  private ringBuffer: Array<{ fingerprint: string; timestamp: number }> = [];
  private readonly maxBufferSize: number;
  private readonly loopThreshold: number;
  private readonly windowMs: number;

  constructor(
    maxBufferSize: number = 50,
    loopThreshold: number = 3,
    windowSeconds: number = 30
  ) {
    this.maxBufferSize = maxBufferSize;
    this.loopThreshold = loopThreshold;
    this.windowMs = windowSeconds * 1000;
  }

  /**
   * Generates a deterministic fingerprint for an agent tool execution:
   * H(recipient || amount || payload_digest)
   */
  public computeFingerprint(
    recipient: string,
    amountLamports: bigint,
    payloadDigest: string
  ): string {
    const raw = `${recipient.trim()}:${amountLamports.toString()}:${payloadDigest.trim().toLowerCase()}`;
    return createHash("sha256").update(raw, "utf8").digest("hex");
  }

  /**
   * Records a fingerprint in the LRU ring buffer and evaluates recursive loop conditions.
   * If identical transaction fingerprints occur >= loopThreshold times within windowSeconds,
   * returns isLoop: true.
   */
  public recordAndCheck(fingerprint: string): LoopDetectionResult {
    const now = Date.now();

    // Append to ring buffer
    this.ringBuffer.push({ fingerprint, timestamp: now });

    // Evict oldest if exceeding capacity
    if (this.ringBuffer.length > this.maxBufferSize) {
      this.ringBuffer.shift();
    }

    // Prune entries older than evaluation window
    this.ringBuffer = this.ringBuffer.filter((item) => now - item.timestamp <= this.windowMs);

    // Count identical fingerprints in the active window
    const matches = this.ringBuffer.filter((item) => item.fingerprint === fingerprint);
    const repeatCount = matches.length;

    if (repeatCount >= this.loopThreshold) {
      return {
        isLoop: true,
        repeatCount,
        timeWindowSeconds: Math.round(this.windowMs / 1000),
        fingerprint,
        reason: `Recursive execution loop detected: ${repeatCount} identical tool calls within ${Math.round(this.windowMs / 1000)}s`,
      };
    }

    return {
      isLoop: false,
      repeatCount,
      timeWindowSeconds: Math.round(this.windowMs / 1000),
      fingerprint,
    };
  }

  public getRingBuffer(): ReadonlyArray<{ fingerprint: string; timestamp: number }> {
    return [...this.ringBuffer];
  }

  public reset(): void {
    this.ringBuffer = [];
  }
}
