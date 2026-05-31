import { squatConfig } from '../config/squatConfig';
import { clamp } from '../pose/geometry';
import type {
  FormError,
  FormErrorType,
  RepResult,
  RepScoreBreakdown,
  SquatMetrics,
  WorkoutSummary,
} from '../../types/squat';

export function scoreCurrentFrame(metrics: SquatMetrics, errors: FormError[]): number {
  if (!metrics.bodyInFrame) {
    return 0;
  }

  let score = clamp(metrics.confidence * 100, 0, 100);
  uniqueErrors(errors).forEach((error) => {
    score -= penaltyForSeverity(error.severity);
  });

  return Math.round(clamp(score, 0, 100));
}

export function scoreRep(metricsHistory: SquatMetrics[], errors: FormError[]) {
  if (metricsHistory.length === 0) {
    return { score: 0, depthScore: 0, stabilityScore: 0 };
  }

  const maxDepth = Math.max(...metricsHistory.map((metrics) => metrics.hipDepthRatio));
  const depthScore = clamp((maxDepth / squatConfig.form.insufficientDepthRatio) * 100, 0, 100);
  const stabilityScore =
    metricsHistory.reduce((sum, metrics) => sum + (metrics.kneeTrackingScore + metrics.asymmetryScore) / 2, 0) /
    metricsHistory.length;
  const confidenceScore =
    metricsHistory.reduce((sum, metrics) => sum + clamp(metrics.confidence * 100, 0, 100), 0) / metricsHistory.length;
  const errorPenalty = uniqueErrors(errors).reduce((sum, error) => sum + penaltyForSeverity(error.severity), 0);
  const score = depthScore * 0.34 + stabilityScore * 0.36 + confidenceScore * 0.3 - errorPenalty;

  return {
    score: Math.round(clamp(score, 0, 100)),
    depthScore: Math.round(depthScore),
    stabilityScore: Math.round(clamp(stabilityScore, 0, 100)),
  };
}

/**
 * Decomposes a rep into six 0-100 axes for the hexagon (radar) chart. Each axis
 * targets one coaching dimension so a glance shows what to work on.
 */
export function scoreRepBreakdown(metricsHistory: SquatMetrics[]): RepScoreBreakdown {
  if (metricsHistory.length === 0) {
    return { depth: 0, knee: 0, posture: 0, balance: 0, tempo: 0, stability: 0 };
  }

  const form = squatConfig.form;

  const maxDepth = Math.max(...metricsHistory.map((metrics) => metrics.hipDepthRatio));
  const depth = clamp((maxDepth / form.insufficientDepthRatio) * 100, 0, 100);

  const valgusRatios = metricsHistory
    .map((metrics) => metrics.kneeToAnkleWidthRatio)
    .filter((value): value is number => value !== null);
  const knee = valgusRatios.length
    ? mapRange(Math.min(...valgusRatios), form.kneeValgusRatio, 1.05, 45, 100)
    : clamp(average(metricsHistory.map((metrics) => metrics.kneeTrackingScore)), 0, 100);

  const leans = metricsHistory
    .map((metrics) => metrics.torsoLean)
    .filter((value): value is number => value !== null);
  const leanDelta = leans.length ? Math.max(...leans) - Math.min(...leans) : 0;
  const posture = clamp(100 - Math.max(leanDelta - form.forwardLeanDeltaDegrees, 0) * 3, 0, 100);

  const balance = clamp(average(metricsHistory.map((metrics) => metrics.asymmetryScore)), 0, 100);

  const peakDescent = Math.max(0, ...metricsHistory.map((metrics) => metrics.hipVerticalVelocity));
  const tempo = clamp(100 - Math.max(peakDescent - form.fastDescentVelocityPxPerSec, 0) / 12, 0, 100);

  const stability = clamp(
    average(metricsHistory.map((metrics) => clamp(metrics.confidence * 100, 0, 100))),
    0,
    100,
  );

  return {
    depth: Math.round(depth),
    knee: Math.round(knee),
    posture: Math.round(posture),
    balance: Math.round(balance),
    tempo: Math.round(tempo),
    stability: Math.round(stability),
  };
}

export function calculateWorkoutSummary(repResults: RepResult[]): WorkoutSummary {
  const totalReps = repResults.length;
  const goodReps = repResults.filter((rep) => rep.score >= squatConfig.scoring.goodRepThreshold).length;
  const averageScore =
    totalReps === 0 ? 0 : Math.round(repResults.reduce((sum, rep) => sum + rep.score, 0) / totalReps);
  const errorCounts = new Map<FormErrorType, { count: number; message: string }>();

  repResults.flatMap((rep) => rep.errors).forEach((error) => {
    const previous = errorCounts.get(error.type);
    errorCounts.set(error.type, {
      count: (previous?.count ?? 0) + 1,
      message: error.message,
    });
  });

  const mostFrequentErrors = Array.from(errorCounts.entries())
    .map(([type, value]) => ({ type, count: value.count, message: value.message }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);

  return {
    totalReps,
    goodReps,
    averageScore,
    mostFrequentErrors,
    repScores: repResults.map((rep) => ({ repNumber: rep.repNumber, score: rep.score })),
    comment: '',
  };
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function mapRange(value: number, inMin: number, inMax: number, outMin: number, outMax: number): number {
  if (inMax === inMin) {
    return outMin;
  }
  const ratio = clamp((value - inMin) / (inMax - inMin), 0, 1);
  return outMin + ratio * (outMax - outMin);
}

function uniqueErrors(errors: FormError[]) {
  const seen = new Set<FormErrorType>();
  return errors.filter((error) => {
    if (seen.has(error.type)) {
      return false;
    }
    seen.add(error.type);
    return true;
  });
}

function penaltyForSeverity(severity: FormError['severity']) {
  if (severity === 'critical') {
    return squatConfig.scoring.criticalPenalty;
  }
  if (severity === 'warning') {
    return squatConfig.scoring.warningPenalty;
  }
  return squatConfig.scoring.infoPenalty;
}
