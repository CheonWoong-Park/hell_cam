import { squatConfig } from '../config/squatConfig';
import type { FormError, PhaseHistoryEntry, RepCounterState, RepResult, SquatMetrics, SquatPhase } from '../../types/squat';
import { generateRepFeedback } from './feedback';
import { scoreRep } from './scoring';

export function createInitialRepCounterState(): RepCounterState {
  return {
    repCount: 0,
    currentPhase: 'idle',
    pendingPhase: null,
    pendingPhaseStartedAt: null,
    phaseHistory: [],
    hasReachedBottom: false,
    activeRepStartedAt: null,
    collectedMetrics: [],
    collectedErrors: [],
    repResults: [],
    lastTransitionAt: 0,
    lastCountedAt: 0,
    completedRep: null,
  };
}

export function updateRepCounter(
  previousState: RepCounterState,
  currentPhase: SquatPhase,
  metrics: SquatMetrics,
): RepCounterState {
  const stabilizedPhase = resolveStablePhase(previousState, currentPhase, metrics.timestamp);
  const nextPhase = stabilizedPhase.phase;
  const phaseChanged = nextPhase !== previousState.currentPhase;
  const nextHistory = appendPhaseHistory(previousState.phaseHistory, nextPhase, metrics.timestamp);
  const wasActive = previousState.activeRepStartedAt !== null;
  const shouldStartRep = !wasActive && (nextPhase === 'descending' || nextPhase === 'bottom');
  const activeRepStartedAt = shouldStartRep ? metrics.timestamp : previousState.activeRepStartedAt;
  const hasReachedBottom = previousState.hasReachedBottom || nextPhase === 'bottom';
  const collectedMetrics = activeRepStartedAt
    ? [...previousState.collectedMetrics, { ...metrics, phase: nextPhase }]
    : previousState.collectedMetrics;
  const countable =
    hasReachedBottom &&
    activeRepStartedAt !== null &&
    nextPhase === 'standing' &&
    shouldCountRep(nextHistory) &&
    metrics.timestamp - activeRepStartedAt >= squatConfig.rep.minRepDurationMs &&
    metrics.timestamp - previousState.lastCountedAt >= squatConfig.rep.duplicateCooldownMs;

  if (countable) {
    const completedRep = createRepResult(previousState.repCount + 1, collectedMetrics, previousState.collectedErrors);

    return {
      ...previousState,
      repCount: previousState.repCount + 1,
      currentPhase: nextPhase,
      pendingPhase: stabilizedPhase.pendingPhase,
      pendingPhaseStartedAt: stabilizedPhase.pendingPhaseStartedAt,
      phaseHistory: nextHistory,
      hasReachedBottom: false,
      activeRepStartedAt: null,
      collectedMetrics: [],
      collectedErrors: [],
      repResults: [...previousState.repResults, completedRep],
      lastTransitionAt: phaseChanged ? metrics.timestamp : previousState.lastTransitionAt,
      lastCountedAt: metrics.timestamp,
      completedRep,
    };
  }

  return {
    ...previousState,
    currentPhase: nextPhase,
    pendingPhase: stabilizedPhase.pendingPhase,
    pendingPhaseStartedAt: stabilizedPhase.pendingPhaseStartedAt,
    phaseHistory: nextHistory,
    hasReachedBottom,
    activeRepStartedAt,
    collectedMetrics,
    lastTransitionAt: phaseChanged ? metrics.timestamp : previousState.lastTransitionAt,
    completedRep: null,
  };
}

function resolveStablePhase(
  state: RepCounterState,
  candidatePhase: SquatPhase,
  timestamp: number,
): Pick<RepCounterState, 'currentPhase' | 'pendingPhase' | 'pendingPhaseStartedAt'> & { phase: SquatPhase } {
  if (candidatePhase === state.currentPhase) {
    return {
      currentPhase: state.currentPhase,
      phase: state.currentPhase,
      pendingPhase: null,
      pendingPhaseStartedAt: null,
    };
  }

  if (state.currentPhase === 'idle' && candidatePhase === 'standing') {
    return {
      currentPhase: candidatePhase,
      phase: candidatePhase,
      pendingPhase: null,
      pendingPhaseStartedAt: null,
    };
  }

  if (state.pendingPhase !== candidatePhase || state.pendingPhaseStartedAt === null) {
    return {
      currentPhase: state.currentPhase,
      phase: state.currentPhase,
      pendingPhase: candidatePhase,
      pendingPhaseStartedAt: timestamp,
    };
  }

  const candidateHeldMs = timestamp - state.pendingPhaseStartedAt;
  if (candidateHeldMs < squatConfig.phase.minCandidateDurationMs) {
    return {
      currentPhase: state.currentPhase,
      phase: state.currentPhase,
      pendingPhase: candidatePhase,
      pendingPhaseStartedAt: state.pendingPhaseStartedAt,
    };
  }

  return {
    currentPhase: candidatePhase,
    phase: candidatePhase,
    pendingPhase: null,
    pendingPhaseStartedAt: null,
  };
}

export function shouldCountRep(phaseHistory: PhaseHistoryEntry[]): boolean {
  const compactPhases = compactPhaseHistory(phaseHistory);
  const bottomIndex = compactPhases.lastIndexOf('bottom');
  const standingIndex = compactPhases.lastIndexOf('standing');

  if (bottomIndex === -1 || standingIndex === -1 || standingIndex <= bottomIndex) {
    return false;
  }

  return compactPhases.slice(0, bottomIndex + 1).includes('descending') && compactPhases.slice(bottomIndex).includes('ascending');
}

export function createRepResult(
  repNumber: number,
  collectedMetrics: SquatMetrics[],
  collectedErrors: FormError[],
): RepResult {
  const scoring = scoreRep(collectedMetrics, collectedErrors);
  const startedAt = collectedMetrics[0]?.timestamp ?? performance.now();
  const endedAt = collectedMetrics[collectedMetrics.length - 1]?.timestamp ?? startedAt;
  const uniqueErrors = uniqueErrorsByType(collectedErrors);
  const repResult: RepResult = {
    repNumber,
    score: scoring.score,
    startedAt,
    endedAt,
    durationMs: Math.round(endedAt - startedAt),
    errors: uniqueErrors,
    depthScore: scoring.depthScore,
    stabilityScore: scoring.stabilityScore,
    feedback: '',
  };

  return {
    ...repResult,
    feedback: generateRepFeedback(repResult),
  };
}

function appendPhaseHistory(history: PhaseHistoryEntry[], phase: SquatPhase, timestamp: number): PhaseHistoryEntry[] {
  const nextHistory = [...history, { phase, timestamp }];
  return nextHistory.slice(-squatConfig.rep.maxHistory);
}

function compactPhaseHistory(history: PhaseHistoryEntry[]): SquatPhase[] {
  return history.reduce<SquatPhase[]>((phases, entry) => {
    if (phases[phases.length - 1] !== entry.phase) {
      phases.push(entry.phase);
    }
    return phases;
  }, []);
}

function uniqueErrorsByType(errors: FormError[]): FormError[] {
  const seen = new Set<FormError['type']>();
  return errors.filter((error) => {
    if (seen.has(error.type)) {
      return false;
    }
    seen.add(error.type);
    return true;
  });
}
