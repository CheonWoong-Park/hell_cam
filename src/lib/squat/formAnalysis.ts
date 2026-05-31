import { squatConfig } from '../config/squatConfig';
import type { CalibrationData, FormError, SquatMetrics, SquatPhase } from '../../types/squat';
import { formErrorMessages } from './feedback';

type SquatConfig = typeof squatConfig;

const LOADED_PHASES: SquatPhase[] = ['descending', 'bottom', 'ascending'];

export function analyzeSquatForm(
  metrics: SquatMetrics,
  calibration: CalibrationData | null,
  config: SquatConfig = squatConfig,
): FormError[] {
  if (!metrics.bodyInFrame) {
    return [createError('BODY_OUT_OF_FRAME', 'critical', 0.95, metrics.timestamp)];
  }

  const lowConfidence = detectLowConfidence(metrics, config);
  if (lowConfidence) {
    return [lowConfidence];
  }

  return [
    detectKneeValgus(metrics, config),
    detectExcessiveForwardLean(metrics, calibration, config),
    detectHipShoot(metrics, config),
    detectWeightShift(metrics, config),
    detectInsufficientDepth(metrics, config),
    detectNarrowStance(metrics, config),
    detectFastDescent(metrics, config),
    detectIncompleteLockout(metrics, config),
  ].filter(Boolean) as FormError[];
}

function isLoadedPhase(phase: SquatPhase): boolean {
  return LOADED_PHASES.includes(phase);
}

function averageKneeAngle(metrics: SquatMetrics): number | null {
  if (metrics.leftKneeAngle === null && metrics.rightKneeAngle === null) {
    return null;
  }
  if (metrics.leftKneeAngle === null) {
    return metrics.rightKneeAngle;
  }
  if (metrics.rightKneeAngle === null) {
    return metrics.leftKneeAngle;
  }
  return (metrics.leftKneeAngle + metrics.rightKneeAngle) / 2;
}

export function detectInsufficientDepth(metrics: SquatMetrics, config: SquatConfig = squatConfig): FormError | null {
  if (metrics.phase !== 'bottom' && metrics.phase !== 'ascending') {
    return null;
  }

  const knee = averageKneeAngle(metrics);
  const reachedParallelByKnee = knee !== null && knee <= config.form.parallelKneeAngle;
  const reachedParallelByDepth = metrics.hipDepthRatio >= config.form.insufficientDepthRatio;
  if (reachedParallelByKnee || reachedParallelByDepth) {
    return null;
  }

  return createError('INSUFFICIENT_DEPTH', 'warning', 0.75, metrics.timestamp);
}

export function detectKneeValgus(metrics: SquatMetrics, config: SquatConfig = squatConfig): FormError | null {
  if (!isLoadedPhase(metrics.phase) || metrics.kneeToAnkleWidthRatio === null) {
    return null;
  }

  if (metrics.kneeToAnkleWidthRatio >= config.form.kneeValgusRatio) {
    return null;
  }

  return createError('KNEE_VALGUS', 'warning', 0.7, metrics.timestamp);
}

export function detectExcessiveForwardLean(
  metrics: SquatMetrics,
  calibration: CalibrationData | null,
  config: SquatConfig = squatConfig,
): FormError | null {
  if (metrics.torsoLean === null || !isLoadedPhase(metrics.phase)) {
    return null;
  }

  const baseline = calibration?.baselineTorsoLean ?? 0;
  const overBaseline = metrics.torsoLean - baseline > config.form.forwardLeanDeltaDegrees;
  const overAbsolute = metrics.torsoLean > config.form.forwardLeanAbsoluteDegrees;
  if (!overBaseline && !overAbsolute) {
    return null;
  }

  return createError('EXCESSIVE_FORWARD_LEAN', 'warning', 0.7, metrics.timestamp);
}

export function detectHipShoot(metrics: SquatMetrics, config: SquatConfig = squatConfig): FormError | null {
  if (metrics.phase !== 'ascending') {
    return null;
  }

  // Upward motion is negative vertical velocity (y grows downward).
  const hipRiseSpeed = Math.max(-metrics.hipVerticalVelocity, 0);
  const shoulderRiseSpeed = Math.max(-metrics.shoulderVerticalVelocity, 0);
  if (hipRiseSpeed < config.form.hipShootMinVelocityPxPerSec) {
    return null;
  }

  if (hipRiseSpeed <= shoulderRiseSpeed * config.form.hipShootVelocityRatio) {
    return null;
  }

  return createError('HIP_SHOOT', 'warning', 0.65, metrics.timestamp);
}

export function detectWeightShift(metrics: SquatMetrics, config: SquatConfig = squatConfig): FormError | null {
  if (!isLoadedPhase(metrics.phase)) {
    return null;
  }

  if (metrics.asymmetryScore >= config.form.weightShiftScore) {
    return null;
  }

  return createError('WEIGHT_SHIFT', 'warning', 0.65, metrics.timestamp);
}

export function detectNarrowStance(metrics: SquatMetrics, config: SquatConfig = squatConfig): FormError | null {
  if (metrics.phase !== 'standing' && metrics.phase !== 'descending') {
    return null;
  }

  if (metrics.stanceWidthRatio === null || metrics.stanceWidthRatio >= config.form.narrowStanceRatio) {
    return null;
  }

  return createError('NARROW_STANCE', 'info', 0.6, metrics.timestamp);
}

export function detectFastDescent(metrics: SquatMetrics, config: SquatConfig = squatConfig): FormError | null {
  if (metrics.phase !== 'descending') {
    return null;
  }

  // Downward motion is positive vertical velocity.
  if (metrics.hipVerticalVelocity <= config.form.fastDescentVelocityPxPerSec) {
    return null;
  }

  return createError('FAST_DESCENT', 'info', 0.55, metrics.timestamp);
}

export function detectIncompleteLockout(metrics: SquatMetrics, config: SquatConfig = squatConfig): FormError | null {
  if (metrics.phase !== 'standing') {
    return null;
  }

  const knee = averageKneeAngle(metrics);
  if (knee === null || knee >= config.form.lockoutKneeAngle) {
    return null;
  }

  return createError('INCOMPLETE_LOCKOUT', 'info', 0.55, metrics.timestamp);
}

export function detectLowConfidence(metrics: SquatMetrics, config: SquatConfig = squatConfig): FormError | null {
  if (metrics.confidence >= config.confidence.minAverageScore) {
    return null;
  }

  return createError('LOW_CONFIDENCE', 'critical', 0.9, metrics.timestamp);
}

function createError(
  type: FormError['type'],
  severity: FormError['severity'],
  confidence: number,
  timestamp: number,
): FormError {
  return {
    type,
    severity,
    message: formErrorMessages[type],
    confidence,
    timestamp,
  };
}
