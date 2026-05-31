import type { SquatPhase } from '../types/squat';

const orderedPhases: SquatPhase[] = ['standing', 'descending', 'bottom', 'ascending'];

interface PhaseRailProps {
  phase: SquatPhase;
}

export function PhaseRail({ phase }: PhaseRailProps) {
  const activeIndex = orderedPhases.indexOf(phase);

  return (
    <div className="phase-rail" aria-label={`Current phase ${phase}`}>
      {orderedPhases.map((item, index) => (
        <div
          className={[
            'phase-rail__item',
            item === phase ? 'phase-rail__item--active' : '',
            activeIndex > index ? 'phase-rail__item--complete' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          key={item}
        >
          <span />
          <strong>{item}</strong>
        </div>
      ))}
    </div>
  );
}
