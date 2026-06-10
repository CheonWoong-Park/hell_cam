import { squatConfig } from '../config/squatConfig';
import type { FormError, FormErrorType, RepResult, SquatMetrics, WorkoutSummary } from '../../types/squat';

export const formErrorMessages: Record<FormErrorType, string> = {
  BODY_OUT_OF_FRAME: '전신이 화면에 들어오게 카메라를 조금 뒤로 옮겨주세요.',
  LOW_CONFIDENCE: '관절 인식이 불안정해요. 조명을 밝게 하거나 카메라 각도를 조정해 주세요.',
  KNEE_VALGUS: '무릎이 안쪽으로 모여요. 무릎을 발끝 방향으로 밀어내며 벌리세요.',
  EXCESSIVE_FORWARD_LEAN: '상체가 너무 숙여졌어요. 가슴을 들고 허리를 곧게 펴세요.',
  HIP_SHOOT: '엉덩이가 먼저 솟구쳐요. 가슴과 엉덩이를 함께 들어 올리세요.',
  WEIGHT_SHIFT: '체중이 한쪽으로 쏠려요. 양발에 균등하게 힘을 주세요.',
  INSUFFICIENT_DEPTH: '깊이가 부족해요. 허벅지가 바닥과 평행이 되도록 더 앉으세요.',
  NARROW_STANCE: '발 간격이 좁아요. 발을 어깨너비로 벌려 서세요.',
  FAST_DESCENT: '너무 빠르게 내려가요. 통제하면서 천천히 내려가세요.',
  INCOMPLETE_LOCKOUT: '끝까지 일어서지 않았어요. 무릎과 엉덩이를 완전히 펴세요.',
};

export const formErrorShortLabels: Record<FormErrorType, string> = {
  BODY_OUT_OF_FRAME: '프레임 벗어남',
  LOW_CONFIDENCE: '인식 불안정',
  KNEE_VALGUS: '무릎 모임',
  EXCESSIVE_FORWARD_LEAN: '상체 숙임',
  HIP_SHOOT: '엉덩이 솟구침',
  WEIGHT_SHIFT: '좌우 쏠림',
  INSUFFICIENT_DEPTH: '깊이 부족',
  NARROW_STANCE: '좁은 발 간격',
  FAST_DESCENT: '빠른 하강',
  INCOMPLETE_LOCKOUT: '미완성 락아웃',
};

export interface RepCoaching {
  positive: boolean;
  headline: string;
  tips: string[];
}

/**
 * Per-rep coaching shown after each completed squat. Unlike the live overlay,
 * this updates only when a rep finishes, so the advice stays calm and readable.
 */
export function generateRepCoaching(rep: RepResult): RepCoaching {
  const cues = prioritizeErrors(rep.errors).slice(0, 2);

  if (cues.length === 0) {
    return {
      positive: true,
      headline: rep.score >= squatConfig.scoring.goodRepThreshold ? '훌륭한 반복이에요!' : '안정적인 반복이에요.',
      tips: ['지금 깊이와 리듬을 그대로 유지하세요.'],
    };
  }

  return {
    positive: false,
    headline: '다음 반복에는 이렇게 해보세요',
    tips: cues.map((cue) => cue.message),
  };
}

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

  const fatigueNote = summary.fatigueDetected
    ? ' 세트 후반으로 갈수록 베스트 반복과의 동작 유사도가 떨어졌어요. 피로가 쌓인 신호이니 휴식을 늘리거나 세트를 짧게 가져가 보세요.'
    : '';

  if (summary.mostFrequentErrors.length === 0) {
    return `전반적으로 안정적인 반복이었습니다. 같은 깊이와 속도를 유지해 보세요.${fatigueNote}`;
  }

  const topError = summary.mostFrequentErrors[0];
  return `${topError.message} 다음 세트에서는 이 경향을 우선 확인해 보세요.${fatigueNote}`;
}
