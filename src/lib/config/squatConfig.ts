import type { FormErrorType } from '../../types/squat';

export const squatConfig = {
  model: {
    // Prefer the more accurate Thunder model; the adaptive controller downgrades
    // to Lightning when the device cannot sustain real-time inference.
    type: 'SINGLEPOSE_THUNDER' as 'SINGLEPOSE_LIGHTNING' | 'SINGLEPOSE_THUNDER',
    fallbackType: 'SINGLEPOSE_LIGHTNING' as 'SINGLEPOSE_LIGHTNING' | 'SINGLEPOSE_THUNDER',
    backendPriority: ['webgpu', 'webgl'],
    adaptive: {
      // Below this sustained FPS the phase detector starts missing fast reps.
      minFps: 21,
      sampleWindow: 40,
      // Ignore the first inferences: shader compilation dominates them.
      warmupFrames: 12,
    },
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
    marginRatio: 0.02,
    bottomMarginRatio: 0.0,
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
      // Reject measurements whose normalized innovation² exceeds ~3.5σ; a real
      // pose change re-seeds after a few consecutive rejections.
      gate: {
        nisThreshold: 12,
        maxConsecutiveRejections: 4,
      },
    },
  },
  anatomy: {
    minLearnScore: 0.5,
    maxLengthDecayPerSecond: 0.02,
    // 2D projections foreshorten but can never exceed the true bone length.
    stretchTolerance: 0.18,
    stretchFail: 0.5,
    // Bones are rigid: projected length changes from posing are slow (a squat
    // descent shortens the thigh ~1-2x/s); a detector glitch is 10x faster.
    maxRelativeChangePerSecond: 4,
    changeFailPerSecond: 10,
    minScoreScale: 0.3,
    minObservations: 12,
    maxConsecutiveSuspicious: 6,
    resetGapSeconds: 0.5,
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
    // Robust rep scoring uses sustained percentiles instead of single-frame
    // extremes. This keeps one bad MoveNet frame from dominating a rep.
    robustLowPercentile: 0.2,
    robustHighPercentile: 0.8,
    depthPartialHipRatio: 0.45,
    depthTargetHipRatio: 0.78,
    depthPartialKneeAngle: 130,
    depthTargetKneeAngle: 100,
    kneeIdealRatio: 1.03,
    kneeAcceptableRatio: 0.95,
    kneeSevereValgusRatio: 0.68,
    postureIdealLeanRangeDegrees: 10,
    postureMaxLeanRangeDegrees: 28,
    postureAbsoluteFailDegrees: 70,
    tempoMinControlledRepMs: 1200,
    tempoIdealRepMs: 1800,
    tempoTooSlowRepMs: 8000,
    tempoMinDescentMs: 420,
    tempoMinAscentMs: 360,
    stabilityTargetConfidence: 0.88,
    kneeWobbleTolerance: 0.08,
    kneeWobbleFail: 0.28,
    asymmetryWobbleTolerance: 10,
    asymmetryWobbleFail: 45,
    // DTW technique-consistency analysis across the set.
    consistency: {
      trajectorySamples: 32,
      // Average aligned hip-depth gap: below tolerance = identical technique,
      // above fail = a different movement altogether.
      toleranceGap: 0.04,
      failGap: 0.22,
      minRepsForFatigue: 6,
      fatigueSimilarityDrop: 12,
    },
    // The rep score is the weighted average of the six hexagon axes (sums to 1),
    // so the number and the chart always agree. Injury-risk / core axes weigh more.
    axisWeights: {
      depth: 0.22,
      knee: 0.22,
      posture: 0.2,
      balance: 0.16,
      tempo: 0.1,
      stability: 0.1,
    },
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
