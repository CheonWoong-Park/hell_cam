/**
 * Dynamic time warping over rep movement trajectories. DTW aligns two reps that
 * were performed at different speeds before comparing their shapes, so a slower
 * rep with the same depth profile still counts as "the same technique" while a
 * shallower or jerkier rep does not.
 */

/** Linearly resample a trajectory to a fixed number of points (time-normalized). */
export function resampleTrajectory(values: number[], targetLength: number): number[] {
  if (values.length === 0 || targetLength <= 0) {
    return [];
  }
  if (values.length === 1) {
    return new Array<number>(targetLength).fill(values[0]);
  }

  const result = new Array<number>(targetLength);
  for (let i = 0; i < targetLength; i += 1) {
    const position = (i / Math.max(targetLength - 1, 1)) * (values.length - 1);
    const lower = Math.floor(position);
    const upper = Math.min(Math.ceil(position), values.length - 1);
    const weight = position - lower;
    result[i] = values[lower] * (1 - weight) + values[upper] * weight;
  }
  return result;
}

/**
 * Average per-step gap along the optimal DTW alignment path. 0 means identical
 * shapes; for hip-depth trajectories (≈0-1 range) a gap of ~0.3 means the two
 * reps barely resemble each other.
 */
export function dtwAverageGap(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0) {
    return Number.POSITIVE_INFINITY;
  }

  const rows = a.length;
  const cols = b.length;
  // cost[i][j] = accumulated cost, steps[i][j] = alignment path length, so the
  // result can be normalized by the actual path length (not just rows + cols).
  const cost = Array.from({ length: rows }, () => new Array<number>(cols).fill(0));
  const steps = Array.from({ length: rows }, () => new Array<number>(cols).fill(0));

  for (let i = 0; i < rows; i += 1) {
    for (let j = 0; j < cols; j += 1) {
      const gap = Math.abs(a[i] - b[j]);
      if (i === 0 && j === 0) {
        cost[i][j] = gap;
        steps[i][j] = 1;
        continue;
      }

      let bestCost = Number.POSITIVE_INFINITY;
      let bestSteps = 0;
      if (i > 0 && cost[i - 1][j] < bestCost) {
        bestCost = cost[i - 1][j];
        bestSteps = steps[i - 1][j];
      }
      if (j > 0 && cost[i][j - 1] < bestCost) {
        bestCost = cost[i][j - 1];
        bestSteps = steps[i][j - 1];
      }
      if (i > 0 && j > 0 && cost[i - 1][j - 1] <= bestCost) {
        bestCost = cost[i - 1][j - 1];
        bestSteps = steps[i - 1][j - 1];
      }

      cost[i][j] = bestCost + gap;
      steps[i][j] = bestSteps + 1;
    }
  }

  return cost[rows - 1][cols - 1] / Math.max(steps[rows - 1][cols - 1], 1);
}
