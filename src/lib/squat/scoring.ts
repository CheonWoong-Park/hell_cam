import { squatConfig } from '../config/squatConfig';
import { clamp } from '../pose/geometry';
import { dtwAverageGap } from './dtw';
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

  let score = frameTrackingScore(metrics.confidence);
  uniqueErrors(errors).forEach((error) => {
    score -= penaltyForSeverity(error.severity);
  });

  return Math.round(clamp(score, 0, 100));
}

/**
 * Overall rep score = weighted average of the six hexagon axes, minus a penalty
 * for critical errors. Form faults (valgus, lean, …) already pull their own axis
 * down, so only critical issues (out-of-frame, low confidence) deduct on top.
 */
export function scoreFromBreakdown(breakdown: RepScoreBreakdown, errors: FormError[]): number {
  const weights = squatConfig.scoring.axisWeights;
  const weighted =
    breakdown.depth * weights.depth +
    breakdown.knee * weights.knee +
    breakdown.posture * weights.posture +
    breakdown.balance * weights.balance +
    breakdown.tempo * weights.tempo +
    breakdown.stability * weights.stability;

  const criticalPenalty = uniqueErrors(errors)
    .filter((error) => error.severity === 'critical')
    .reduce((sum) => sum + squatConfig.scoring.criticalPenalty, 0);

  return Math.round(clamp(weighted - criticalPenalty, 0, 100));
}

