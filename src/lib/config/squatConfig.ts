import type { FormErrorType } from '../../types/squat';

export const squatConfig = {
  model: {
    type: 'SINGLEPOSE_LIGHTNING' as 'SINGLEPOSE_LIGHTNING' | 'SINGLEPOSE_THUNDER',
    backend: 'webgl',
  },
  camera: {
    width: 1280,
    height: 720,
    mirror: true,
  },
  confidence: {
    minKeypointScore: 0.35,
    minRequiredKeypointScore: 0.4,
    minAverageScore: 0.45,
    sideMinScore: 0.35,
  },
  frame: {
    marginRatio: 0.035,
  },
  smoothing: {
    keypointAlpha: 0.45,
    metricAlpha: 0.35,
    movingAverageWindow: 5,
    kalman: {
      processNoise: 4000,
      measurementNoise: 9,
      minConfidence: 0.15,
      resetGapSeconds: 0.5,
    },
  },
  calibration: {
    standingHoldMs: 2000,
    romCollectionMs: 5500,
    minStandingFrames: 10,
    defaultRangeOfMotionScale: 0.42,
    minRangeOfMotionPx: 70,
    baselinePercentile: 0.5,
    bottomPercentile: 0.9,
  },
  phase: {
    standingHipRatio: 0.18,
    standingExitHipRatio: 0.32,
    descendingHipRatio: 0.26,
    bottomHipRatio: 0.58,
    minStandingKneeAngle: 152,
    bottomKneeAngle: 120,
    descentVelocityThreshold: 24,
    ascentVelocityThreshold: -24,
    minPhaseDurationMs: 180,
    minCandidateDurationMs: 140,
    hysteresisMargin: 0.07,
    historyWindow: 18,
  },
  rep: {
    minRepDurationMs: 900,
    duplicateCooldownMs: 650,
    maxHistory: 32,
  },
  form: {
    // Depth — "below parallel" is the literature standard (hip crease below knee).
    // hipDepthRatio ~1 at the calibrated bottom; knee angle ~95-100° ≈ thighs parallel.
    insufficientDepthRatio: 0.7,
    parallelKneeAngle: 100,
    // Knee valgus (frontal-plane knee caving) — major ACL risk factor (Hewett, Myer).
    // Knees should track over/outside the feet; width ratio well below 1 => caving.
    kneeValgusRatio: 0.84,
    // Trunk flexion — excessive forward lean shifts load to the lumbar spine
    // (Schoenfeld 2010). Flagged relative to the standing baseline and an absolute cap.
    forwardLeanDeltaDegrees: 16,
    forwardLeanAbsoluteDegrees: 52,
    // Hip shoot / "good morning" — hips rising faster than the chest on the ascent.
    hipShootVelocityRatio: 1.7,
    hipShootMinVelocityPxPerSec: 110,
    // Stance width — feet should be ~shoulder width or slightly wider.
    narrowStanceRatio: 0.82,
    // Lateral weight shift / left-right asymmetry.
    weightShiftScore: 66,
    // Descent tempo — uncontrolled drop into the bottom.
    fastDescentVelocityPxPerSec: 900,
    // Lockout — full knee/hip extension at the top of each rep.
    lockoutKneeAngle: 165,
  },
  scoring: {
    goodRepThreshold: 78,
    criticalPenalty: 28,
    warningPenalty: 14,
    infoPenalty: 7,
  },
  feedback: {
    minErrorDurationMs: 300,
    cooldownMs: 900,
    maxRealtimeMessages: 2,
    priority: [
      'BODY_OUT_OF_FRAME',
      'LOW_CONFIDENCE',
      'KNEE_VALGUS',
      'EXCESSIVE_FORWARD_LEAN',
      'HIP_SHOOT',
      'WEIGHT_SHIFT',
      'INSUFFICIENT_DEPTH',
      'NARROW_STANCE',
      'FAST_DESCENT',
      'INCOMPLETE_LOCKOUT',
    ] as FormErrorType[],
  },
  drawing: {
    keypointRadius: 5,
    lineWidth: 3,
    lowConfidenceAlpha: 0.25,
  },
} as const;
