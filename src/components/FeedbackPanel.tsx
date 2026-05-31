import { prioritizeErrors } from '../lib/squat/feedback';
import type { FormError, SquatPhase } from '../types/squat';

interface FeedbackPanelProps {
  phase: SquatPhase;
  score: number;
  feedback: string[];
  errors: FormError[];
}

export function FeedbackPanel({ phase, score, feedback, errors }: FeedbackPanelProps) {
  const cues = prioritizeErrors(errors);
  const primary = feedback[0] ?? '준비 완료. 천천히 스쿼트를 시작하세요.';
  const topSeverity = cues[0]?.severity;
  const cueToneClass = topSeverity ? ` cue--${topSeverity}` : '';

  return (
    <section className="panel feedback-panel">
      <div className="score-display">
        <span className="score-display__label">SCORE</span>
        <strong className="score-display__value">{score}</strong>
        <span className={`phase-chip phase-chip--${phase}`}>{phase}</span>
      </div>
      <p className={`cue${cueToneClass}`}>{primary}</p>
      {cues.length > 0 && (
        <ul className="cue-list" aria-label="실시간 자세 교정">
          {cues.map((cue) => (
            <li key={cue.type} className={`cue-list__item cue-list__item--${cue.severity}`}>
              <span className="cue-dot" aria-hidden="true" />
              {cue.message}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
