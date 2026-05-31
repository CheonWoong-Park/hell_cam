import { useCallback, useEffect, useRef, useState } from 'react';
import { calculateAverageConfidence, isBodyInFrame } from '../lib/pose/keypoints';
import {
  createMoveNetDetector,
  estimateMoveNetPose,
  initializeTensorFlowBackend,
  type MoveNetDetector,
} from '../lib/pose/movenet';
import { KeypointKalmanSmoother } from '../lib/pose/kalman';
import { squatConfig } from '../lib/config/squatConfig';
import type { PoseFrame } from '../types/pose';

type ModelStatus = 'idle' | 'loading_backend' | 'loading_model' | 'ready' | 'error';

export function useMoveNet() {
  const detectorRef = useRef<MoveNetDetector | null>(null);
  const estimatingRef = useRef(false);
  const smootherRef = useRef<KeypointKalmanSmoother | null>(null);
  const [status, setStatus] = useState<ModelStatus>('idle');
  const [backend, setBackend] = useState<string>('unknown');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;

    async function initialize() {
      try {
        setStatus('loading_backend');
        const activeBackend = await initializeTensorFlowBackend();
        if (disposed) {
          return;
        }
        setBackend(activeBackend);
        setStatus('loading_model');
        const detector = await createMoveNetDetector();
        if (disposed) {
          detector.dispose();
          return;
        }
        detectorRef.current = detector;
        setStatus('ready');
      } catch (caughtError) {
        setError(caughtError instanceof Error ? caughtError.message : 'MoveNet 모델을 불러오지 못했습니다.');
        setStatus('error');
      }
    }

    initialize();

    return () => {
      disposed = true;
      detectorRef.current?.dispose();
      detectorRef.current = null;
    };
  }, []);

  const estimatePose = useCallback(async (videoElement: HTMLVideoElement | null): Promise<PoseFrame | null> => {
    const detector = detectorRef.current;
    if (!detector || !videoElement || estimatingRef.current) {
      return null;
    }

    estimatingRef.current = true;
    try {
      const poseFrame = await estimateMoveNetPose(detector, videoElement);
      if (!poseFrame) {
        return null;
      }

      const smoother =
        smootherRef.current ?? (smootherRef.current = new KeypointKalmanSmoother(squatConfig.smoothing.kalman));
      const keypoints = smoother.smooth(poseFrame.keypoints, poseFrame.timestamp);

      return {
        ...poseFrame,
        keypoints,
        averageScore: calculateAverageConfidence(keypoints),
        bodyInFrame: isBodyInFrame(keypoints, poseFrame.videoWidth, poseFrame.videoHeight),
      };
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : '포즈 추정 중 오류가 발생했습니다.');
      setStatus('error');
      return null;
    } finally {
      estimatingRef.current = false;
    }
  }, []);

  return {
    status,
    backend,
    error,
    isReady: status === 'ready',
    estimatePose,
  };
}
