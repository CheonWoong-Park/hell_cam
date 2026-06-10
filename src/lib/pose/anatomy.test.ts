import { describe, expect, it } from 'vitest';
import { AnatomyFilter } from './anatomy';
import { squatConfig } from '../config/squatConfig';
import type { PoseKeypoint } from '../../types/pose';

const FRAME_MS = 33;

function standingPose(overrides: Partial<Record<PoseKeypoint['name'], { x: number; y: number }>> = {}): PoseKeypoint[] {
  const base: Array<[PoseKeypoint['name'], number, number]> = [
    ['left_shoulder', 280, 100],
    ['right_shoulder', 360, 100],
    ['left_hip', 290, 250],
    ['right_hip', 350, 250],
    ['left_knee', 288, 380],
    ['right_knee', 352, 380],
    ['left_ankle', 286, 500],
    ['right_ankle', 354, 500],
  ];

  return base.map(([name, x, y]) => ({
    name,
    x: overrides[name]?.x ?? x,
    y: overrides[name]?.y ?? y,
    score: 0.9,
  }));
}

function warmUp(filter: AnatomyFilter, frames = 20): number {
  for (let i = 0; i < frames; i += 1) {
    filter.apply(standingPose(), i * FRAME_MS);
  }
  return frames * FRAME_MS;
}

describe('AnatomyFilter', () => {
  it('passes plausible keypoints through unchanged', () => {
    const filter = new AnatomyFilter(squatConfig.anatomy);
    const t = warmUp(filter);

    const result = filter.apply(standingPose(), t);
    expect(result.every((keypoint) => keypoint.score === 0.9)).toBe(true);
  });

  it('downweights a keypoint that teleports away from its segment', () => {
    const filter = new AnatomyFilter(squatConfig.anatomy);
    const t = warmUp(filter);

    // Left knee jumps 150px in one frame: thigh and shank lengths explode.
    const glitched = filter.apply(standingPose({ left_knee: { x: 150, y: 520 } }), t);
    const knee = glitched.find((keypoint) => keypoint.name === 'left_knee');
    expect(knee && knee.score).toBeLessThan(0.4);

    // Untouched side is unaffected.
    const rightKnee = glitched.find((keypoint) => keypoint.name === 'right_knee');
    expect(rightKnee && rightKnee.score).toBe(0.9);
  });

  it('does not penalize gradual foreshortening during a descent', () => {
    const filter = new AnatomyFilter(squatConfig.anatomy);
    const t = warmUp(filter);

    // Hips sink ~5px per frame toward the knees (thigh projection shortens).
    let lastScores: number[] = [];
    for (let i = 1; i <= 20; i += 1) {
      const drop = i * 5;
      const frame = filter.apply(
        standingPose({
          left_hip: { x: 290, y: 250 + drop },
          right_hip: { x: 350, y: 250 + drop },
          left_shoulder: { x: 280, y: 100 + drop },
          right_shoulder: { x: 360, y: 100 + drop },
        }),
        t + i * FRAME_MS,
      );
      lastScores = frame.map((keypoint) => keypoint.score);
    }

    expect(lastScores.every((score) => score === 0.9)).toBe(true);
  });

  it('accepts a persistent geometry change after a few frames', () => {
    const filter = new AnatomyFilter(squatConfig.anatomy);
    const t = warmUp(filter);

    let kneeScore = 0;
    for (let i = 1; i <= squatConfig.anatomy.maxConsecutiveSuspicious + 3; i += 1) {
      const frame = filter.apply(standingPose({ left_knee: { x: 150, y: 520 } }), t + i * FRAME_MS);
      kneeScore = frame.find((keypoint) => keypoint.name === 'left_knee')?.score ?? 0;
    }

    expect(kneeScore).toBe(0.9);
  });
});
