import Anthropic from '@anthropic-ai/sdk';
import { formErrorShortLabels } from '../squat/feedback';
import type { RepResult, WorkoutSummary } from '../../types/squat';

const API_KEY_STORAGE_KEY = 'anglefit.anthropicApiKey';
const MODEL = 'claude-opus-4-8';

export function getStoredApiKey(): string | null {
  try {
    return localStorage.getItem(API_KEY_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setStoredApiKey(apiKey: string): void {
  try {
    if (apiKey) {
      localStorage.setItem(API_KEY_STORAGE_KEY, apiKey);
    } else {
      localStorage.removeItem(API_KEY_STORAGE_KEY);
    }
  } catch {
    // Storage unavailable (private mode) — the key just won't persist.
  }
}

const SYSTEM_PROMPT = `당신은 스쿼트 폼 교정을 전문으로 하는 피트니스 코치입니다.
컴퓨터 비전 기반 자세 분석 시스템이 측정한 세트 데이터를 받아, 한국어로 개인화된 코칭 총평을 작성합니다.

규칙:
- 데이터에 실제로 나타난 경향만 언급하고, 측정되지 않은 것을 추측하지 마세요.
- 3~5문장의 총평 후, "다음 세트 팁:" 아래에 구체적인 실천 팁을 2개 bullet로 제시하세요.
- 잘한 점을 먼저 인정하고, 가장 중요한 개선점 1~2개에 집중하세요.
- 의학적 진단이나 통증 관련 단정은 하지 마세요.
- 전체 200자 내외로 간결하게 작성하세요.`;

/**
 * Generates a personalized Korean coaching summary from the workout data via
 * Claude. Runs browser-direct with a user-provided API key (BYO key) — the app
 * has no backend, so the key never leaves the user's machine except to call
 * the Anthropic API. Callers should fall back to the rule-based comment on error.
 */
export async function generateAiCoachSummary(
  summary: WorkoutSummary,
  repResults: RepResult[],
  apiKey: string,
): Promise<string> {
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    thinking: { type: 'adaptive' },
    output_config: { effort: 'low' },
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: buildWorkoutReport(summary, repResults) }],
  });

  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('')
    .trim();

  if (!text) {
    throw new Error('AI 코치 응답이 비어 있습니다.');
  }
  return text;
}

export function describeCoachError(error: unknown): string {
  if (error instanceof Anthropic.AuthenticationError) {
    return 'API 키가 올바르지 않습니다. 키를 확인해 주세요.';
  }
  if (error instanceof Anthropic.RateLimitError) {
    return '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.';
  }
  if (error instanceof Anthropic.APIError) {
    return `AI 코치 호출에 실패했습니다 (${error.status}).`;
  }
  return 'AI 코치 호출에 실패했습니다. 네트워크 상태를 확인해 주세요.';
}

function buildWorkoutReport(summary: WorkoutSummary, repResults: RepResult[]): string {
  const lines: string[] = [
    `총 반복: ${summary.totalReps}회 (양호 ${summary.goodReps}회), 평균 점수: ${summary.averageScore}/100`,
  ];

  if (summary.consistencyScore !== null) {
    lines.push(`기술 일관성(베스트 반복 대비 DTW 유사도 평균): ${summary.consistencyScore}/100`);
  }
  if (summary.fatigueDetected) {
    lines.push('세트 후반에 동작 유사도가 유의미하게 하락 (피로 신호 감지됨)');
  }

  if (summary.mostFrequentErrors.length > 0) {
    const errors = summary.mostFrequentErrors
      .map((error) => `${formErrorShortLabels[error.type]} ${error.count}회`)
      .join(', ');
    lines.push(`자주 감지된 문제: ${errors}`);
  } else {
    lines.push('자주 감지된 문제: 없음');
  }

  const axes = averageBreakdown(repResults);
  if (axes) {
    lines.push(
      `축별 평균 점수 — 깊이 ${axes.depth}, 무릎 정렬 ${axes.knee}, 상체 자세 ${axes.posture}, 좌우 균형 ${axes.balance}, 템포 ${axes.tempo}, 안정성 ${axes.stability}`,
    );
  }

  const repScores = summary.repScores.map((rep) => `${rep.repNumber}회차 ${rep.score}점`).join(', ');
  if (repScores) {
    lines.push(`반복별 점수: ${repScores}`);
  }

  return `다음 스쿼트 세트 데이터를 분석해 코칭 총평을 작성해 주세요.\n\n${lines.join('\n')}`;
}

function averageBreakdown(repResults: RepResult[]) {
  if (repResults.length === 0) {
    return null;
  }

  const axisKeys = ['depth', 'knee', 'posture', 'balance', 'tempo', 'stability'] as const;
  const totals = Object.fromEntries(axisKeys.map((key) => [key, 0])) as Record<(typeof axisKeys)[number], number>;
  repResults.forEach((rep) => {
    axisKeys.forEach((key) => {
      totals[key] += rep.breakdown[key];
    });
  });

  return Object.fromEntries(
    axisKeys.map((key) => [key, Math.round(totals[key] / repResults.length)]),
  ) as Record<(typeof axisKeys)[number], number>;
}
