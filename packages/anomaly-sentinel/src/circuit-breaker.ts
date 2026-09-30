import { SlidingWindowSentinel, WindowCheckResult, SentinelTelemetryMetrics } from "./sliding-window.js";
import { RecursiveLoopDetector, LoopDetectionResult } from "./loop-detector.js";

export type CircuitStatus = "CLOSED" | "TRIPPED" | "HALF_OPEN";

export interface CircuitBreakerEvent {
  agentId: string;
  timestamp: number;
  reason: string;
  circuitStatus: CircuitStatus;
  incidentType: "VELOCITY_BREACH" | "RECURSIVE_LOOP" | "MANUAL_FREEZE" | "POLICY_VIOLATION";
  fingerprint?: string;
}

export type FreezeCallback = (agentId: string, reason: string) => Promise<string | void>;

export class CircuitBreakerSentinel {
  private status: CircuitStatus = "CLOSED";
  private slidingWindow: SlidingWindowSentinel;
  private loopDetector: RecursiveLoopDetector;
  private freezeCallback?: FreezeCallback;
  private incidentLog: CircuitBreakerEvent[] = [];
  private eventListeners: Array<(event: CircuitBreakerEvent) => void> = [];

  constructor(freezeCallback?: FreezeCallback) {
    this.slidingWindow = new SlidingWindowSentinel();
    this.loopDetector = new RecursiveLoopDetector();
    this.freezeCallback = freezeCallback;
  }

  public setFreezeCallback(cb: FreezeCallback): void {
    this.freezeCallback = cb;
  }

  public onIncident(listener: (event: CircuitBreakerEvent) => void): void {
    this.eventListeners.push(listener);
  }

  public getStatus(): CircuitStatus {
    return this.status;
  }

  public isTripped(): boolean {
    return this.status === "TRIPPED";
  }

  public getIncidents(): CircuitBreakerEvent[] {
    return [...this.incidentLog];
  }

  public getTelemetry(): SentinelTelemetryMetrics {
    return this.slidingWindow.getTelemetryMetrics();
  }

  /**
   * Evaluates a proposed transaction against both velocity heuristics and loop detectors.
   * If any invariant is violated, automatically trips the circuit breaker and invokes on-chain freeze.
   */
  public async evaluateTransaction(
    agentId: string,
    recipient: string,
    amountLamports: bigint,
    payloadDigest: string
  ): Promise<{
    allowed: boolean;
    circuitStatus: CircuitStatus;
    violationReason?: string;
    incidentType?: CircuitBreakerEvent["incidentType"];
  }> {
    // 1. If circuit is already tripped, block immediately
    if (this.status === "TRIPPED") {
      return {
        allowed: false,
        circuitStatus: "TRIPPED",
        violationReason: "Circuit breaker is currently TRIPPED. Treasury vault is frozen.",
        incidentType: "MANUAL_FREEZE",
      };
    }

    // 2. Compute execution fingerprint: H(recipient || amount || payload_digest)
    const fingerprint = this.loopDetector.computeFingerprint(recipient, amountLamports, payloadDigest);

    // 3. Evaluate Recursive Loop Detection
    const loopResult: LoopDetectionResult = this.loopDetector.recordAndCheck(fingerprint);
    if (loopResult.isLoop) {
      await this.tripCircuit(agentId, loopResult.reason!, "RECURSIVE_LOOP", fingerprint);
      return {
        allowed: false,
        circuitStatus: "TRIPPED",
        violationReason: loopResult.reason,
        incidentType: "RECURSIVE_LOOP",
      };
    }

    // 4. Evaluate Sliding Window Velocity & Leaky Bucket
    const windowResult: WindowCheckResult = this.slidingWindow.recordAndCheck(amountLamports, fingerprint);
    if (!windowResult.allowed) {
      await this.tripCircuit(agentId, windowResult.violation!, "VELOCITY_BREACH", fingerprint);
      return {
        allowed: false,
        circuitStatus: "TRIPPED",
        violationReason: windowResult.violation,
        incidentType: "VELOCITY_BREACH",
      };
    }

    return {
      allowed: true,
      circuitStatus: "CLOSED",
    };
  }

  /**
   * Trips the circuit breaker, logs the incident, and executes the freeze hook.
   */
  public async tripCircuit(
    agentId: string,
    reason: string,
    incidentType: CircuitBreakerEvent["incidentType"],
    fingerprint?: string
  ): Promise<void> {
    this.status = "TRIPPED";

    const incident: CircuitBreakerEvent = {
      agentId,
      timestamp: Date.now(),
      reason,
      circuitStatus: "TRIPPED",
      incidentType,
      fingerprint,
    };

    this.incidentLog.unshift(incident);

    // Trigger on-chain freeze instruction if callback configured
    if (this.freezeCallback) {
      try {
        await this.freezeCallback(agentId, reason);
      } catch (err) {
        console.error(`[Sentinel] Error executing on-chain freeze callback:`, err);
      }
    }

    // Notify registered event listeners (dashboard, websocket, webhooks)
    for (const listener of this.eventListeners) {
      try {
        listener(incident);
      } catch (e) {
        console.error("[Sentinel] Listener notification error:", e);
      }
    }
  }

  /**
   * Allows authorized human operators to manually reset the circuit breaker.
   */
  public resetCircuit(operatorNote?: string): void {
    this.status = "CLOSED";
    this.slidingWindow.reset();
    this.loopDetector.reset();

    const incident: CircuitBreakerEvent = {
      agentId: "operator",
      timestamp: Date.now(),
      reason: operatorNote || "Circuit manually reset by authorized operator",
      circuitStatus: "CLOSED",
      incidentType: "MANUAL_FREEZE",
    };
    this.incidentLog.unshift(incident);

    for (const listener of this.eventListeners) {
      try {
        listener(incident);
      } catch (e) {}
    }
  }
}
