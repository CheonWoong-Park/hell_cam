import type { PoseKeypoint } from '../../types/pose';

export function smoothKeypoints(
  previous: PoseKeypoint[] | null,
  current: PoseKeypoint[],
  alpha: number,
): PoseKeypoint[] {
  if (!previous) {
    return current;
  }

  return current.map((keypoint) => {
    const previousKeypoint = previous.find((item) => item.name === keypoint.name);
    if (!previousKeypoint) {
      return keypoint;
    }

    return {
      ...keypoint,
      x: smoothMetric(previousKeypoint.x, keypoint.x, alpha),
      y: smoothMetric(previousKeypoint.y, keypoint.y, alpha),
      score: keypoint.score,
    };
  });
}

export function smoothMetric(previous: number | null | undefined, current: number, alpha: number): number {
  if (previous === null || previous === undefined || Number.isNaN(previous)) {
    return current;
  }

  return previous * (1 - alpha) + current * alpha;
}

export function createMovingAverage(windowSize: number) {
  const values: number[] = [];

  return (nextValue: number): number => {
    values.push(nextValue);
    if (values.length > windowSize) {
      values.shift();
    }

    return values.reduce((sum, value) => sum + value, 0) / values.length;
  };
}
