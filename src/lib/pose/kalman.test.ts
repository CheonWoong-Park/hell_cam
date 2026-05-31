import { describe, expect, it } from 'vitest';
import { Kalman1D, KeypointKalmanSmoother } from './kalman';
import type { PoseKeypoint } from '../../types/pose';

const config = { processNoise: 4000, measurementNoise: 9, minConfidence: 0.15, resetGapSeconds: 0.5 };

describe('Kalman1D', () => {
  it('reduces noise around a constant position', () => {
    const filter = new Kalman1D(config.processNoise);
    const truth = 100;
    const measurements = [104, 96, 103, 97, 101, 99, 102, 98, 100, 101];

    let lastError = Infinity;
    measurements.forEach((measurement) => {
      filter.step(measurement, 0.033, config.measurementNoise);
      lastError = Math.abs(filter.position - truth);
    });

    expect(lastError).toBeLessThan(3);
  });

  it('estimates velocity for a moving target', () => {
    const filter = new Kalman1D(config.processNoise);
    const speed = 300; // px/sec
    const dt = 0.033;

    for (let i = 1; i <= 40; i += 1) {
      filter.step(i * speed * dt, dt, config.measurementNoise);
    }

    expect(filter.velocity).toBeGreaterThan(speed * 0.8);
    expect(filter.velocity).toBeLessThan(speed * 1.2);
  });
});

describe('KeypointKalmanSmoother', () => {
  it('enriches keypoints with velocity and tracks downward hip motion', () => {
    const smoother = new KeypointKalmanSmoother(config);
    let smoothed: PoseKeypoint[] = [];

    for (let i = 0; i < 20; i += 1) {
      smoothed = smoother.smooth([{ name: 'left_hip', x: 300, y: 200 + i * 10, score: 0.9 }], i * 33);
    }

    const hip = smoothed[0];
    expect(hip.vy).toBeDefined();
    expect(hip.vy as number).toBeGreaterThan(0); // moving down (y increasing)
  });

  it('re-seeds after a large timestamp gap', () => {
    const smoother = new KeypointKalmanSmoother(config);
    smoother.smooth([{ name: 'left_hip', x: 300, y: 200, score: 0.9 }], 0);
    smoother.smooth([{ name: 'left_hip', x: 300, y: 260, score: 0.9 }], 33);
    const afterGap = smoother.smooth([{ name: 'left_hip', x: 500, y: 500, score: 0.9 }], 5000);

    // First frame after a reset snaps to the measurement with zero velocity.
    expect(afterGap[0].x).toBeCloseTo(500);
    expect(afterGap[0].vy).toBeCloseTo(0);
  });
});
