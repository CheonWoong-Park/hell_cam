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
    insufficientDepthRatio: 0.7,
    torsoLeanDeltaDegrees: 14,
    kneeCollapseScore: 62,
    asymmetryScore: 66,
    unstableVelocityPxPerSec: 980,
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
      'INSUFFICIENT_DEPTH',
      'EXCESSIVE_TORSO_LEAN',
      'KNEE_COLLAPSE_TREND',
      'LEFT_RIGHT_ASYMMETRY',
      'UNSTABLE_TEMPO',
    ] as FormErrorType[],
  },
  drawing: {
    keypointRadius: 5,
    lineWidth: 3,
    lowConfidenceAlpha: 0.25,
  },
} as const;
