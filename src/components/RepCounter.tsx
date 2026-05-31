import type { RepResult, SquatPhase } from '../types/squat';

interface RepCounterProps {
  repCount: number;
  phase: SquatPhase;
  currentScore: number;
  lastRep: RepResult | null;
}

export function RepCounter({ repCount, lastRep }: RepCounterProps) {
  return (
    <section className="panel rep-hero">
      <span className="rep-hero__label">REPS</span>
      <strong className="rep-hero__count">{repCount}</strong>
      <span className="rep-hero__last">last {lastRep ? lastRep.score : '—'}</span>
    </section>
  );
}
