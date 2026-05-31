import { Camera, Crosshair, Play, RotateCcw, Square } from 'lucide-react';
import type { WorkoutState } from '../types/squat';

interface WorkoutControlsProps {
  workoutState: WorkoutState;
  canUseCamera: boolean;
  canCalibrate: boolean;
  canWorkout: boolean;
  onStartCamera: () => void;
  onStartCalibration: () => void;
  onStartWorkout: () => void;
  onStop: () => void;
  onReset: () => void;
}

export function WorkoutControls({
  workoutState,
  canUseCamera,
  canCalibrate,
  canWorkout,
  onStartCamera,
  onStartCalibration,
  onStartWorkout,
  onStop,
  onReset,
}: WorkoutControlsProps) {
  return (
    <section className="control-strip" aria-label="Workout controls">
      <button type="button" onClick={onStartCamera} disabled={!canUseCamera || workoutState === 'running'}>
        <Camera aria-hidden="true" size={18} />
        Start Camera
      </button>
      <button type="button" onClick={onStartCalibration} disabled={!canCalibrate || workoutState === 'running'}>
        <Crosshair aria-hidden="true" size={18} />
        Start Calibration
      </button>
      <button type="button" className="button-primary" onClick={onStartWorkout} disabled={!canWorkout}>
        <Play aria-hidden="true" size={18} />
        Start Workout
      </button>
      <button type="button" onClick={onStop} disabled={workoutState === 'idle' || workoutState === 'stopped'}>
        <Square aria-hidden="true" size={18} />
        Stop
      </button>
      <button type="button" onClick={onReset}>
        <RotateCcw aria-hidden="true" size={18} />
        Reset
      </button>
    </section>
  );
}
