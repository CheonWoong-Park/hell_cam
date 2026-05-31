import { squatConfig } from '../config/squatConfig';
import type { CalibrationData, FormError, SquatMetrics } from '../../types/squat';
import { formErrorMessages } from './feedback';

type SquatConfig = typeof squatConfig;

export function analyzeSquatForm(
  metrics: SquatMetrics,
  calibration: CalibrationData | null,
  config: SquatConfig = squatConfig,
): FormError[] {
  const bodyOutOfFrame = !metrics.bodyInFrame
    ? [createError('BODY_OUT_OF_FRAME', 'critical', 0.95, metrics.timestamp)]
    : [];

  if (bodyOutOfFrame.length > 0) {
    return bodyOutOfFrame;
  }

  const lowConfidence = detectLowConfidence(metrics, config);
  if (lowConfidence) {
    return [lowConfidence];
  }

  return [
    detectInsufficientDepth(metrics, calibration, config),
    detectExcessiveTorsoLean(metrics, calibration, config),
    detectKneeCollapseTrend(metrics, calibration, config),
    detectAsymmetry(metrics, calibration, config),
    detectUnstableTempo(metrics, config),
  ].filter(Boolean) as FormError[];
}

export function detectInsufficientDepth(
  metrics: SquatMetrics,
  _calibration: CalibrationData | null,
  config: SquatConfig = squatConfig,
): FormError | null {
  const depthSensitivePhase = metrics.phase === 'bottom' || metrics.phase === 'ascending';
  if (!depthSensitivePhase || metrics.hipDepthRatio >= config.form.insufficientDepthRatio) {
    return null;
  }

  return createError('INSUFFICIENT_DEPTH', 'warning', 0.75, metrics.timestamp);
}

export function detectExcessiveTorsoLean(
  metrics: SquatMetrics,
  calibration: CalibrationData | null,
  config: SquatConfig = squatConfig,
): FormError | null {
  if (metrics.torsoLean === null || metrics.phase === 'standing' || metrics.phase === 'idle') {
    return null;
  }

  const baseline = calibration?.baselineTorsoLean ?? metrics.torsoLean;
  if (metrics.torsoLean - baseline <= config.form.torsoLeanDeltaDegrees) {
    return null;
  }

  return createError('EXCESSIVE_TORSO_LEAN', 'warning', 0.7, metrics.timestamp);
}

export function detectKneeCollapseTrend(
  metrics: SquatMetrics,
  _calibration: CalibrationData | null,
  config: SquatConfig = squatConfig,
): FormError | null {
  if (metrics.phase === 'standing' || metrics.phase === 'idle') {
    return null;
  }

  if (metrics.kneeTrackingScore >= config.form.kneeCollapseScore) {
    return null;
  }

  return createError('KNEE_COLLAPSE_TREND', 'warning', 0.65, metrics.timestamp);
}

export function detectAsymmetry(
  metrics: SquatMetrics,
  _calibration: CalibrationData | null,
  config: SquatConfig = squatConfig,
): FormError | null {
  if (metrics.phase === 'standing' || metrics.phase === 'idle') {
    return null;
  }

  if (metrics.asymmetryScore >= config.form.asymmetryScore) {
    return null;
  }

  return createError('LEFT_RIGHT_ASYMMETRY', 'warning', 0.65, metrics.timestamp);
}

export function detectLowConfidence(metrics: SquatMetrics, config: SquatConfig = squatConfig): FormError | null {
  if (metrics.confidence >= config.confidence.minAverageScore) {
    return null;
  }

  return createError('LOW_CONFIDENCE', 'critical', 0.9, metrics.timestamp);
}

function detectUnstableTempo(metrics: SquatMetrics, config: SquatConfig): FormError | null {
  if (metrics.phase !== 'descending' && metrics.phase !== 'ascending') {
    return null;
  }

  if (Math.abs(metrics.hipVerticalVelocity) <= config.form.unstableVelocityPxPerSec) {
    return null;
  }

  return createError('UNSTABLE_TEMPO', 'info', 0.55, metrics.timestamp);
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
