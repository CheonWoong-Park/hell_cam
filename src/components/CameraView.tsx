import type { RefObject } from 'react';
import { squatConfig } from '../lib/config/squatConfig';
import type { PoseFrame } from '../types/pose';
import type { FormError, SquatPhase } from '../types/squat';
import { CoachOverlay } from './CoachOverlay';
import { PoseCanvas } from './PoseCanvas';

interface CameraViewProps {
  videoRef: RefObject<HTMLVideoElement | null>;
  poseFrame: PoseFrame | null;
  cameraReady: boolean;
  modelReady: boolean;
  cameraError: string | null;
  errors: FormError[];
  phase: SquatPhase;
  isRunning: boolean;
  engineBackend: string;
  engineModel: string;
  engineFps: number | null;
}

export function CameraView({
  videoRef,
  poseFrame,
  cameraReady,
  modelReady,
  cameraError,
  errors,
  phase,
  isRunning,
  engineBackend,
  engineModel,
  engineFps,
}: CameraViewProps) {
  const showOutOfFrame = poseFrame && !poseFrame.bodyInFrame;
  const engineModelLabel = engineModel === 'SINGLEPOSE_THUNDER' ? 'Thunder' : 'Lightning';

  return (
    <section className="camera-shell" aria-label="Camera analysis area">
      <div className="video-stage">
        <video
          ref={videoRef}
          className={squatConfig.camera.mirror ? 'camera-video camera-video--mirror' : 'camera-video'}
          muted
          playsInline
          autoPlay
        />
        <PoseCanvas poseFrame={poseFrame} videoRef={videoRef} mirror={squatConfig.camera.mirror} />
        {modelReady && (
          <div className="engine-badge" aria-label="Inference engine status">
            MoveNet {engineModelLabel} · {engineBackend}
            {engineFps !== null && ` · ${engineFps}fps`}
          </div>
        )}
        <div className="camera-message">
          {cameraError && <strong>{cameraError}</strong>}
          {!cameraError && !cameraReady && <strong>Start Camera를 눌러 시작하세요</strong>}
          {!cameraError && cameraReady && !modelReady && <strong>모델 로딩 중…</strong>}
          {!cameraError && cameraReady && modelReady && !poseFrame && (
            <strong>전신이 화면에 들어오게 서주세요</strong>
          )}
          {!cameraError && showOutOfFrame && <strong>프레임 밖으로 벗어났습니다</strong>}
        </div>
        <CoachOverlay
          errors={errors}
          phase={phase}
          isRunning={isRunning}
          bodyInFrame={Boolean(poseFrame?.bodyInFrame)}
        />
      </div>
    </section>
  );
}
