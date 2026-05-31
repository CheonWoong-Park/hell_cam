import { clamp } from './geometry';
import type { PoseKeypoint } from '../../types/pose';

export interface KalmanConfig {
  /** Acceleration variance (process noise). Higher → tracks faster but noisier. */
  processNoise: number;
  /** Base measurement variance (px²) at full confidence. */
  measurementNoise: number;
  /** Confidence floor used when scaling measurement noise. */
  minConfidence: number;
  /** Gap (seconds) beyond which the filters are re-seeded (e.g. camera restart). */
  resetGapSeconds: number;
}

/**
 * 1D constant-velocity Kalman filter.
 * State = [position, velocity]; only position is measured. Position and velocity
 * are estimated jointly, so a clean velocity estimate comes out for free.
 */
export class Kalman1D {
  private initialized = false;
  private pos = 0;
  private vel = 0;
  // Symmetric 2x2 covariance P = [[p00, p01], [p10, p11]]
  private p00 = 1;
  private p01 = 0;
  private p10 = 0;
  private p11 = 1;

  constructor(private readonly processNoise: number) {}

  get position(): number {
    return this.pos;
  }

  get velocity(): number {
    return this.vel;
  }

  get isInitialized(): boolean {
    return this.initialized;
  }

  reset(): void {
    this.initialized = false;
  }

  private seed(measurement: number): void {
    this.pos = measurement;
    this.vel = 0;
    this.p00 = 100;
    this.p01 = 0;
    this.p10 = 0;
    this.p11 = 100;
    this.initialized = true;
  }

  step(measurement: number, dt: number, measurementNoise: number): void {
    if (!this.initialized || !Number.isFinite(dt) || dt <= 0) {
      this.seed(measurement);
      return;
    }

    // --- Predict: P = F P Fᵀ + Q, with F = [[1, dt], [0, 1]] ---
    this.pos += this.vel * dt;

    const { p00, p01, p10, p11 } = this;
    let np00 = p00 + dt * (p01 + p10) + dt * dt * p11;
    let np01 = p01 + dt * p11;
    let np10 = p10 + dt * p11;
    let np11 = p11;

    // Discrete white-noise acceleration process noise Q
    const q = this.processNoise;
    const dt2 = dt * dt;
    const dt3 = dt2 * dt;
    const dt4 = dt3 * dt;
    np00 += (q * dt4) / 4;
    np01 += (q * dt3) / 2;
    np10 += (q * dt3) / 2;
    np11 += q * dt2;

    // --- Update with position measurement (H = [1, 0]) ---
    const innovation = measurement - this.pos;
    const s = np00 + measurementNoise;
    const k0 = np00 / s;
    const k1 = np10 / s;

    this.pos += k0 * innovation;
    this.vel += k1 * innovation;

    this.p00 = (1 - k0) * np00;
    this.p01 = (1 - k0) * np01;
    this.p10 = np10 - k1 * np00;
    this.p11 = np11 - k1 * np01;
  }
}

/**
 * Maintains a constant-velocity Kalman filter per keypoint axis. Returns smoothed
 * keypoints enriched with per-axis velocity (vx, vy in px/sec). Measurement noise
 * is scaled by keypoint confidence so low-confidence joints are trusted less.
 */
export class KeypointKalmanSmoother {
  private readonly filters = new Map<string, { x: Kalman1D; y: Kalman1D }>();
  private lastTimestamp: number | null = null;

  constructor(private readonly config: KalmanConfig) {}

  reset(): void {
    this.filters.clear();
    this.lastTimestamp = null;
  }

  smooth(keypoints: PoseKeypoint[], timestamp: number): PoseKeypoint[] {
    let dt = this.lastTimestamp === null ? 0 : (timestamp - this.lastTimestamp) / 1000;
    if (dt < 0 || dt > this.config.resetGapSeconds) {
      this.reset();
      dt = 0;
    }
    this.lastTimestamp = timestamp;

    return keypoints.map((keypoint) => {
      let filter = this.filters.get(keypoint.name);
      if (!filter) {
        filter = {
          x: new Kalman1D(this.config.processNoise),
          y: new Kalman1D(this.config.processNoise),
        };
        this.filters.set(keypoint.name, filter);
      }

      const confidence = clamp(keypoint.score, this.config.minConfidence, 1);
      const measurementNoise = this.config.measurementNoise / (confidence * confidence);
      filter.x.step(keypoint.x, dt, measurementNoise);
      filter.y.step(keypoint.y, dt, measurementNoise);

      return {
        ...keypoint,
        x: filter.x.position,
        y: filter.y.position,
        vx: filter.x.velocity,
        vy: filter.y.velocity,
      };
    });
  }
}
