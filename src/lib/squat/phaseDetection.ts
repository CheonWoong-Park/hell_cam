import { squatConfig } from '../config/squatConfig';
import type { SquatMetrics, SquatPhase } from '../../types/squat';

type SquatConfig = typeof squatConfig;

export function detectSquatPhase(
  metrics: SquatMetrics,
  previousPhase: SquatPhase,
  config: SquatConfig = squatConfig,
): SquatPhase {
  if (!metrics.bodyInFrame || metrics.confidence < config.confidence.minAverageScore) {
    return 'idle';
  }

  const averageKneeAngle = averageNullable(metrics.leftKneeAngle, metrics.rightKneeAngle);
  // Returning to standing is driven primarily by the knees straightening, which is
  // robust to calibration error, and only loosely gated by hip depth. Depth ratio
  // depends on the calibrated baseline, so a strict depth gate here can trap the
  // lifter in `ascending` forever and never close the rep.
  const looksStanding =
    averageKneeAngle === null
      ? metrics.hipDepthRatio <= config.phase.standingHipRatio
      : averageKneeAngle >= config.phase.minStandingKneeAngle &&
        metrics.hipDepthRatio <= config.phase.standingExitHipRatio;
  const looksBottom =
    metrics.hipDepthRatio >= config.phase.bottomHipRatio ||
    (averageKneeAngle !== null && averageKneeAngle <= config.phase.bottomKneeAngle);
  const movingDown =
    metrics.hipVerticalVelocity >= config.phase.descentVelocityThreshold ||
    metrics.hipDepthRatio >= config.phase.descendingHipRatio;
  const movingUp = metrics.hipVerticalVelocity <= config.phase.ascentVelocityThreshold;

  let candidate: SquatPhase = previousPhase;

  if (looksStanding) {
    candidate = 'standing';
  } else if (looksBottom) {
    candidate = 'bottom';
  } else if (movingDown && previousPhase !== 'bottom' && previousPhase !== 'ascending') {
    candidate = 'descending';
  } else if (movingUp || previousPhase === 'bottom') {
    candidate = 'ascending';
  } else if (previousPhase === 'idle') {
    candidate = looksStanding ? 'standing' : 'idle';
  }

  return applyPhaseHysteresis(legalizeTransition(candidate, previousPhase), previousPhase, metrics, config);
}

export function applyPhaseHysteresis(
  currentCandidate: SquatPhase,
  previousPhase: SquatPhase,
  metrics: SquatMetrics,
  config: SquatConfig = squatConfig,
): SquatPhase {
  if (previousPhase === 'idle') {
    return currentCandidate === 'standing' ? 'standing' : 'idle';
  }

  if (previousPhase === 'standing' && currentCandidate === 'descending') {
    return metrics.hipDepthRatio > config.phase.standingHipRatio + config.phase.hysteresisMargin
      ? 'descending'
      : 'standing';
  }

  if (previousPhase === 'descending' && currentCandidate === 'standing') {
    return metrics.hipDepthRatio < config.phase.standingHipRatio - config.phase.hysteresisMargin
      ? 'standing'
      : 'descending';
  }

  if (previousPhase === 'descending' && currentCandidate === 'bottom') {
    return metrics.hipDepthRatio > config.phase.bottomHipRatio - config.phase.hysteresisMargin
      ? 'bottom'
      : 'descending';
  }

  if (previousPhase === 'bottom' && currentCandidate === 'ascending') {
    return metrics.hipDepthRatio < config.phase.bottomHipRatio - config.phase.hysteresisMargin ||
      metrics.hipVerticalVelocity < config.phase.ascentVelocityThreshold
      ? 'ascending'
      : 'bottom';
  }

  if (previousPhase === 'ascending' && currentCandidate === 'bottom') {
    return metrics.hipDepthRatio > config.phase.bottomHipRatio + config.phase.hysteresisMargin ? 'bottom' : 'ascending';
  }

  return currentCandidate;
}

function legalizeTransition(candidate: SquatPhase, previousPhase: SquatPhase): SquatPhase {
  if (candidate === previousPhase) {
    return candidate;
  }

  if (previousPhase === 'idle') {
    return candidate === 'standing' ? 'standing' : 'idle';
  }

  if (previousPhase === 'standing') {
    if (candidate === 'bottom') {
      return 'descending';
    }
    return candidate === 'descending' || candidate === 'idle' ? candidate : previousPhase;
  }

  if (previousPhase === 'descending') {
    return candidate === 'bottom' || candidate === 'standing' || candidate === 'idle' ? candidate : previousPhase;
  }

  if (previousPhase === 'bottom') {
    if (candidate === 'standing') {
      return 'ascending';
    }
    return candidate === 'ascending' || candidate === 'idle' ? candidate : previousPhase;
  }

  if (previousPhase === 'ascending') {
    return candidate === 'standing' || candidate === 'bottom' || candidate === 'idle' ? candidate : previousPhase;
  }

  return candidate;
}

function averageNullable(a: number | null, b: number | null) {
  if (a === null && b === null) {
    return null;
  }
  if (a === null) {
    return b;
  }
  if (b === null) {
    return a;
  }
  return (a + b) / 2;
}
