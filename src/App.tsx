import { useCallback, useEffect, useRef, useState } from 'react';
import { CalibrationPanel } from './components/CalibrationPanel';
import { CameraView } from './components/CameraView';
import { FeedbackPanel } from './components/FeedbackPanel';
import { RepCounter } from './components/RepCounter';
import { WorkoutControls } from './components/WorkoutControls';
import { WorkoutReport } from './components/WorkoutReport';
import { useAnimationFrame } from './hooks/useAnimationFrame';
import { useCalibration } from './hooks/useCalibration';
import { useCamera } from './hooks/useCamera';
import { useMoveNet } from './hooks/useMoveNet';
import { useSquatAnalyzer } from './hooks/useSquatAnalyzer';
import type { PoseFrame } from './types/pose';
import type { WorkoutState } from './types/squat';

function App() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [workoutState, setWorkoutState] = useState<WorkoutState>('idle');
  const [poseFrame, setPoseFrame] = useState<PoseFrame | null>(null);

  const camera = useCamera();
  const moveNet = useMoveNet();
  const calibration = useCalibration();
  const analyzer = useSquatAnalyzer(poseFrame, calibration.calibrationData, workoutState === 'running');
  const {
    phase,
    feedback,
    currentScore,
    repCount,
    repResults,
    lastRep,
    summary,
    resetAnalyzer,
  } = analyzer;

  useAnimationFrame(() => {
    if (!camera.isReady || !moveNet.isReady) {
      return;
    }

    void moveNet.estimatePose(videoRef.current).then((nextPoseFrame) => {
      if (nextPoseFrame) {
        setPoseFrame(nextPoseFrame);
      }
    });
  }, camera.isReady && moveNet.isReady);

  useEffect(() => {
    calibration.updateCalibration(poseFrame);
  }, [poseFrame, calibration.updateCalibration]);

  useEffect(() => {
    if (camera.status === 'ready' && workoutState === 'idle') {
      setWorkoutState('camera_ready');
    }
  }, [camera.status, workoutState]);

  useEffect(() => {
    if (calibration.progress.stage === 'complete' && workoutState === 'calibrating') {
      setWorkoutState('ready');
    }
  }, [calibration.progress.stage, workoutState]);

  const handleStartCamera = useCallback(() => {
    void camera.startCamera(videoRef.current);
  }, [camera.startCamera]);

  const handleStartCalibration = useCallback(() => {
    calibration.startCalibration();
    setWorkoutState('calibrating');
  }, [calibration.startCalibration]);

  const handleStartWorkout = useCallback(() => {
    resetAnalyzer();
    setWorkoutState('running');
  }, [resetAnalyzer]);

  const handleStop = useCallback(() => {
    setWorkoutState('stopped');
    camera.stopCamera();
    setPoseFrame(null);
  }, [camera.stopCamera]);

  const handleReset = useCallback(() => {
    resetAnalyzer();
    calibration.resetCalibration();
    setPoseFrame(null);
    setWorkoutState(camera.isReady ? 'camera_ready' : 'idle');
  }, [resetAnalyzer, calibration.resetCalibration, camera.isReady]);

  const canWorkout = camera.isReady && moveNet.isReady && workoutState !== 'running' && workoutState !== 'calibrating';
  const showCalibration = workoutState === 'calibrating' || calibration.progress.stage !== 'idle';
  const showReport = workoutState === 'stopped' && summary.totalReps > 0;

  return (
    <main className="app-shell">
      <header className="app-header">
        <div className="brand">
          <span className="brand__mark" aria-hidden="true" />
          <h1>AngleFit</h1>
        </div>
        <span className={`state-pill state-pill--${workoutState}`}>{workoutState.replace('_', ' ')}</span>
      </header>

      {(moveNet.error || camera.error) && (
        <div className="system-alert" role="alert">
          {moveNet.error ?? camera.error}
        </div>
      )}

      <div className="stage-grid">
        <CameraView
          videoRef={videoRef}
          poseFrame={poseFrame}
          cameraReady={camera.isReady}
          modelReady={moveNet.isReady}
          cameraError={camera.error}
        />

        <aside className="side-column" aria-label="Live stats">
          <RepCounter repCount={repCount} phase={phase} currentScore={currentScore} lastRep={lastRep} />
          <FeedbackPanel phase={phase} score={currentScore} feedback={feedback} />
          {showCalibration && (
            <CalibrationPanel calibrationData={calibration.calibrationData} progress={calibration.progress} />
          )}
        </aside>
      </div>

      <WorkoutControls
        workoutState={workoutState}
        canUseCamera={camera.status !== 'requesting'}
        canCalibrate={camera.isReady && moveNet.isReady}
        canWorkout={canWorkout}
        onStartCamera={handleStartCamera}
        onStartCalibration={handleStartCalibration}
        onStartWorkout={handleStartWorkout}
        onStop={handleStop}
        onReset={handleReset}
      />

      {showReport && <WorkoutReport summary={summary} repResults={repResults} />}
    </main>
  );
}

export default App;
