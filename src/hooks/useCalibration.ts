import { useCallback, useRef, useState } from 'react';
import { squatConfig } from '../lib/config/squatConfig';
import { calculateAngle, calculateDistance, midpoint, normalizeDistance, weightedMidpoint } from '../lib/pose/geometry';
import { getRequiredKeypoints } from '../lib/pose/keypoints';
import type { PoseFrame, PoseKeypoint } from '../types/pose';
import type { CalibrationData, CalibrationProgress } from '../types/squat';

const initialCalibrationProgress: CalibrationProgress = {
  isCalibrating: false,
  stage: 'idle',
  message: '캘리브레이션을 하면 분석이 더 안정적입니다.',
  progress: 0,
};

export function useCalibration() {
  const [calibrationData, setCalibrationData] = useState<CalibrationData | null>(null);
  const [progress, setProgress] = useState<CalibrationProgress>(initialCalibrationProgress);
  const progressRef = useRef<CalibrationProgress>(initialCalibrationProgress);
  const standingFramesRef = useRef<PoseFrame[]>([]);
  const romFramesRef = useRef<PoseFrame[]>([]);
  const stageStartedAtRef = useRef<number>(0);

  const commitProgress = useCallback((next: CalibrationProgress | ((current: CalibrationProgress) => CalibrationProgress)) => {
    const nextProgress = typeof next === 'function' ? next(progressRef.current) : next;
    progressRef.current = nextProgress;
    setProgress(nextProgress);
  }, []);

  const startCalibration = useCallback(() => {
    standingFramesRef.current = [];
    romFramesRef.current = [];
    stageStartedAtRef.current = performance.now();
    commitProgress({
      isCalibrating: true,
      stage: 'standing',
      message: '전신이 화면에 들어오게 서서 자연스럽게 선 자세를 유지해 주세요.',
      progress: 0,
    });
  }, [commitProgress]);

  const resetCalibration = useCallback(() => {
    standingFramesRef.current = [];
    romFramesRef.current = [];
    setCalibrationData(null);
    commitProgress(initialCalibrationProgress);
  }, [commitProgress]);

  const updateCalibration = useCallback((poseFrame: PoseFrame | null) => {
    const currentProgress = progressRef.current;
    if (!poseFrame || !currentProgress.isCalibrating) {
      return;
    }

    if (!poseFrame.bodyInFrame || poseFrame.averageScore < squatConfig.confidence.minAverageScore) {
      commitProgress((current) => ({
        ...current,
        message: '전신과 주요 관절이 안정적으로 보이게 카메라 거리와 조명을 조정해 주세요.',
      }));
      return;
    }

    const elapsed = poseFrame.timestamp - stageStartedAtRef.current;

    if (currentProgress.stage === 'standing') {
      standingFramesRef.current.push(poseFrame);
      const nextProgress = Math.min(elapsed / squatConfig.calibration.standingHoldMs, 1);

      if (
        elapsed >= squatConfig.calibration.standingHoldMs &&
        standingFramesRef.current.length >= squatConfig.calibration.minStandingFrames
      ) {
        stageStartedAtRef.current = poseFrame.timestamp;
        commitProgress({
          isCalibrating: true,
          stage: 'rom',
          message: '가능하면 편안한 테스트 스쿼트 2~3회를 수행해 주세요.',
          progress: 0.35,
        });
        return;
      }

      commitProgress((current) => ({ ...current, progress: nextProgress * 0.35 }));
      return;
    }

    if (currentProgress.stage === 'rom') {
      romFramesRef.current.push(poseFrame);
      const nextProgress = Math.min(elapsed / squatConfig.calibration.romCollectionMs, 1);

      if (elapsed >= squatConfig.calibration.romCollectionMs) {
        const nextCalibration = createCalibrationFromPoseFrames(standingFramesRef.current, romFramesRef.current);
        setCalibrationData(nextCalibration);
        commitProgress({
          isCalibrating: false,
          stage: 'complete',
          message: '캘리브레이션이 완료되었습니다.',
          progress: 1,
        });
        return;
      }

      commitProgress((current) => ({ ...current, progress: 0.35 + nextProgress * 0.65 }));
    }
  }, [commitProgress]);

  return {
    calibrationData,
    progress,
    startCalibration,
    updateCalibration,
    resetCalibration,
  };
}

export function createCalibrationFromPoseFrame(poseFrame: PoseFrame): CalibrationData | null {
  if (!poseFrame.bodyInFrame || poseFrame.averageScore < squatConfig.confidence.minAverageScore) {
    return null;
  }

  const required = getRequiredKeypoints(poseFrame);
  if (!required || !looksLikeStandingPose(required)) {
    return null;
  }

  return createCalibrationFromPoseFrames([poseFrame], []);
}

