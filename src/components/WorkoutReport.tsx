import { useCallback, useState } from 'react';
import {
  describeCoachError,
  generateAiCoachSummary,
  getStoredApiKey,
  setStoredApiKey,
} from '../lib/coach/llmCoach';
import type { RepResult, WorkoutSummary } from '../types/squat';

interface WorkoutReportProps {
  summary: WorkoutSummary;
  repResults: RepResult[];
}

export function WorkoutReport({ summary, repResults }: WorkoutReportProps) {
  const [apiKey, setApiKey] = useState(() => getStoredApiKey() ?? '');
  const [showKeyInput, setShowKeyInput] = useState(false);
  const [aiComment, setAiComment] = useState<string | null>(null);
  const [aiStatus, setAiStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [aiError, setAiError] = useState<string | null>(null);

  const handleGenerate = useCallback(async () => {
    if (!apiKey.trim()) {
      setShowKeyInput(true);
      return;
    }

    setAiStatus('loading');
    setAiError(null);
    try {
      setStoredApiKey(apiKey.trim());
      const comment = await generateAiCoachSummary(summary, repResults, apiKey.trim());
      setAiComment(comment);
      setAiStatus('idle');
    } catch (error) {
      setAiError(describeCoachError(error));
      setAiStatus('error');
    }
  }, [apiKey, summary, repResults]);

  return (
    <section className="report-section">
      <div className="report-grid">
        <div className="report-stat">
          <span>TOTAL</span>
          <strong>{summary.totalReps}</strong>
        </div>
        <div className="report-stat report-stat--accent">
          <span>GOOD</span>
          <strong>{summary.goodReps}</strong>
        </div>
        <div className="report-stat">
          <span>AVG</span>
          <strong>{summary.averageScore}</strong>
        </div>
        {summary.consistencyScore !== null && (
          <div className="report-stat">
            <span>CONSIST</span>
            <strong>{summary.consistencyScore}</strong>
          </div>
        )}
      </div>
      <p className="report-comment">{summary.comment}</p>

      <div className="ai-coach">
        {aiComment ? (
          <div className="ai-coach__result">
            <span className="ai-coach__label">AI 코치 총평</span>
            <p>{aiComment}</p>
          </div>
        ) : (
          <div className="ai-coach__actions">
            <button
              type="button"
              className="ai-coach__button"
              onClick={() => void handleGenerate()}
              disabled={aiStatus === 'loading'}
            >
              {aiStatus === 'loading' ? 'AI 코치 분석 중…' : 'AI 코치 총평 생성'}
            </button>
            <button type="button" className="ai-coach__key-toggle" onClick={() => setShowKeyInput((show) => !show)}>
              API 키 설정
            </button>
          </div>
        )}
        {showKeyInput && !aiComment && (
          <div className="ai-coach__key-row">
            <input
              type="password"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder="Anthropic API 키 (브라우저에만 저장됩니다)"
              autoComplete="off"
            />
          </div>
        )}
        {aiError && <p className="ai-coach__error">{aiError}</p>}
      </div>
    </section>
  );
}
