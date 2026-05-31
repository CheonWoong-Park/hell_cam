import type { RepResult, SquatPhase } from '../types/squat';

interface RepCounterProps {
  repCount: number;
  phase: SquatPhase;
  currentScore: number;
  lastRep: RepResult | null;
}

export function RepCounter({ repCount, phase, currentScore, lastRep }: RepCounterProps) {
  return (
    <section className="panel rep-hero">
      <span className="rep-hero__label">REPS</span>
      <strong className="rep-hero__count">{repCount}</strong>
      <div className="rep-hero__row">
        <span className="rep-hero__last">last {lastRep ? lastRep.score : '—'}</span>
        <span className="rep-hero__score">SCORE {currentScore}</span>
        <span className={`phase-chip phase-chip--${phase}`}>{phase}</span>
      </div>
    </section>
  );
}
