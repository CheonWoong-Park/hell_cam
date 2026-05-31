import { squatConfig } from '../config/squatConfig';
import { calculateAngle, calculateDistance, clamp, midpoint, normalizeDistance, weightedMidpoint } from '../pose/geometry';
import { calculateAverageConfidence, getRequiredKeypoints } from '../pose/keypoints';
import { smoothMetric } from '../pose/smoothing';
import type { PoseFrame, PoseKeypoint } from '../../types/pose';
import type { CalibrationData, SquatMetrics } from '../../types/squat';

export function calculateSquatMetrics(
  poseFrame: PoseFrame,
  calibration: CalibrationData | null,
  previousMetrics: SquatMetrics | null,
): SquatMetrics {
  const required = getRequiredKeypoints(poseFrame);

  const requiredConfidence = required ? calculateAverageConfidence(Object.values(required)) : 0;
  const weakestRequiredConfidence = required
    ? Math.min(...Object.values(required).map((keypoint) => keypoint.score))
    : 0;
  const trackingConfidence = Math.min(requiredConfidence, weakestRequiredConfidence);
  const enoughForCoreTracking =
    required &&
    requiredConfidence >= squatConfig.confidence.minAverageScore &&
    hasReliableSide(required.left_shoulder, required.left_hip, required.left_knee, required.left_ankle) &&
    hasReliableSide(required.right_shoulder, required.right_hip, required.right_knee, required.right_ankle);

  if (!required || !enoughForCoreTracking) {
    return {
      phase: previousMetrics?.phase ?? 'idle',
      timestamp: poseFrame.timestamp,
      leftKneeAngle: null,
      rightKneeAngle: null,
      leftHipAngle: null,
      rightHipAngle: null,
      torsoLean: null,
      hipDepthRatio: previousMetrics?.hipDepthRatio ?? 0,
      kneeTrackingScore: 0,
      asymmetryScore: 0,
      confidence: required ? trackingConfidence : 0,
      bodyInFrame: poseFrame.bodyInFrame,
      hipY: previousMetrics?.hipY ?? null,
      shoulderY: previousMetrics?.shoulderY ?? null,
      kneeDistanceRatio: previousMetrics?.kneeDistanceRatio ?? null,
      hipVerticalVelocity: 0,
    };
  }

  const leftShoulder = required.left_shoulder;
  const rightShoulder = required.right_shoulder;
  const leftHip = required.left_hip;
  const rightHip = required.right_hip;
  const leftKnee = required.left_knee;
  const rightKnee = required.right_knee;
  const leftAnkle = required.left_ankle;
  const rightAnkle = required.right_ankle;

  const shoulderMid = weightedMidpoint(leftShoulder, rightShoulder);
  const hipMid = weightedMidpoint(leftHip, rightHip);
  const bodyScale = Math.max(calculateDistance(shoulderMid, hipMid), 1);
  const rangeOfMotion = calibration
    ? Math.max(calibration.rangeOfMotion, squatConfig.calibration.minRangeOfMotionPx)
    : Math.max(bodyScale * squatConfig.calibration.defaultRangeOfMotionScale, squatConfig.calibration.minRangeOfMotionPx);
  const baselineHipY = calibration?.baselineHipY ?? previousMetrics?.hipY ?? hipMid.y;
  const baselineKneeDistance = calibration?.baselineKneeDistance ?? normalizeDistance(calculateDistance(leftKnee, rightKnee), bodyScale);
  const kneeDistanceRatio = normalizeDistance(calculateDistance(leftKnee, rightKnee), bodyScale);
  const hipDepthRatio = clamp((hipMid.y - baselineHipY) / rangeOfMotion, 0, 1.25);
  const torsoLean = calculateTorsoLean(shoulderMid, hipMid);
  const timestampDeltaSeconds = previousMetrics
    ? Math.max((poseFrame.timestamp - previousMetrics.timestamp) / 1000, 0.001)
    : 0.001;
  const finiteDifferenceVelocity = previousMetrics?.hipY ? (hipMid.y - previousMetrics.hipY) / timestampDeltaSeconds : 0;
  // Prefer the Kalman-estimated hip velocity (clean, low-lag); fall back to the
  // finite difference when keypoints carry no velocity (e.g. unit tests).
  const rawVelocity = hipVerticalVelocityFromKeypoints(leftHip, rightHip) ?? finiteDifferenceVelocity;

  const rawMetrics = {
    phase: previousMetrics?.phase ?? 'idle',
    timestamp: poseFrame.timestamp,
    leftKneeAngle: calculateAngle(leftHip, leftKnee, leftAnkle),
    rightKneeAngle: calculateAngle(rightHip, rightKnee, rightAnkle),
    leftHipAngle: calculateAngle(leftShoulder, leftHip, leftKnee),
    rightHipAngle: calculateAngle(rightShoulder, rightHip, rightKnee),
    torsoLean,
    hipDepthRatio,
    kneeTrackingScore: calculateKneeTrackingScore(kneeDistanceRatio, baselineKneeDistance),
    asymmetryScore: calculateAsymmetryScore(leftHip, rightHip, leftKnee, rightKnee, leftAnkle, rightAnkle),
    confidence: trackingConfidence,
    bodyInFrame: poseFrame.bodyInFrame,
    hipY: hipMid.y,
    shoulderY: shoulderMid.y,
    kneeDistanceRatio,
    hipVerticalVelocity: rawVelocity,
  };

  return smoothMetrics(previousMetrics, rawMetrics);
}

