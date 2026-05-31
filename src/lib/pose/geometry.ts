import type { PoseKeypoint } from '../../types/pose';

export function calculateAngle(a: PoseKeypoint, b: PoseKeypoint, c: PoseKeypoint): number {
  const ab = { x: a.x - b.x, y: a.y - b.y };
  const cb = { x: c.x - b.x, y: c.y - b.y };
  const dot = ab.x * cb.x + ab.y * cb.y;
  const abLength = Math.hypot(ab.x, ab.y);
  const cbLength = Math.hypot(cb.x, cb.y);

  if (abLength === 0 || cbLength === 0) {
    return 0;
  }

  const cosine = clamp(dot / (abLength * cbLength), -1, 1);
  return (Math.acos(cosine) * 180) / Math.PI;
}

export function calculateDistance(a: PoseKeypoint, b: PoseKeypoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function midpoint(a: PoseKeypoint, b: PoseKeypoint): PoseKeypoint {
  return {
    name: a.name,
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
    score: Math.min(a.score, b.score),
  };
}

export function weightedMidpoint(a: PoseKeypoint, b: PoseKeypoint): PoseKeypoint {
  const totalScore = a.score + b.score;

  if (totalScore <= 0) {
    return midpoint(a, b);
  }

  return {
    name: a.name,
    x: (a.x * a.score + b.x * b.score) / totalScore,
    y: (a.y * a.score + b.y * b.score) / totalScore,
    score: Math.min(a.score, b.score),
  };
}

export function normalizeDistance(distance: number, bodyScale: number): number {
  if (bodyScale <= 0) {
    return 0;
  }
  return distance / bodyScale;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