export function scoreRep(metricsHistory: SquatMetrics[], errors: FormError[]) {
  if (metricsHistory.length === 0) {
    return { score: 0, depthScore: 0, stabilityScore: 0, breakdown: scoreRepBreakdown([]) };
  }

  const breakdown = scoreRepBreakdown(metricsHistory);

  return {
    score: scoreFromBreakdown(breakdown, errors),
    depthScore: breakdown.depth,
    stabilityScore: breakdown.stability,
    breakdown,
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

  const loadedHistory = loadedMetrics(metricsHistory);
  const depth = scoreDepth(metricsHistory);
  const knee = scoreKnee(loadedHistory);
  const posture = scorePosture(metricsHistory, loadedHistory);
  const balance = scoreBalance(loadedHistory);
  const tempo = scoreTempo(metricsHistory);
  const stability = scoreStability(metricsHistory, loadedHistory);

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

  const repConsistency = calculateRepConsistency(repResults);

  return {
    totalReps,
    goodReps,
    averageScore,
    mostFrequentErrors,
    repScores: repResults.map((rep) => ({ repNumber: rep.repNumber, score: rep.score })),
    comment: '',
    repConsistency,
    consistencyScore:
      repConsistency.length >= 2
        ? Math.round(average(repConsistency.map((entry) => entry.similarity)))
        : null,
    fatigueDetected: detectFatigue(repConsistency),
  };
}

/** DTW similarity (0-100) between a rep trajectory and the set's reference rep. */
export function scoreRepSimilarity(trajectory: number[], template: number[]): number {
  const consistency = squatConfig.scoring.consistency;
  const gap = dtwAverageGap(trajectory, template);
  if (!Number.isFinite(gap)) {
    return 0;
  }
  return Math.round(mapRange(gap, consistency.toleranceGap, consistency.failGap, 100, 0));
}

/**
 * Compares every rep against the best-scoring rep of the set. The best rep is
 * the user's own reference technique, so consistency is personalized instead of
 * being measured against a universal template.
 */
function calculateRepConsistency(repResults: RepResult[]): Array<{ repNumber: number; similarity: number }> {
  const candidates = repResults.filter((rep) => rep.trajectory.length > 0);
  if (candidates.length < 2) {
    return [];
  }

  const template = candidates.reduce((best, rep) => (rep.score > best.score ? rep : best), candidates[0]);
  return candidates.map((rep) => ({
    repNumber: rep.repNumber,
    similarity: rep === template ? 100 : scoreRepSimilarity(rep.trajectory, template.trajectory),
  }));
}

/**
 * Fatigue heuristic: technique similarity in the closing third of the set
 * dropping well below the opening third means form is degrading with fatigue.
 */
function detectFatigue(repConsistency: Array<{ repNumber: number; similarity: number }>): boolean {
  const consistency = squatConfig.scoring.consistency;
  if (repConsistency.length < consistency.minRepsForFatigue) {
    return false;
  }

  const third = Math.floor(repConsistency.length / 3);
  const opening = average(repConsistency.slice(0, third).map((entry) => entry.similarity));
  const closing = average(repConsistency.slice(-third).map((entry) => entry.similarity));
  return opening - closing >= consistency.fatigueSimilarityDrop;
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function scoreDepth(metricsHistory: SquatMetrics[]): number {
  const scoring = squatConfig.scoring;
  const highDepth = robustHigh(metricsHistory.map((metrics) => metrics.hipDepthRatio));
  const hipScore = mapRange(highDepth, scoring.depthPartialHipRatio, scoring.depthTargetHipRatio, 45, 100);

  const kneeAngles = metricsHistory
    .map((metrics) => averageKneeAngle(metrics))
    .filter((value): value is number => value !== null);
  if (kneeAngles.length === 0) {
    return hipScore;
  }

  const deepestKneeAngle = robustLow(kneeAngles);
  const kneeScore = mapRange(
    deepestKneeAngle,
    scoring.depthPartialKneeAngle,
    scoring.depthTargetKneeAngle,
    45,
    100,
  );

  // Hip depth is the primary visual criterion, but knee flexion guards against
  // calibration drift and foreshortening in a single-camera setup.
  return clamp(Math.max(hipScore, kneeScore) * 0.65 + Math.min(hipScore, kneeScore) * 0.35, 0, 100);
}

function scoreKnee(metricsHistory: SquatMetrics[]): number {
  const ratios = metricsHistory
    .map((metrics) => metrics.kneeToAnkleWidthRatio)
    .filter((value): value is number => value !== null);

  if (ratios.length === 0) {
    return clamp(
      percentile(
        metricsHistory.map((metrics) => metrics.kneeTrackingScore),
        squatConfig.scoring.robustLowPercentile,
      ),
      0,
      100,
    );
  }

  const ratio = percentile(ratios, squatConfig.scoring.robustLowPercentile);
  return scoreKneeRatio(ratio);
}

function scorePosture(metricsHistory: SquatMetrics[], loadedHistory: SquatMetrics[]): number {
  const scoring = squatConfig.scoring;
  const leans = metricsHistory
    .map((metrics) => metrics.torsoLean)
    .filter((value): value is number => value !== null);
  if (leans.length === 0) {
    return 70;
  }

  const loadedLeans = loadedHistory
    .map((metrics) => metrics.torsoLean)
    .filter((value): value is number => value !== null);
  const loadedPeakLean = loadedLeans.length
    ? percentile(loadedLeans, scoring.robustHighPercentile)
    : percentile(leans, scoring.robustHighPercentile);
  const leanRange =
    percentile(leans, scoring.robustHighPercentile) - percentile(leans, scoring.robustLowPercentile);
  const excursionPenalty = mapRange(
    leanRange,
    scoring.postureIdealLeanRangeDegrees,
    scoring.postureMaxLeanRangeDegrees,
    0,
    38,
  );
  const absolutePenalty = mapRange(
    loadedPeakLean,
    squatConfig.form.forwardLeanAbsoluteDegrees,
    scoring.postureAbsoluteFailDegrees,
    0,
    42,
  );
  const hipShootPenalty = scoreHipShootPenalty(loadedHistory);

  return clamp(100 - excursionPenalty - absolutePenalty - hipShootPenalty, 0, 100);
}

function scoreBalance(metricsHistory: SquatMetrics[]): number {
  return clamp(
    percentile(
      metricsHistory.map((metrics) => metrics.asymmetryScore),
      squatConfig.scoring.robustLowPercentile,
    ),
    0,
    100,
  );
}

function scoreTempo(metricsHistory: SquatMetrics[]): number {
  const scoring = squatConfig.scoring;
  const startedAt = metricsHistory[0]?.timestamp ?? 0;
  const endedAt = metricsHistory[metricsHistory.length - 1]?.timestamp ?? startedAt;
  const durationMs = Math.max(endedAt - startedAt, 0);
  const durationScore =
    durationMs <= scoring.tempoIdealRepMs
      ? mapRange(durationMs, scoring.tempoMinControlledRepMs, scoring.tempoIdealRepMs, 58, 100)
      : mapRange(durationMs, scoring.tempoTooSlowRepMs, scoring.tempoIdealRepMs, 70, 100);

  const descentDuration = durationForPhase(metricsHistory, 'descending');
  const ascentDuration = durationForPhase(metricsHistory, 'ascending');
  const descentScore =
    descentDuration > 0
      ? mapRange(descentDuration, scoring.tempoMinDescentMs, scoring.tempoIdealRepMs / 2, 65, 100)
      : 88;
  const ascentScore =
    ascentDuration > 0
      ? mapRange(ascentDuration, scoring.tempoMinAscentMs, scoring.tempoIdealRepMs / 2, 65, 100)
      : 88;

  const descentVelocities = metricsHistory
    .filter((metrics) => metrics.phase === 'descending')
    .map((metrics) => Math.max(metrics.hipVerticalVelocity, 0));
  const peakDescent = descentVelocities.length
    ? percentile(descentVelocities, squatConfig.scoring.robustHighPercentile)
    : Math.max(0, ...metricsHistory.map((metrics) => metrics.hipVerticalVelocity));
  const speedPenalty = mapRange(
    peakDescent,
    squatConfig.form.fastDescentVelocityPxPerSec,
    squatConfig.form.fastDescentVelocityPxPerSec * 1.8,
    0,
    35,
  );

  return clamp(average([durationScore, descentScore, ascentScore]) - speedPenalty, 0, 100);
}

function scoreStability(metricsHistory: SquatMetrics[], loadedHistory: SquatMetrics[]): number {
  const scoring = squatConfig.scoring;
  const confidence = percentile(
    metricsHistory.map((metrics) => metrics.confidence),
    scoring.robustLowPercentile,
  );
  const trackingScore = frameTrackingScore(confidence);
  const inFrameRatio =
    (metricsHistory.filter((metrics) => metrics.bodyInFrame).length / Math.max(metricsHistory.length, 1)) * 100;
  const ratios = loadedHistory
    .map((metrics) => metrics.kneeToAnkleWidthRatio)
    .filter((value): value is number => value !== null);
  const kneeWobblePenalty =
    ratios.length >= 3
      ? mapRange(standardDeviation(ratios), scoring.kneeWobbleTolerance, scoring.kneeWobbleFail, 0, 26)
      : 0;
  const asymmetryValues = loadedHistory.map((metrics) => metrics.asymmetryScore);
  const asymmetryRange =
    asymmetryValues.length >= 3
      ? percentile(asymmetryValues, scoring.robustHighPercentile) - percentile(asymmetryValues, scoring.robustLowPercentile)
      : 0;
  const asymmetryPenalty = mapRange(
    asymmetryRange,
    scoring.asymmetryWobbleTolerance,
    scoring.asymmetryWobbleFail,
    0,
    20,
  );

  return clamp(Math.min(trackingScore, inFrameRatio) - kneeWobblePenalty - asymmetryPenalty, 0, 100);
}

function frameTrackingScore(confidence: number): number {
  if (confidence < squatConfig.confidence.minAverageScore) {
    return mapRange(confidence, 0, squatConfig.confidence.minAverageScore, 0, 55);
  }

  return mapRange(
    confidence,
    squatConfig.confidence.minAverageScore,
    squatConfig.scoring.stabilityTargetConfidence,
    55,
    100,
  );
}

function scoreKneeRatio(ratio: number): number {
  const { kneeAcceptableRatio, kneeIdealRatio, kneeSevereValgusRatio } = squatConfig.scoring;
  const valgusRatio = squatConfig.form.kneeValgusRatio;

  if (ratio >= kneeIdealRatio) {
    return 100;
  }
  if (ratio >= kneeAcceptableRatio) {
    return mapRange(ratio, kneeAcceptableRatio, kneeIdealRatio, 86, 100);
  }
  if (ratio >= valgusRatio) {
    return mapRange(ratio, valgusRatio, kneeAcceptableRatio, 58, 86);
  }
  return mapRange(ratio, kneeSevereValgusRatio, valgusRatio, 25, 58);
}

function scoreHipShootPenalty(metricsHistory: SquatMetrics[]): number {
  const ascending = metricsHistory.filter((metrics) => metrics.phase === 'ascending');
  if (ascending.length === 0) {
    return 0;
  }

  const peakHipRise = percentile(
    ascending.map((metrics) => Math.max(-metrics.hipVerticalVelocity, 0)),
    squatConfig.scoring.robustHighPercentile,
  );
  const peakShoulderRise = percentile(
    ascending.map((metrics) => Math.max(-metrics.shoulderVerticalVelocity, 0)),
    squatConfig.scoring.robustHighPercentile,
  );

  if (peakHipRise < squatConfig.form.hipShootMinVelocityPxPerSec || peakShoulderRise <= 1) {
    return 0;
  }

  const riseRatio = peakHipRise / peakShoulderRise;
  return mapRange(riseRatio, squatConfig.form.hipShootVelocityRatio, squatConfig.form.hipShootVelocityRatio * 2, 0, 28);
}

function loadedMetrics(metricsHistory: SquatMetrics[]): SquatMetrics[] {
  const loaded = metricsHistory.filter((metrics) =>
    metrics.phase === 'descending' || metrics.phase === 'bottom' || metrics.phase === 'ascending',
  );
  return loaded.length ? loaded : metricsHistory;
}

function durationForPhase(metricsHistory: SquatMetrics[], phase: SquatMetrics['phase']): number {
  return metricsHistory.reduce((sum, metrics, index) => {
    if (index === 0 || metrics.phase !== phase) {
      return sum;
    }
    const previousTimestamp = metricsHistory[index - 1].timestamp;
    return sum + Math.max(metrics.timestamp - previousTimestamp, 0);
  }, 0);
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

function percentile(values: number[], percentileValue: number): number {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const rank = clamp(percentileValue, 0, 1) * (sorted.length - 1);
  const lower = Math.floor(rank);
  const upper = Math.ceil(rank);
  if (lower === upper) {
    return sorted[lower];
  }

  const weight = rank - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

function robustLow(values: number[]): number {
  if (values.length < 5) {
    return Math.min(...values);
  }
  return percentile(values, squatConfig.scoring.robustLowPercentile);
}

function robustHigh(values: number[]): number {
  if (values.length < 5) {
    return Math.max(...values);
  }
  return percentile(values, squatConfig.scoring.robustHighPercentile);
}

function standardDeviation(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  const mean = average(values);
  const variance = average(values.map((value) => (value - mean) ** 2));
  return Math.sqrt(variance);
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
