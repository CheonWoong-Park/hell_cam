import type { SquatPhase } from '../types/squat';

interface FeedbackPanelProps {
  phase: SquatPhase;
  score: number;
  feedback: string[];
}

export function FeedbackPanel({ phase, score, feedback }: FeedbackPanelProps) {
  const primary = feedback[0] ?? '준비 완료. 천천히 스쿼트를 시작하세요.';

  return (
    <section className="panel feedback-panel">
      <div className="score-display">
        <span className="score-display__label">SCORE</span>
        <strong className="score-display__value">{score}</strong>
        <span className={`phase-chip phase-chip--${phase}`}>{phase}</span>
      </div>
      <p className="cue">{primary}</p>
    </section>
  );
}