function createCalibrationFromPoseFrames(standingFrames: PoseFrame[], romFrames: PoseFrame[]): CalibrationData {
  const standingPose = averagePoseFrame(standingFrames);
  const required = getRequiredKeypoints(standingPose);

  if (!required) {
    throw new Error('캘리브레이션에 필요한 관절 데이터를 찾지 못했습니다.');
  }

  const standingSamples = standingFrames.map(extractCalibrationSample).filter(Boolean) as CalibrationSample[];
  const romSamples = romFrames.map(extractCalibrationSample).filter(Boolean) as CalibrationSample[];
  const shoulderMid = weightedMidpoint(required.left_shoulder, required.right_shoulder);
  const hipMid = weightedMidpoint(required.left_hip, required.right_hip);
  const bodyScale = Math.max(calculateDistance(shoulderMid, hipMid), 1);
  const baselineHipY = percentile(
    standingSamples.map((sample) => sample.hipY),
    squatConfig.calibration.baselinePercentile,
    hipMid.y,
  );
  const baselineShoulderY = percentile(
    standingSamples.map((sample) => sample.shoulderY),
    squatConfig.calibration.baselinePercentile,
    shoulderMid.y,
  );
  const baselineTorsoLean = percentile(
    standingSamples.map((sample) => sample.torsoLean),
    squatConfig.calibration.baselinePercentile,
    calculateTorsoLean(shoulderMid, hipMid),
  );
  const baselineKneeDistance = percentile(
    standingSamples.map((sample) => sample.kneeDistanceRatio),
    squatConfig.calibration.baselinePercentile,
    normalizeDistance(calculateDistance(required.left_knee, required.right_knee), bodyScale),
  );
  const observedBottomHipY = percentile(
    romSamples.map((sample) => sample.hipY),
    squatConfig.calibration.bottomPercentile,
    hipMid.y,
  );
  const estimatedBottomHipY = Math.max(
    observedBottomHipY,
    baselineHipY + bodyScale * squatConfig.calibration.defaultRangeOfMotionScale,
  );
  const rangeOfMotion = Math.max(estimatedBottomHipY - baselineHipY, squatConfig.calibration.minRangeOfMotionPx);

  return {
    standingPose,
    baselineHipY,
    baselineShoulderY,
    baselineTorsoLean,
    baselineKneeDistance,
    estimatedBottomHipY,
    rangeOfMotion,
    createdAt: performance.now(),
  };
}

function averagePoseFrame(frames: PoseFrame[]): PoseFrame {
  const sourceFrames = frames.length > 0 ? frames : [];
  if (sourceFrames.length === 0) {
    throw new Error('캘리브레이션 프레임이 없습니다.');
  }

  const reference = sourceFrames[sourceFrames.length - 1];
  const keypoints = reference.keypoints.map((keypoint) => averageKeypoint(keypoint, sourceFrames));

  return {
    ...reference,
    keypoints,
    averageScore: keypoints.reduce((sum, keypoint) => sum + keypoint.score, 0) / keypoints.length,
  };
}

function averageKeypoint(reference: PoseKeypoint, frames: PoseFrame[]): PoseKeypoint {
  const samples = frames
    .map((frame) => frame.keypoints.find((keypoint) => keypoint.name === reference.name))
    .filter(Boolean) as PoseKeypoint[];

  return {
    name: reference.name,
    x: samples.reduce((sum, sample) => sum + sample.x, 0) / samples.length,
    y: samples.reduce((sum, sample) => sum + sample.y, 0) / samples.length,
    score: samples.reduce((sum, sample) => sum + sample.score, 0) / samples.length,
  };
}

function calculateTorsoLean(shoulderMid: PoseKeypoint, hipMid: PoseKeypoint): number {
  const dx = shoulderMid.x - hipMid.x;
  const dy = hipMid.y - shoulderMid.y;
  return (Math.atan2(Math.abs(dx), Math.max(Math.abs(dy), 1)) * 180) / Math.PI;
}

function looksLikeStandingPose(required: NonNullable<ReturnType<typeof getRequiredKeypoints>>) {
  const leftKneeAngle = calculateAngle(required.left_hip, required.left_knee, required.left_ankle);
  const rightKneeAngle = calculateAngle(required.right_hip, required.right_knee, required.right_ankle);
  const averageKneeAngle = (leftKneeAngle + rightKneeAngle) / 2;

  return averageKneeAngle >= squatConfig.phase.minStandingKneeAngle;
}

interface CalibrationSample {
  hipY: number;
  shoulderY: number;
  torsoLean: number;
  kneeDistanceRatio: number;
}

function extractCalibrationSample(frame: PoseFrame): CalibrationSample | null {
  const required = getRequiredKeypoints(frame);
  if (!required) {
    return null;
  }

  const shoulderMid = weightedMidpoint(required.left_shoulder, required.right_shoulder);
  const hipMid = weightedMidpoint(required.left_hip, required.right_hip);
  const bodyScale = Math.max(calculateDistance(shoulderMid, hipMid), 1);

  return {
    hipY: hipMid.y,
    shoulderY: shoulderMid.y,
    torsoLean: calculateTorsoLean(shoulderMid, hipMid),
    kneeDistanceRatio: normalizeDistance(calculateDistance(required.left_knee, required.right_knee), bodyScale),
  };
}

function percentile(values: number[], percentileValue: number, fallback: number): number {
  if (values.length === 0) {
    return fallback;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const boundedPercentile = Math.min(Math.max(percentileValue, 0), 1);
  const index = Math.round((sorted.length - 1) * boundedPercentile);
  return sorted[index] ?? fallback;
}
