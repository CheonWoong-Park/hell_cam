import { describe, expect, it } from 'vitest';
import { calculateAngle, calculateDistance } from '../pose/geometry';
import { isBodyInFrame } from '../pose/keypoints';
import { analyzeSquatForm } from './formAnalysis';
import { generateRealtimeFeedback, prioritizeErrors } from './feedback';
import { calculateSquatMetrics } from './metrics';
import { detectSquatPhase } from './phaseDetection';
import { createInitialRepCounterState, updateRepCounter } from './repCounter';
import { scoreRep } from './scoring';
import type { FormError, SquatMetrics, SquatPhase } from '../../types/squat';
import type { PoseFrame, PoseKeypoint } from '../../types/pose';
import { createCalibrationFromPoseFrame } from '../../hooks/useCalibration';

describe('geometry', () => {
  it('calculates angle and distance', () => {
    expect(calculateAngle(point('left_hip', 0, 0), point('left_knee', 0, 1), point('left_ankle', 1, 1))).toBeCloseTo(90);
    expect(calculateDistance(point('left_hip', 0, 0), point('left_knee', 3, 4))).toBeCloseTo(5);
  });
});

describe('phase detection', () => {
  it('moves through the expected squat phases', () => {
    let phase: SquatPhase = 'idle';
    phase = detectSquatPhase(metrics({ timestamp: 200, hipDepthRatio: 0.05, knee: 170 }), phase);
    expect(phase).toBe('standing');

    phase = detectSquatPhase(metrics({ timestamp: 500, hipDepthRatio: 0.36, velocity: 120, knee: 145 }), phase);
    expect(phase).toBe('descending');

    phase = detectSquatPhase(metrics({ timestamp: 800, hipDepthRatio: 0.7, velocity: 20, knee: 105 }), phase);
    expect(phase).toBe('bottom');

    phase = detectSquatPhase(metrics({ timestamp: 1100, hipDepthRatio: 0.42, velocity: -120, knee: 135 }), phase);
    expect(phase).toBe('ascending');

    phase = detectSquatPhase(metrics({ timestamp: 1450, hipDepthRatio: 0.07, velocity: -80, knee: 165 }), phase);
    expect(phase).toBe('standing');
  });
});

describe('rep counter', () => {
  it('counts only after passing bottom and returning to standing', () => {
    let state = createInitialRepCounterState();
    const phases: Array<[SquatPhase, number]> = [
      ['standing', 200],
      ['descending', 500],
      ['descending', 660],
      ['bottom', 900],
      ['bottom', 1060],
      ['ascending', 1300],
      ['ascending', 1460],
      ['standing', 1800],
      ['standing', 1960],
    ];

    phases.forEach(([phase, timestamp]) => {
      state = updateRepCounter(state, phase, metrics({ timestamp, hipDepthRatio: phase === 'bottom' ? 0.75 : 0.1 }));
    });

    expect(state.repCount).toBe(1);
  });

  it('does not count a rep without bottom', () => {
    let state = createInitialRepCounterState();
    const phases: Array<[SquatPhase, number]> = [
      ['standing', 200],
      ['descending', 500],
      ['descending', 660],
      ['ascending', 850],
      ['ascending', 1010],
      ['standing', 1300],
      ['standing', 1460],
    ];

    phases.forEach(([phase, timestamp]) => {
      state = updateRepCounter(state, phase, metrics({ timestamp }));
    });

    expect(state.repCount).toBe(0);
  });

  it('ignores a one-frame bottom jitter', () => {
    let state = createInitialRepCounterState();
    const phases: Array<[SquatPhase, number]> = [
      ['standing', 200],
      ['descending', 500],
      ['descending', 660],
      ['bottom', 760],
      ['descending', 820],
      ['ascending', 1100],
      ['ascending', 1260],
      ['standing', 1500],
      ['standing', 1660],
    ];

    phases.forEach(([phase, timestamp]) => {
      state = updateRepCounter(state, phase, metrics({ timestamp, hipDepthRatio: phase === 'bottom' ? 0.75 : 0.35 }));
    });

    expect(state.repCount).toBe(0);
  });
});

