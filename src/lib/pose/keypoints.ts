import { squatConfig } from '../config/squatConfig';
import type { KeypointName, PoseFrame, PoseKeypoint } from '../../types/pose';

export const requiredSquatKeypoints = [
  'left_shoulder',
  'right_shoulder',
  'left_hip',
  'right_hip',
  'left_knee',
  'right_knee',
  'left_ankle',
  'right_ankle',
] as const satisfies readonly KeypointName[];

const bodyInFrameKeypoints = ['nose', ...requiredSquatKeypoints] as const satisfies readonly KeypointName[];

export type RequiredSquatKeypoints = Record<(typeof requiredSquatKeypoints)[number], PoseKeypoint>;

export function getKeypoint(pose: PoseFrame | PoseKeypoint[], name: KeypointName): PoseKeypoint | null {
  const keypoints = Array.isArray(pose) ? pose : pose.keypoints;
  return keypoints.find((keypoint) => keypoint.name === name) ?? null;
}

export function getRequiredKeypoints(pose: PoseFrame | PoseKeypoint[]): RequiredSquatKeypoints | null {
  const entries = requiredSquatKeypoints.map((name) => [name, getKeypoint(pose, name)] as const);
  if (entries.some(([, keypoint]) => !keypoint)) {
    return null;
  }

  return Object.fromEntries(entries) as RequiredSquatKeypoints;
}

export function calculateAverageConfidence(keypoints: PoseKeypoint[]): number {
  if (keypoints.length === 0) {
    return 0;
  }

  return keypoints.reduce((sum, keypoint) => sum + keypoint.score, 0) / keypoints.length;
}

export function isBodyInFrame(keypoints: PoseKeypoint[], videoWidth: number, videoHeight: number): boolean {
  if (videoWidth <= 0 || videoHeight <= 0) {
    return false;
  }

  const marginX = videoWidth * squatConfig.frame.marginRatio;
  const marginY = videoHeight * squatConfig.frame.marginRatio;

  return bodyInFrameKeypoints.every((name) => {
    const keypoint = getKeypoint(keypoints, name);
    if (!keypoint || keypoint.score < squatConfig.confidence.minKeypointScore) {
      return false;
    }

    return (
      keypoint.x >= marginX &&
      keypoint.x <= videoWidth - marginX &&
      keypoint.y >= marginY &&
      keypoint.y <= videoHeight - marginY
    );
  });
}

export function hasMinimumConfidence(keypoints: PoseKeypoint[], threshold: number): boolean {
  return keypoints.length > 0 && keypoints.every((keypoint) => keypoint.score >= threshold);
}
