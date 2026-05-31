import { squatConfig } from '../config/squatConfig';
import type { FormError, FormErrorType, RepResult, SquatMetrics, WorkoutSummary } from '../../types/squat';

export const formErrorMessages: Record<FormErrorType, string> = {
  BODY_OUT_OF_FRAME: '전신이 화면에 들어오게 카메라를 조금 뒤로 옮겨주세요.',
  LOW_CONFIDENCE: '관절 인식이 불안정합니다. 조명을 밝게 하거나 자세를 조정해 주세요.',
  INSUFFICIENT_DEPTH: '이번 반복은 깊이가 조금 부족해 보입니다.',
  EXCESSIVE_TORSO_LEAN: '상체가 기준 자세보다 많이 앞으로 기울었습니다.',
  KNEE_COLLAPSE_TREND: '무릎이 안쪽으로 무너지는 경향이 있습니다.',
  LEFT_RIGHT_ASYMMETRY: '좌우 움직임 차이가 커 보입니다.',
  UNSTABLE_TEMPO: '움직임 속도가 조금 불안정합니다.',
};

export function prioritizeErrors(errors: FormError[]): FormError[] {
  return [...errors].sort((a, b) => {
    const aPriority = squatConfig.feedback.priority.indexOf(a.type);
    const bPriority = squatConfig.feedback.priority.indexOf(b.type);
    return aPriority - bPriority;
  });
}

export function generateRealtimeFeedback(errors: FormError[], metrics: SquatMetrics | null): string[] {
  if (!metrics) {
    return ['카메라를 시작하고 전신이 화면에 들어오게 서 주세요.'];
  }

  const prioritized = prioritizeErrors(errors).slice(0, squatConfig.feedback.maxRealtimeMessages);
  if (prioritized.length > 0) {
    return prioritized.map((error) => error.message);
  }

  if (metrics.phase === 'idle') {
    return ['전신이 화면에 들어오면 분석을 시작합니다.'];
  }

  return ['좋습니다. 현재 자세를 유지해 보세요.'];
}

export function generateRepFeedback(repResult: RepResult): string {
  if (repResult.errors.length === 0 && repResult.score >= squatConfig.scoring.goodRepThreshold) {
    return '좋은 반복입니다. 같은 리듬을 유지해 보세요.';
  }

  const topError = prioritizeErrors(repResult.errors)[0];
  return topError?.message ?? '다음 반복에서는 움직임을 조금 더 안정적으로 가져가 보세요.';
}

export function generateWorkoutFeedback(summary: WorkoutSummary): string {
  if (summary.totalReps === 0) {
    return '아직 완료된 반복이 없습니다. bottom을 거쳐 다시 선 자세로 돌아오면 1회로 기록됩니다.';
  }

  if (summary.mostFrequentErrors.length === 0) {
    return '전반적으로 안정적인 반복이었습니다. 같은 깊이와 속도를 유지해 보세요.';
  }

  const topError = summary.mostFrequentErrors[0];
  return `${topError.message} 다음 세트에서는 이 경향을 우선 확인해 보세요.`;
}
