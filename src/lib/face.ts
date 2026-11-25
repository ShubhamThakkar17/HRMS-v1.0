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

export const LIVENESS_TURN = 0.1;
export const LIVENESS_BACK = 0.06;

function median(xs: number[]): number {
  const a = [...xs].sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m]! : (a[m - 1]! + a[m]!) / 2;
}

/**
 * Liveness from a sequence of head-turn estimates: the head must turn away from its starting
 * position (either side) and come back. Measured against the person's own starting pose, so a
 * slightly angled camera or face does not matter.
 */
export function headTurnLiveness(
  yaws: number[],
  opts: { turn?: number; back?: number } = {},
): { passed: boolean; turned: boolean; baseline: number | null } {
  const turn = opts.turn ?? LIVENESS_TURN;
  const back = opts.back ?? LIVENESS_BACK;
  if (yaws.length < 3) return { passed: false, turned: false, baseline: null };
  const baseline = median(yaws.slice(0, 3));
  const i = yaws.findIndex((y, k) => k >= 3 && Math.abs(y - baseline) >= turn);
  if (i === -1) return { passed: false, turned: false, baseline };
  const returned = yaws.slice(i + 1).some((y) => Math.abs(y - baseline) <= back);
  return { passed: returned, turned: true, baseline };
}

/** @deprecated kept for older callers: true once the head has turned and come back. */
export function livenessPassed(yaws: number[]): boolean {
  return headTurnLiveness(yaws).passed;
}

export interface Framing {
  faces: number;
  /** Face box relative to the frame, 0–1. */
  box?: { x: number; y: number; width: number; height: number };
  /** Average luminance of the frame, 0–255. */
  brightness?: number;
  score?: number;
}

/** What to tell the person before a capture, or null when the frame is good. */
export function framingAdvice(f: Framing): string | null {
  if (f.brightness !== undefined && f.brightness < 55)
    return 'It is too dark. Face a window or turn on a light.';
  if (f.faces === 0 || !f.box) return 'Fit your face inside the oval';
  if (f.faces > 1) return 'Only one face, please';
  if (f.box.width < 0.24) return 'Move a little closer';
  if (f.box.width > 0.75) return 'Move back a little';
  const cx = f.box.x + f.box.width / 2;
  const cy = f.box.y + f.box.height / 2;
  if (Math.abs(cx - 0.5) > 0.17 || Math.abs(cy - 0.48) > 0.2) return 'Centre your face in the oval';
  if (f.score !== undefined && f.score < 0.55) return 'Hold still';
  return null;
}

/** Enrolment samples should all be the same person: no two further apart than this. */
export function samplesConsistent(samples: number[][], maxDistance = 0.55): boolean {
  for (let i = 0; i < samples.length; i++) {
    for (let j = i + 1; j < samples.length; j++)
      if (euclidean(samples[i]!, samples[j]!) > maxDistance) return false;
  }
  return true;
}