function smoothMetrics(previous: SquatMetrics | null, current: SquatMetrics): SquatMetrics {
  if (!previous) {
    return current;
  }

  const alpha = squatConfig.smoothing.metricAlpha;

  return {
    ...current,
    leftKneeAngle: smoothNullable(previous.leftKneeAngle, current.leftKneeAngle, alpha),
    rightKneeAngle: smoothNullable(previous.rightKneeAngle, current.rightKneeAngle, alpha),
    leftHipAngle: smoothNullable(previous.leftHipAngle, current.leftHipAngle, alpha),
    rightHipAngle: smoothNullable(previous.rightHipAngle, current.rightHipAngle, alpha),
    torsoLean: smoothNullable(previous.torsoLean, current.torsoLean, alpha),
    hipDepthRatio: smoothMetric(previous.hipDepthRatio, current.hipDepthRatio, alpha),
    kneeTrackingScore: smoothMetric(previous.kneeTrackingScore, current.kneeTrackingScore, alpha),
    asymmetryScore: smoothMetric(previous.asymmetryScore, current.asymmetryScore, alpha),
    hipY: smoothNullable(previous.hipY, current.hipY, alpha),
    shoulderY: smoothNullable(previous.shoulderY, current.shoulderY, alpha),
    kneeDistanceRatio: smoothNullable(previous.kneeDistanceRatio, current.kneeDistanceRatio, alpha),
    hipVerticalVelocity: smoothMetric(previous.hipVerticalVelocity, current.hipVerticalVelocity, alpha),
  };
}

function smoothNullable(previous: number | null, current: number | null, alpha: number) {
  if (current === null) {
    return null;
  }

  return smoothMetric(previous, current, alpha);
}

function hipVerticalVelocityFromKeypoints(leftHip: PoseKeypoint, rightHip: PoseKeypoint): number | null {
  if (leftHip.vy === undefined || rightHip.vy === undefined) {
    return null;
  }

  const totalScore = leftHip.score + rightHip.score;
  if (totalScore <= 0) {
    return (leftHip.vy + rightHip.vy) / 2;
  }

  return (leftHip.vy * leftHip.score + rightHip.vy * rightHip.score) / totalScore;
}

function calculateTorsoLean(shoulderMid: PoseKeypoint, hipMid: PoseKeypoint): number {
  const dx = shoulderMid.x - hipMid.x;
  const dy = hipMid.y - shoulderMid.y;
  return (Math.atan2(Math.abs(dx), Math.max(Math.abs(dy), 1)) * 180) / Math.PI;
}

function hasReliableSide(
  shoulder: PoseKeypoint,
  hip: PoseKeypoint,
  knee: PoseKeypoint,
  ankle: PoseKeypoint,
) {
  return [shoulder, hip, knee, ankle].every((keypoint) => keypoint.score >= squatConfig.confidence.sideMinScore);
}

function calculateKneeTrackingScore(kneeDistanceRatio: number, baselineKneeDistance: number): number {
  if (baselineKneeDistance <= 0) {
    return 100;
  }

  const inwardChangeRatio = Math.max((baselineKneeDistance - kneeDistanceRatio) / baselineKneeDistance, 0);
  return clamp(100 - inwardChangeRatio * 160, 0, 100);
}

function calculateAsymmetryScore(
  leftHip: PoseKeypoint,
  rightHip: PoseKeypoint,
  leftKnee: PoseKeypoint,
  rightKnee: PoseKeypoint,
  leftAnkle: PoseKeypoint,
  rightAnkle: PoseKeypoint,
) {
  const leftKneeAngle = calculateAngle(leftHip, leftKnee, leftAnkle);
  const rightKneeAngle = calculateAngle(rightHip, rightKnee, rightAnkle);
  const kneeDifference = Math.abs(leftKneeAngle - rightKneeAngle);
  const hipHeightDifference = Math.abs(leftHip.y - rightHip.y);
  const ankleHeightDifference = Math.abs(leftAnkle.y - rightAnkle.y);

  return clamp(100 - kneeDifference * 1.4 - hipHeightDifference * 0.35 - ankleHeightDifference * 0.2, 0, 100);
}
