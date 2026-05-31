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

  // Only the squat-relevant joints matter (no nose/face). The bottom margin is
  // intentionally tiny: when the whole body fills the frame the ankles sit right
  // at the bottom edge, so a large bottom margin wrongly flags "out of frame".
  const marginX = videoWidth * squatConfig.frame.marginRatio;
  const topMargin = videoHeight * squatConfig.frame.marginRatio;
  const bottomMargin = videoHeight * squatConfig.frame.bottomMarginRatio;

  return requiredSquatKeypoints.every((name) => {
    const keypoint = getKeypoint(keypoints, name);
    if (!keypoint || keypoint.score < squatConfig.confidence.minKeypointScore) {
      return false;
    }

    return (
      keypoint.x >= marginX &&
      keypoint.x <= videoWidth - marginX &&
      keypoint.y >= topMargin &&
      keypoint.y <= videoHeight - bottomMargin
    );
  });
}

export function hasMinimumConfidence(keypoints: PoseKeypoint[], threshold: number): boolean {
  return keypoints.length > 0 && keypoints.every((keypoint) => keypoint.score >= threshold);
}