describe('form analysis and feedback', () => {
  it('prioritizes body out of frame before low confidence', () => {
    const errors: FormError[] = [
      error('LOW_CONFIDENCE', '관절 인식이 불안정합니다. 조명을 밝게 하거나 자세를 조정해 주세요.'),
      error('BODY_OUT_OF_FRAME', '전신이 화면에 들어오게 카메라를 조금 뒤로 옮겨주세요.'),
    ];

    expect(prioritizeErrors(errors)[0].type).toBe('BODY_OUT_OF_FRAME');
    expect(generateRealtimeFeedback(errors, metrics({ timestamp: 1000 }))[0]).toContain('전신');
  });

  it('returns only low confidence when landmarks are unreliable', () => {
    const errors = analyzeSquatForm(metrics({ confidence: 0.2, hipDepthRatio: 0.4, phase: 'bottom' }), null);
    expect(errors).toHaveLength(1);
    expect(errors[0].type).toBe('LOW_CONFIDENCE');
  });
});

describe('body in frame', () => {
  const fullBody = (ankleY: number): PoseKeypoint[] => [
    point('left_shoulder', 300, 120, 0.9),
    point('right_shoulder', 420, 120, 0.9),
    point('left_hip', 300, 300, 0.9),
    point('right_hip', 420, 300, 0.9),
    point('left_knee', 300, 470, 0.9),
    point('right_knee', 420, 470, 0.9),
    point('left_ankle', 300, ankleY, 0.9),
    point('right_ankle', 420, ankleY, 0.9),
  ];

  it('accepts a full body with the feet right at the bottom edge', () => {
    expect(isBodyInFrame(fullBody(640), 720, 640)).toBe(true);
  });

  it('rejects when a required joint runs off the side edge', () => {
    const keypoints = fullBody(600);
    keypoints[0] = point('left_shoulder', 4, 120, 0.9);
    expect(isBodyInFrame(keypoints, 720, 640)).toBe(false);
  });
});

describe('detailed form analysis', () => {
  const typesOf = (errors: FormError[]) => errors.map((item) => item.type);

  it('flags knees caving inward at the bottom', () => {
    const errors = analyzeSquatForm(metrics({ phase: 'bottom', kneeToAnkleWidthRatio: 0.7 }), null);
    expect(typesOf(errors)).toContain('KNEE_VALGUS');
  });

  it('flags insufficient depth when neither knee angle nor hip depth reaches parallel', () => {
    const errors = analyzeSquatForm(metrics({ phase: 'bottom', hipDepthRatio: 0.4, knee: 130 }), null);
    expect(typesOf(errors)).toContain('INSUFFICIENT_DEPTH');
  });

  it('does not flag depth once thighs reach parallel by knee angle', () => {
    const errors = analyzeSquatForm(metrics({ phase: 'bottom', hipDepthRatio: 0.4, knee: 95 }), null);
    expect(typesOf(errors)).not.toContain('INSUFFICIENT_DEPTH');
  });

  it('flags hips shooting up faster than the chest on the ascent', () => {
    const errors = analyzeSquatForm(
      metrics({ phase: 'ascending', hipVerticalVelocity: -320, shoulderVerticalVelocity: -90 }),
      null,
    );
    expect(typesOf(errors)).toContain('HIP_SHOOT');
  });

  it('flags a narrow stance while standing', () => {
    const errors = analyzeSquatForm(metrics({ phase: 'standing', stanceWidthRatio: 0.6, knee: 172 }), null);
    expect(typesOf(errors)).toContain('NARROW_STANCE');
  });

  it('flags an incomplete lockout at the top', () => {
    const errors = analyzeSquatForm(metrics({ phase: 'standing', knee: 158 }), null);
    expect(typesOf(errors)).toContain('INCOMPLETE_LOCKOUT');
  });

  it('stays quiet on a clean bottom position', () => {
    const errors = analyzeSquatForm(
      metrics({ phase: 'bottom', hipDepthRatio: 0.95, knee: 95, torsoLean: 12, kneeToAnkleWidthRatio: 1.05 }),
      { baselineTorsoLean: 10 } as never,
    );
    expect(errors).toHaveLength(0);
  });
});

