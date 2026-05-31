import { useCallback, useEffect, useRef, useState } from 'react';
import { squatConfig } from '../lib/config/squatConfig';
import { analyzeSquatForm } from '../lib/squat/formAnalysis';
import { generateRealtimeFeedback, generateWorkoutFeedback } from '../lib/squat/feedback';
import { calculateSquatMetrics } from '../lib/squat/metrics';
import { detectSquatPhase } from '../lib/squat/phaseDetection';
import { createInitialRepCounterState, updateRepCounter } from '../lib/squat/repCounter';
import { calculateWorkoutSummary, scoreCurrentFrame } from '../lib/squat/scoring';
import type { PoseFrame } from '../types/pose';
import type {
  CalibrationData,
  FormError,
  FormErrorType,
  RepCounterState,
  RepResult,
  SquatMetrics,
  SquatPhase,
  WorkoutSummary,
} from '../types/squat';
import { createCalibrationFromPoseFrame } from './useCalibration';

interface AnalyzerState {
  metrics: SquatMetrics | null;
  phase: SquatPhase;
  errors: FormError[];
  feedback: string[];
  currentScore: number;
  repCount: number;
  repResults: RepResult[];
  lastRep: RepResult | null;
  summary: WorkoutSummary;
}

const initialFeedback = ['카메라를 시작하고 전신이 화면에 들어오게 서 주세요.'];

function createEmptyAnalyzerState(): AnalyzerState {
  const emptySummary = calculateWorkoutSummary([]);

  return {
    metrics: null,
    phase: 'idle',
    errors: [],
    feedback: initialFeedback,
    currentScore: 0,
    repCount: 0,
    repResults: [],
    lastRep: null,
    summary: { ...emptySummary, comment: generateWorkoutFeedback(emptySummary) },
  };
}

export function useSquatAnalyzer(
  poseFrame: PoseFrame | null,
  calibrationData: CalibrationData | null,
  isRunning: boolean,
) {
  const [analyzerState, setAnalyzerState] = useState<AnalyzerState>(() => createEmptyAnalyzerState());

  const previousMetricsRef = useRef<SquatMetrics | null>(null);
  const phaseRef = useRef<SquatPhase>('idle');
  const counterRef = useRef<RepCounterState>(createInitialRepCounterState());
  const fallbackCalibrationRef = useRef<CalibrationData | null>(null);
  const activeErrorStartedAtRef = useRef<Map<FormErrorType, number>>(new Map());
  const lastFeedbackRef = useRef<{ messages: string[]; timestamp: number }>({
    messages: initialFeedback,
    timestamp: 0,
  });

  useEffect(() => {
    if (!poseFrame) {
      return;
    }

    const activeCalibration =
      calibrationData ?? fallbackCalibrationRef.current ?? createCalibrationFromPoseFrame(poseFrame);
    if (!calibrationData && activeCalibration && !fallbackCalibrationRef.current) {
      fallbackCalibrationRef.current = activeCalibration;
    }

    const rawMetrics = calculateSquatMetrics(poseFrame, activeCalibration, previousMetricsRef.current);
    const nextPhase = detectSquatPhase(rawMetrics, phaseRef.current, squatConfig);
    const nextMetrics = { ...rawMetrics, phase: nextPhase };
    const rawErrors = analyzeSquatForm(nextMetrics, activeCalibration, squatConfig);
    const stableErrors = stabilizeErrors(rawErrors, poseFrame.timestamp, activeErrorStartedAtRef.current);
    const nextScore = scoreCurrentFrame(nextMetrics, stableErrors);
    const nextFeedback = feedbackWithCooldown(stableErrors, nextMetrics, poseFrame.timestamp, lastFeedbackRef.current);

    previousMetricsRef.current = nextMetrics;
    phaseRef.current = nextPhase;

    if (isRunning) {
      const stateWithErrors = {
        ...counterRef.current,
        collectedErrors: [...counterRef.current.collectedErrors, ...stableErrors],
      };
      const nextCounter = updateRepCounter(stateWithErrors, nextPhase, nextMetrics);
      counterRef.current = nextCounter;
    }

    const nextSummary = calculateWorkoutSummary(counterRef.current.repResults);
    setAnalyzerState({
      metrics: nextMetrics,
      phase: nextPhase,
      errors: stableErrors,
      feedback: nextFeedback,
      currentScore: nextScore,
      repCount: counterRef.current.repCount,
      repResults: counterRef.current.repResults,
      lastRep: counterRef.current.repResults[counterRef.current.repResults.length - 1] ?? null,
      summary: { ...nextSummary, comment: generateWorkoutFeedback(nextSummary) },
    });
  }, [poseFrame, calibrationData, isRunning]);

  const resetAnalyzer = useCallback(() => {
    previousMetricsRef.current = null;
    phaseRef.current = 'idle';
    counterRef.current = createInitialRepCounterState();
    activeErrorStartedAtRef.current.clear();
    fallbackCalibrationRef.current = null;
    lastFeedbackRef.current = { messages: initialFeedback, timestamp: 0 };
    setAnalyzerState(createEmptyAnalyzerState());
  }, []);

  return {
    ...analyzerState,
    resetAnalyzer,
  };
}

function stabilizeErrors(
  rawErrors: FormError[],
  timestamp: number,
  activeSince: Map<FormErrorType, number>,
): FormError[] {
  const currentTypes = new Set(rawErrors.map((error) => error.type));

  Array.from(activeSince.keys()).forEach((type) => {
    if (!currentTypes.has(type)) {
      activeSince.delete(type);
    }
  });

  return rawErrors.filter((error) => {
    const startedAt = activeSince.get(error.type) ?? timestamp;
    activeSince.set(error.type, startedAt);
    return timestamp - startedAt >= squatConfig.feedback.minErrorDurationMs;
  });
}

function feedbackWithCooldown(
  errors: FormError[],
  metrics: SquatMetrics,
  timestamp: number,
  previous: { messages: string[]; timestamp: number },
) {
  const nextMessages = generateRealtimeFeedback(errors, metrics);
  const changed = nextMessages.join('|') !== previous.messages.join('|');

  if (changed && timestamp - previous.timestamp < squatConfig.feedback.cooldownMs) {
    return previous.messages;
  }

  previous.messages = nextMessages;
  previous.timestamp = timestamp;
  return nextMessages;
}
