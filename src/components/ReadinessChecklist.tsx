import { CheckCircle2, CircleDashed, TriangleAlert } from 'lucide-react';
import type { CalibrationData, SquatMetrics, WorkoutState } from '../types/squat';

interface ReadinessChecklistProps {
  cameraReady: boolean;
  modelReady: boolean;
  calibrationData: CalibrationData | null;
  metrics: SquatMetrics | null;
  workoutState: WorkoutState;
}

export function ReadinessChecklist({
  cameraReady,
  modelReady,
  calibrationData,
  metrics,
  workoutState,
}: ReadinessChecklistProps) {
  const items = [
    {
      label: 'Camera',
      detail: cameraReady ? 'stream active' : 'waiting',
      ready: cameraReady,
      required: true,
    },
    {
      label: 'MoveNet',
      detail: modelReady ? 'WebGL ready' : 'loading',
      ready: modelReady,
      required: true,
    },
    {
      label: 'Body frame',
      detail: metrics?.bodyInFrame ? 'full body visible' : 'adjust distance',
      ready: Boolean(metrics?.bodyInFrame),
      required: true,
    },
    {
      label: 'Calibration',
      detail: calibrationData ? 'personal baseline' : 'default baseline',
      ready: Boolean(calibrationData),
      required: false,
    },
  ];

  return (
    <section className="panel readiness-panel">
      <div className="panel-heading">
        <h2>Readiness</h2>
        <span>{workoutState}</span>
      </div>
      <div className="readiness-list">
        {items.map((item) => {
          const Icon = item.ready ? CheckCircle2 : item.required ? TriangleAlert : CircleDashed;
          return (
            <div className={item.ready ? 'readiness-item readiness-item--ready' : 'readiness-item'} key={item.label}>
              <Icon aria-hidden="true" size={18} />
              <div>
                <strong>{item.label}</strong>
                <span>{item.detail}</span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
