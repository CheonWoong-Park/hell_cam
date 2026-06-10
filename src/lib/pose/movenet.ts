import * as tf from '@tensorflow/tfjs-core';
import '@tensorflow/tfjs-backend-webgl';
import '@tensorflow/tfjs-backend-webgpu';
import * as poseDetection from '@tensorflow-models/pose-detection';
import { movenet } from '@tensorflow-models/pose-detection';
import { squatConfig } from '../config/squatConfig';
import { calculateAverageConfidence, isBodyInFrame } from './keypoints';
import { moveNetKeypointNames, type KeypointName, type PoseFrame, type PoseKeypoint } from '../../types/pose';

export type MoveNetDetector = poseDetection.PoseDetector;
export type MoveNetModelType = 'SINGLEPOSE_LIGHTNING' | 'SINGLEPOSE_THUNDER';

export async function initializeTensorFlowBackend(): Promise<string> {
  for (const backend of squatConfig.model.backendPriority) {
    if (backend === 'webgpu' && (typeof navigator === 'undefined' || !('gpu' in navigator))) {
      continue;
    }

    try {
      if (await tf.setBackend(backend)) {
        await tf.ready();
        return tf.getBackend();
      }
    } catch {
      // Try the next backend in the priority list.
    }
  }

  throw new Error(
    `TensorFlow.js backend 초기화에 실패했습니다 (시도: ${squatConfig.model.backendPriority.join(', ')}).`,
  );
}

export async function createMoveNetDetector(
  type: MoveNetModelType = squatConfig.model.type,
): Promise<MoveNetDetector> {
  const modelType =
    type === 'SINGLEPOSE_THUNDER' ? movenet.modelType.SINGLEPOSE_THUNDER : movenet.modelType.SINGLEPOSE_LIGHTNING;

  return poseDetection.createDetector(poseDetection.SupportedModels.MoveNet, {
    modelType,
    enableSmoothing: false,
  });
}

export async function estimateMoveNetPose(
  detector: MoveNetDetector,
  video: HTMLVideoElement,
): Promise<PoseFrame | null> {
  if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || video.videoWidth === 0 || video.videoHeight === 0) {
    return null;
  }

  const poses = await detector.estimatePoses(video);
  const pose = poses[0];

  if (!pose) {
    return null;
  }

  const keypoints: PoseKeypoint[] = pose.keypoints.map((keypoint, index) => ({
    name: normalizeKeypointName(keypoint.name, index),
    x: keypoint.x,
    y: keypoint.y,
    score: keypoint.score ?? 0,
  }));

  return {
    keypoints,
    timestamp: performance.now(),
    averageScore: calculateAverageConfidence(keypoints),
    bodyInFrame: isBodyInFrame(keypoints, video.videoWidth, video.videoHeight),
    videoWidth: video.videoWidth,
    videoHeight: video.videoHeight,
  };
}

function normalizeKeypointName(name: string | undefined, index: number): KeypointName {
  const fallback = moveNetKeypointNames[index] ?? 'nose';
  return (name ?? fallback) as KeypointName;
}
