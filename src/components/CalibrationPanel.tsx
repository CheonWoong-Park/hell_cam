import type { CalibrationData, CalibrationProgress } from '../types/squat';

interface CalibrationPanelProps {
  calibrationData: CalibrationData | null;
  progress: CalibrationProgress;
}

export function CalibrationPanel({ progress }: CalibrationPanelProps) {
  return (
    <section className="panel calibration-panel">
      <div className="panel-heading">
        <h2>Calibration</h2>
        <span>{progress.stage}</span>
      </div>
      <div className="progress-track">
        <div className="progress-track__bar" style={{ width: `${Math.round(progress.progress * 100)}%` }} />
      </div>
      <p className="cue cue--muted">{progress.message}</p>
    </section>
  );
}
