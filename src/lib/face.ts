// Face matching and a simple liveness check. Pure helpers shared by client and server.

export const DESCRIPTOR_LENGTH = 128;
export const DEFAULT_FACE_THRESHOLD = 0.5;
export const MAX_SAMPLES = 3;

export function isDescriptor(v: unknown): v is number[] {
  return (
    Array.isArray(v) &&
    v.length === DESCRIPTOR_LENGTH &&
    v.every((x) => typeof x === 'number' && Number.isFinite(x) && Math.abs(x) < 10)
  );
}

export function euclidean(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i]! - b[i]!;
    s += d * d;
  }
  return Math.sqrt(s);
}

/** Smallest distance from a descriptor to any enrolled sample. */
export function bestDistance(samples: number[][], descriptor: number[]): number | null {
  if (!samples.length) return null;
  let best = Infinity;
  for (const s of samples) best = Math.min(best, euclidean(s, descriptor));
  return Math.round(best * 1000) / 1000;
}

export function isMatch(
  samples: number[][],
  descriptor: number[],
  threshold = DEFAULT_FACE_THRESHOLD,
): boolean {
  const d = bestDistance(samples, descriptor);
  return d !== null && d <= threshold;
}

export interface Point {
  x: number;
  y: number;
}

/**
 * Head-turn estimate from 68-point landmarks: the nose tip's horizontal offset from the
 * midpoint of the outer eye corners, divided by the eye distance. About 0 when facing the camera,
 * negative when turned one way, positive the other.
 */
export function yawFromLandmarks(points: Point[]): number | null {
  if (points.length < 68) return null;
  const leftEye = points[36]!;
  const rightEye = points[45]!;
  const nose = points[30]!;
  const eyeDist = Math.hypot(rightEye.x - leftEye.x, rightEye.y - leftEye.y);
  if (eyeDist < 1) return null;
  const mid = (leftEye.x + rightEye.x) / 2;
  return (nose.x - mid) / eyeDist;
}

export const LIVENESS_YAW = 0.12;

/** Liveness passes when the sequence shows a clear turn to one side and then the other. */
export function livenessPassed(yaws: number[], minTurn = LIVENESS_YAW): boolean {
  const firstLeft = yaws.findIndex((y) => y <= -minTurn);
  const firstRight = yaws.findIndex((y) => y >= minTurn);
  if (firstLeft === -1 || firstRight === -1) return false;
  return true;
}
