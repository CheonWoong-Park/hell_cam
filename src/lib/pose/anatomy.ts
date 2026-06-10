import { clamp } from './geometry';
import type { KeypointName, PoseKeypoint } from '../../types/pose';

export interface AnatomyConfig {
  /** Both endpoints need at least this score for a segment to update the prior. */
  minLearnScore: number;
  /** Slow decay of the learned max length (per second) so the prior can re-adapt. */
  maxLengthDecayPerSecond: number;
  /** Relative stretch over the learned max where suspicion starts. */
  stretchTolerance: number;
  /** Relative stretch at which the segment is fully suspicious. */
  stretchFail: number;
  /** Relative length change per second where suspicion starts (bones are rigid). */
  maxRelativeChangePerSecond: number;
  /** Relative length change per second at which the segment is fully suspicious. */
  changeFailPerSecond: number;
  /** Keypoint score multiplier floor for a fully suspicious segment. */
  minScoreScale: number;
  /** Confident observations required before the prior is enforced. */
  minObservations: number;
  /** Consecutive suspicious frames after which the new geometry is accepted. */
  maxConsecutiveSuspicious: number;
  /** Gap (seconds) beyond which frame-to-frame checks are skipped. */
  resetGapSeconds: number;
}

/**
 * Body segments whose 2D projected length is informative for a squat camera
 * (30-45° front-side). Projections foreshorten smoothly with pose, but they can
 * never exceed the true bone length and they cannot change abruptly between
 * frames — both violations indicate the detector latched onto the wrong pixels.
 */
const SEGMENTS: Array<[KeypointName, KeypointName]> = [
  ['left_shoulder', 'left_hip'],
  ['right_shoulder', 'right_hip'],
  ['left_hip', 'left_knee'],
  ['right_hip', 'right_knee'],
  ['left_knee', 'left_ankle'],
  ['right_knee', 'right_ankle'],
];

interface SegmentState {
  maxLength: number;
  lastLength: number | null;
  observations: number;
  consecutiveSuspicious: number;
}

/**
 * Anatomical plausibility filter. Learns each body segment's length prior from
 * confident frames, then downweights the confidence of keypoints whose adjacent
 * segments are implausibly stretched or change length faster than a rigid bone
 * can. Runs before the Kalman smoother, so a downweighted keypoint automatically
 * gets higher measurement noise (trusted less) instead of being hard-dropped.
 */
export class AnatomyFilter {
  private readonly segments = new Map<string, SegmentState>();
  private lastTimestamp: number | null = null;

  constructor(private readonly config: AnatomyConfig) {}

  reset(): void {
    this.segments.clear();
    this.lastTimestamp = null;
  }

  apply(keypoints: PoseKeypoint[], timestamp: number): PoseKeypoint[] {
    const dtSeconds = this.lastTimestamp === null ? null : (timestamp - this.lastTimestamp) / 1000;
    this.lastTimestamp = timestamp;
    const frameGap = dtSeconds === null || dtSeconds <= 0 || dtSeconds > this.config.resetGapSeconds;

    const byName = new Map(keypoints.map((keypoint) => [keypoint.name, keypoint]));
    const scoreScale = new Map<KeypointName, number>();

    SEGMENTS.forEach(([fromName, toName]) => {
      const from = byName.get(fromName);
      const to = byName.get(toName);
      if (!from || !to) {
        return;
      }

      const key = `${fromName}:${toName}`;
      const length = Math.hypot(from.x - to.x, from.y - to.y);
      let state = this.segments.get(key);
      if (!state) {
        state = { maxLength: 0, lastLength: null, observations: 0, consecutiveSuspicious: 0 };
        this.segments.set(key, state);
      }

      if (dtSeconds !== null && dtSeconds > 0) {
        state.maxLength *= 1 - clamp(this.config.maxLengthDecayPerSecond * dtSeconds, 0, 1);
      }

      const suspicion = this.segmentSuspicion(state, length, frameGap ? null : dtSeconds);
      if (suspicion > 0) {
        state.consecutiveSuspicious += 1;
      } else {
        state.consecutiveSuspicious = 0;
      }

      // A geometry change that persists is real (new stance, camera moved):
      // accept it so the filter does not suppress the pose forever. The prior
      // is only learned from clean frames so a glitch cannot pollute it.
      const accepted = state.consecutiveSuspicious > this.config.maxConsecutiveSuspicious;
      if (suspicion === 0 || accepted) {
        state.lastLength = length;
        const confident = from.score >= this.config.minLearnScore && to.score >= this.config.minLearnScore;
        if (confident || accepted) {
          state.maxLength = Math.max(state.maxLength, length);
          state.observations += 1;
          state.consecutiveSuspicious = 0;
        }
      }

      if (suspicion > 0 && !accepted) {
        const scale = 1 - suspicion * (1 - this.config.minScoreScale);
        [fromName, toName].forEach((name) => {
          scoreScale.set(name, Math.min(scoreScale.get(name) ?? 1, scale));
        });
      }
    });

    if (scoreScale.size === 0) {
      return keypoints;
    }

    return keypoints.map((keypoint) => {
      const scale = scoreScale.get(keypoint.name);
      return scale === undefined ? keypoint : { ...keypoint, score: keypoint.score * scale };
    });
  }

  private segmentSuspicion(state: SegmentState, length: number, dtSeconds: number | null): number {
    if (state.observations < this.config.minObservations) {
      return 0;
    }

    const stretch = state.maxLength > 0 ? length / state.maxLength - 1 : 0;
    const stretchSuspicion = mapToUnit(stretch, this.config.stretchTolerance, this.config.stretchFail);

    let changeSuspicion = 0;
    if (dtSeconds !== null && state.lastLength !== null && state.maxLength > 1) {
      // Normalize by the learned full length, not the current projection: a
      // foreshortened segment (deep squat) is short, and dividing by it would
      // make normal motion look like a glitch.
      const changeRate = Math.abs(length - state.lastLength) / state.maxLength / dtSeconds;
      changeSuspicion = mapToUnit(
        changeRate,
        this.config.maxRelativeChangePerSecond,
        this.config.changeFailPerSecond,
      );
    }

    return Math.max(stretchSuspicion, changeSuspicion);
  }
}

function mapToUnit(value: number, start: number, fail: number): number {
  if (fail <= start) {
    return value > start ? 1 : 0;
  }
  return clamp((value - start) / (fail - start), 0, 1);
}
