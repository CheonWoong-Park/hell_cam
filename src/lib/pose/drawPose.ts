import { squatConfig } from '../config/squatConfig';
import type { KeypointName, PoseFrame, PoseKeypoint } from '../../types/pose';

const skeletonEdges: Array<[KeypointName, KeypointName]> = [
  ['left_shoulder', 'right_shoulder'],
  ['left_shoulder', 'left_hip'],
  ['right_shoulder', 'right_hip'],
  ['left_hip', 'right_hip'],
  ['left_hip', 'left_knee'],
  ['left_knee', 'left_ankle'],
  ['right_hip', 'right_knee'],
  ['right_knee', 'right_ankle'],
];

interface DrawOptions {
  mirror: boolean;
}

export function drawPose(
  canvas: HTMLCanvasElement,
  poseFrame: PoseFrame | null,
  videoWidth: number,
  videoHeight: number,
  options: DrawOptions,
) {
  const context = canvas.getContext('2d');
  if (!context || videoWidth <= 0 || videoHeight <= 0) {
    return;
  }

  const dpr = window.devicePixelRatio || 1;
  const bufferWidth = Math.round(videoWidth * dpr);
  const bufferHeight = Math.round(videoHeight * dpr);

  if (canvas.width !== bufferWidth || canvas.height !== bufferHeight) {
    canvas.width = bufferWidth;
    canvas.height = bufferHeight;
  }

  context.save();
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.scale(dpr, dpr);

  if (!poseFrame) {
    context.restore();
    return;
  }

  drawSkeleton(context, poseFrame.keypoints, videoWidth, options.mirror);
  drawKeypoints(context, poseFrame.keypoints, videoWidth, options.mirror);
  context.restore();
}

function drawSkeleton(
  context: CanvasRenderingContext2D,
  keypoints: PoseKeypoint[],
  videoWidth: number,
  mirror: boolean,
) {
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.lineWidth = squatConfig.drawing.lineWidth;

  skeletonEdges.forEach(([fromName, toName]) => {
    const from = keypoints.find((keypoint) => keypoint.name === fromName);
    const to = keypoints.find((keypoint) => keypoint.name === toName);

    if (!from || !to) {
      return;
    }

    const confidence = Math.min(from.score, to.score);
    if (confidence < squatConfig.confidence.minKeypointScore) {
      return;
    }

    context.globalAlpha =
      confidence < squatConfig.confidence.minRequiredKeypointScore ? squatConfig.drawing.lowConfidenceAlpha : 0.9;
    context.strokeStyle = '#38bdf8';
    context.beginPath();
    context.moveTo(toCanvasX(from.x, videoWidth, mirror), from.y);
    context.lineTo(toCanvasX(to.x, videoWidth, mirror), to.y);
    context.stroke();
  });

  context.globalAlpha = 1;
}

function drawKeypoints(
  context: CanvasRenderingContext2D,
  keypoints: PoseKeypoint[],
  videoWidth: number,
  mirror: boolean,
) {
  keypoints.forEach((keypoint) => {
    if (keypoint.score < squatConfig.confidence.minKeypointScore) {
      return;
    }

    context.globalAlpha =
      keypoint.score < squatConfig.confidence.minRequiredKeypointScore ? squatConfig.drawing.lowConfidenceAlpha : 1;
    context.fillStyle = '#facc15';
    context.strokeStyle = '#0f172a';
    context.lineWidth = 2;
    context.beginPath();
    context.arc(
      toCanvasX(keypoint.x, videoWidth, mirror),
      keypoint.y,
      squatConfig.drawing.keypointRadius,
      0,
      Math.PI * 2,
    );
    context.fill();
    context.stroke();
  });

  context.globalAlpha = 1;
}

function toCanvasX(x: number, videoWidth: number, mirror: boolean) {
  return mirror ? videoWidth - x : x;
}
