export interface VelocityRule {
  windowSeconds: number;
  maxTransactions: number;
  maxVolumeLamports: bigint;
  name: string;
}

export interface WindowCheckResult {
  allowed: boolean;
  violation?: string;
  metricBreached?: string;
  observedValue?: number | bigint;
  threshold?: number | bigint;
}

export interface SentinelTelemetryMetrics {
  t1BurstCount: number;
  t1BurstMax: number;
  t2AccelCount: number;
  t2AccelMax: number;
  t3HourlyVolumeLamports: bigint;
  t3HourlyMaxLamports: bigint;
  leakyBucketLevel: number;
  leakyBucketCapacity: number;
  totalRecordedTxs: number;
}

export class SlidingWindowSentinel {
  private history: { timestamp: number; amount: bigint; hash: string }[] = [];
  private rules: VelocityRule[];

  // Leaky Bucket State
  private leakyBucketCapacity: number = 100;
  private leakRatePerSec: number = 2; // leaks 2 units per second
  private leakyBucketLevel: number = 0;
  private lastLeakTimestamp: number = Date.now();

  constructor(customRules?: VelocityRule[]) {
    this.rules = customRules ?? [
      {
        name: "T1 Burst Protection (10s)",
        windowSeconds: 10,
        maxTransactions: 3,
        maxVolumeLamports: 150_000_000n, // 0.15 SOL
      },
      {
        name: "T2 Acceleration Protection (60s)",
        windowSeconds: 60,
        maxTransactions: 15,
        maxVolumeLamports: 300_000_000n, // 0.30 SOL
      },
      {
        name: "T3 Cumulative Budget Ceiling (1h)",
        windowSeconds: 3600,
        maxTransactions: 100,
        maxVolumeLamports: 500_000_000n, // 0.50 SOL
      },
    ];
  }

  private updateLeakyBucket(costUnits: number = 20): boolean {
    const now = Date.now();
    const elapsedSec = (now - this.lastLeakTimestamp) / 1000;
    this.leakyBucketLevel = Math.max(0, this.leakyBucketLevel - elapsedSec * this.leakRatePerSec);
    this.lastLeakTimestamp = now;

    if (this.leakyBucketLevel + costUnits > this.leakyBucketCapacity) {
      return false; // overflow
    }
    this.leakyBucketLevel += costUnits;
    return true;
  }

  public recordAndCheck(amount: bigint, txFingerprint: string): WindowCheckResult {
    const now = Date.now();

    // 1. Check Leaky Bucket capacity
    const bucketOk = this.updateLeakyBucket(20);
    if (!bucketOk) {
      return {
        allowed: false,
        violation: `Leaky bucket capacity overflow: level reached ${this.leakyBucketLevel.toFixed(1)} / ${this.leakyBucketCapacity}`,
        metricBreached: "LEAKY_BUCKET_OVERFLOW",
        observedValue: Math.round(this.leakyBucketLevel),
        threshold: this.leakyBucketCapacity,
      };
    }

    // 2. Add entry to sliding window history
    this.history.push({ timestamp: now, amount, hash: txFingerprint });

    // Prune entries older than the longest window
    const maxWindowMs = Math.max(...this.rules.map((r) => r.windowSeconds)) * 1000;
    this.history = this.history.filter((e) => now - e.timestamp <= maxWindowMs);

    // 3. Evaluate each sliding window rule
    for (const rule of this.rules) {
      const windowStart = now - rule.windowSeconds * 1000;
      const entries = this.history.filter((e) => e.timestamp >= windowStart);

      // Check transaction frequency
      if (entries.length > rule.maxTransactions) {
        return {
          allowed: false,
          violation: `Frequency breach [${rule.name}]: ${entries.length} txs in ${rule.windowSeconds}s (max: ${rule.maxTransactions})`,
          metricBreached: `FREQ_${rule.windowSeconds}S`,
          observedValue: entries.length,
          threshold: rule.maxTransactions,
        };
      }

      // Check transaction volume
      const totalVolume = entries.reduce((acc, curr) => acc + curr.amount, 0n);
      if (totalVolume > rule.maxVolumeLamports) {
        return {
          allowed: false,
          violation: `Volume breach [${rule.name}]: ${totalVolume} lamports in ${rule.windowSeconds}s (max: ${rule.maxVolumeLamports})`,
          metricBreached: `VOL_${rule.windowSeconds}S`,
          observedValue: totalVolume,
          threshold: rule.maxVolumeLamports,
        };
      }
    }

    return { allowed: true };
  }

  public getTelemetryMetrics(): SentinelTelemetryMetrics {
    const now = Date.now();
    const t1Entries = this.history.filter((e) => now - e.timestamp <= 10_000);
    const t2Entries = this.history.filter((e) => now - e.timestamp <= 60_000);
    const t3Entries = this.history.filter((e) => now - e.timestamp <= 3_600_000);

    const t3Volume = t3Entries.reduce((acc, curr) => acc + curr.amount, 0n);

    return {
      t1BurstCount: t1Entries.length,
      t1BurstMax: 3,
      t2AccelCount: t2Entries.length,
      t2AccelMax: 15,
      t3HourlyVolumeLamports: t3Volume,
      t3HourlyMaxLamports: 500_000_000n,
      leakyBucketLevel: Math.round(this.leakyBucketLevel),
      leakyBucketCapacity: this.leakyBucketCapacity,
      totalRecordedTxs: this.history.length,
    };
  }

  public reset(): void {
    this.history = [];
    this.leakyBucketLevel = 0;
    this.lastLeakTimestamp = Date.now();
  }
}
