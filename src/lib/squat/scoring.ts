import { squatConfig } from '../config/squatConfig';
import { clamp } from '../pose/geometry';
import type { FormError, FormErrorType, RepResult, SquatMetrics, WorkoutSummary } from '../../types/squat';

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
