import { describe, expect, it } from 'vitest';
import { dtwAverageGap, resampleTrajectory } from './dtw';
import { scoreRepSimilarity } from './scoring';

/** Hip-depth curve of a squat rep: 0 → depth → 0, over `length` frames. */
function repCurve(depth: number, length: number): number[] {
  return Array.from({ length }, (_, i) => depth * Math.sin((Math.PI * i) / (length - 1)));
}

describe('resampleTrajectory', () => {
  it('preserves endpoints and length', () => {
    const resampled = resampleTrajectory([0, 0.5, 1, 0.5, 0], 32);
    expect(resampled).toHaveLength(32);
    expect(resampled[0]).toBeCloseTo(0);
    expect(resampled[31]).toBeCloseTo(0);
    expect(Math.max(...resampled)).toBeCloseTo(1, 1);
  });

  it('handles degenerate inputs', () => {
    expect(resampleTrajectory([], 8)).toEqual([]);
    expect(resampleTrajectory([0.7], 4)).toEqual([0.7, 0.7, 0.7, 0.7]);
  });
});

describe('dtwAverageGap', () => {
  it('is zero for identical trajectories', () => {
    const curve = resampleTrajectory(repCurve(0.8, 40), 32);
    expect(dtwAverageGap(curve, curve)).toBeCloseTo(0);
  });

  it('aligns the same technique performed at a different tempo', () => {
    const fast = resampleTrajectory(repCurve(0.8, 25), 32);
    const slow = resampleTrajectory(repCurve(0.8, 70), 32);
    expect(dtwAverageGap(fast, slow)).toBeLessThan(0.03);
  });

  it('separates a shallow rep from a deep rep', () => {
    const deep = resampleTrajectory(repCurve(0.85, 40), 32);
    const shallow = resampleTrajectory(repCurve(0.4, 40), 32);
    expect(dtwAverageGap(deep, shallow)).toBeGreaterThan(0.12);
  });
});

describe('scoreRepSimilarity', () => {
  it('gives ~100 for the same technique at different speed', () => {
    const fast = resampleTrajectory(repCurve(0.8, 25), 32);
    const slow = resampleTrajectory(repCurve(0.8, 70), 32);
    expect(scoreRepSimilarity(fast, slow)).toBeGreaterThanOrEqual(95);
  });

  it('penalizes a clearly different movement', () => {
    const deep = resampleTrajectory(repCurve(0.85, 40), 32);
    const shallow = resampleTrajectory(repCurve(0.35, 40), 32);
    expect(scoreRepSimilarity(deep, shallow)).toBeLessThan(50);
  });

  it('returns 0 for an empty trajectory', () => {
    expect(scoreRepSimilarity([], resampleTrajectory(repCurve(0.8, 40), 32))).toBe(0);
  });
});
