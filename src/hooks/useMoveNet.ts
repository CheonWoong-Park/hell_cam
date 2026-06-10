import { useCallback, useEffect, useRef, useState } from 'react';
import { calculateAverageConfidence, isBodyInFrame } from '../lib/pose/keypoints';
import {
  createMoveNetDetector,
  estimateMoveNetPose,
  initializeTensorFlowBackend,
  type MoveNetDetector,
  type MoveNetModelType,
} from '../lib/pose/movenet';
import { KeypointKalmanSmoother } from '../lib/pose/kalman';
import { AnatomyFilter } from '../lib/pose/anatomy';
import { squatConfig } from '../lib/config/squatConfig';
import type { PoseFrame } from '../types/pose';

type ModelStatus = 'idle' | 'loading_backend' | 'loading_model' | 'ready' | 'error';

export function useMoveNet() {
  const detectorRef = useRef<MoveNetDetector | null>(null);
  const estimatingRef = useRef(false);
  const smootherRef = useRef<KeypointKalmanSmoother | null>(null);
  const anatomyRef = useRef<AnatomyFilter | null>(null);
  const modelTypeRef = useRef<MoveNetModelType>(squatConfig.model.type);
  const inferenceMsRef = useRef<number[]>([]);
  const inferenceCountRef = useRef(0);
  const [status, setStatus] = useState<ModelStatus>('idle');
  const [backend, setBackend] = useState<string>('unknown');
  const [modelType, setModelType] = useState<MoveNetModelType>(squatConfig.model.type);
  const [fps, setFps] = useState<number | null>(null);
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

  const trackInferenceAndAdapt = useCallback(async (elapsedMs: number) => {
    const adaptive = squatConfig.model.adaptive;
    inferenceCountRef.current += 1;
    if (inferenceCountRef.current <= adaptive.warmupFrames) {
      return;
    }

    const samples = inferenceMsRef.current;
    samples.push(elapsedMs);
    if (samples.length > adaptive.sampleWindow) {
      samples.shift();
    }
    if (samples.length < adaptive.sampleWindow) {
      return;
    }

    const sorted = [...samples].sort((a, b) => a - b);
    const medianMs = sorted[Math.floor(sorted.length / 2)];
    const sustainedFps = 1000 / Math.max(medianMs, 1);
    setFps(Math.round(sustainedFps));

    if (sustainedFps >= adaptive.minFps || modelTypeRef.current === squatConfig.model.fallbackType) {
      return;
    }

    // The device cannot sustain the accurate model in real time — swap to the
    // lighter one. The caller holds estimatingRef, so no inference races here.
    const fallback = await createMoveNetDetector(squatConfig.model.fallbackType);
    detectorRef.current?.dispose();
    detectorRef.current = fallback;
    modelTypeRef.current = squatConfig.model.fallbackType;
    inferenceMsRef.current = [];
    inferenceCountRef.current = 0;
    setModelType(squatConfig.model.fallbackType);
  }, []);

  const estimatePose = useCallback(async (videoElement: HTMLVideoElement | null): Promise<PoseFrame | null> => {
    const detector = detectorRef.current;
    if (!detector || !videoElement || estimatingRef.current) {
      return null;
    }

    estimatingRef.current = true;
    try {
      const inferenceStartedAt = performance.now();
      const poseFrame = await estimateMoveNetPose(detector, videoElement);
      if (!poseFrame) {
        return null;
      }
      await trackInferenceAndAdapt(performance.now() - inferenceStartedAt);

      // Anatomy runs before the Kalman smoother: a downweighted keypoint gets a
      // larger measurement noise in the filter instead of being hard-dropped.
      const anatomy = anatomyRef.current ?? (anatomyRef.current = new AnatomyFilter(squatConfig.anatomy));
      const smoother =
        smootherRef.current ?? (smootherRef.current = new KeypointKalmanSmoother(squatConfig.smoothing.kalman));
      const gatedKeypoints = anatomy.apply(poseFrame.keypoints, poseFrame.timestamp);
      const keypoints = smoother.smooth(gatedKeypoints, poseFrame.timestamp);

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
  }, [trackInferenceAndAdapt]);

  return {
    status,
    backend,
    modelType,
    fps,
    error,
    isReady: status === 'ready',
    estimatePose,
  };
}