describe('metrics quality gate', () => {
  it('uses required squat landmarks for confidence instead of unrelated high-score landmarks', () => {
    const poseFrame = poseFrameFromRequiredKeypoints(true, 0.25);
    const nextMetrics = calculateSquatMetrics({ ...poseFrame, averageScore: 0.95 }, null, null);

    expect(nextMetrics.confidence).toBeLessThan(0.45);
    expect(nextMetrics.leftKneeAngle).toBeNull();
    expect(nextMetrics.rightKneeAngle).toBeNull();
  });
});

describe('scoring', () => {
  it('scores a stable rep with sufficient depth', () => {
    const result = scoreRep(
      [
        metrics({ timestamp: 100, hipDepthRatio: 0.2 }),
        metrics({ timestamp: 300, hipDepthRatio: 0.78, phase: 'bottom' }),
        metrics({ timestamp: 700, hipDepthRatio: 0.1 }),
      ],
      [],
    );

    expect(result.depthScore).toBe(100);
    expect(result.score).toBeGreaterThan(80);
  });
});

describe('calibration seed', () => {
  it('does not create a fallback baseline from a bent-knee pose', () => {
    expect(createCalibrationFromPoseFrame(poseFrameFromRequiredKeypoints(false))).toBeNull();
    expect(createCalibrationFromPoseFrame(poseFrameFromRequiredKeypoints(true))).not.toBeNull();
  });
});

function point(name: PoseKeypoint['name'], x: number, y: number, score = 1): PoseKeypoint {
  return { name, x, y, score };
}

type MetricOverrides = Partial<SquatMetrics> & { knee?: number; velocity?: number };

function metrics(overrides: MetricOverrides = {}): SquatMetrics {
  const knee = overrides.knee ?? 170;

  return {
    phase: overrides.phase ?? 'standing',
    timestamp: overrides.timestamp ?? 0,
    leftKneeAngle: knee,
    rightKneeAngle: knee,
    leftHipAngle: 150,
    rightHipAngle: 150,
    torsoLean: 10,
    hipDepthRatio: overrides.hipDepthRatio ?? 0.1,
    kneeTrackingScore: 92,
    asymmetryScore: 94,
    confidence: overrides.confidence ?? 0.9,
    bodyInFrame: overrides.bodyInFrame ?? true,
    hipY: 500,
    shoulderY: 260,
    kneeDistanceRatio: 1,
    hipVerticalVelocity: overrides.hipVerticalVelocity ?? overrides.velocity ?? 0,
    shoulderVerticalVelocity: overrides.shoulderVerticalVelocity ?? 0,
    kneeToAnkleWidthRatio: overrides.kneeToAnkleWidthRatio ?? 1,
    stanceWidthRatio: overrides.stanceWidthRatio ?? 1.2,
    ...overrides,
  };
}

function error(type: FormError['type'], message: string): FormError {
  return {
    type,
    message,
    severity: type === 'BODY_OUT_OF_FRAME' || type === 'LOW_CONFIDENCE' ? 'critical' : 'warning',
    confidence: 0.9,
    timestamp: 0,
  };
}

function poseFrameFromRequiredKeypoints(standing: boolean, requiredScore = 1): PoseFrame {
  const leftAnkle = standing
    ? point('left_ankle', 300, 560, requiredScore)
    : point('left_ankle', 365, 430, requiredScore);
  const rightAnkle = standing
    ? point('right_ankle', 420, 560, requiredScore)
    : point('right_ankle', 355, 430, requiredScore);
  const keypoints = [
    point('nose', 360, 60),
    point('left_shoulder', 300, 140, requiredScore),
    point('right_shoulder', 420, 140, requiredScore),
    point('left_hip', 300, 260, requiredScore),
    point('right_hip', 420, 260, requiredScore),
    point('left_knee', 300, 400, requiredScore),
    point('right_knee', 420, 400, requiredScore),
    leftAnkle,
    rightAnkle,
  ];

  return {
    keypoints,
    timestamp: 1000,
    averageScore: 0.95,
    bodyInFrame: true,
    videoWidth: 720,
    videoHeight: 640,
  };
}
