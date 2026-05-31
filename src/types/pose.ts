export const moveNetKeypointNames = [
  'nose',
  'left_eye',
  'right_eye',
  'left_ear',
  'right_ear',
  'left_shoulder',
  'right_shoulder',
  'left_elbow',
  'right_elbow',
  'left_wrist',
  'right_wrist',
  'left_hip',
  'right_hip',
  'left_knee',
  'right_knee',
  'left_ankle',
  'right_ankle',
] as const;

export type KeypointName = (typeof moveNetKeypointNames)[number];

export interface PoseKeypoint {
  name: KeypointName;
  x: number;
  y: number;
  score: number;
  /** Estimated velocity (px/sec) from the Kalman smoother, when available. */
  vx?: number;
  vy?: number;
}

export interface PoseFrame {
  keypoints: PoseKeypoint[];
  timestamp: number;
  averageScore: number;
  bodyInFrame: boolean;
  videoWidth: number;
  videoHeight: number;
}
