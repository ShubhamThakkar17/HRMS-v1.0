import { describe, expect, it } from 'vitest';
import { bestDistance, euclidean, isDescriptor, isMatch, livenessPassed, yawFromLandmarks } from '@/lib/face';

const vec = (v: number) => Array.from({ length: 128 }, () => v);

describe('face matching', () => {
  it('validates 128-number descriptors', () => {
    expect(isDescriptor(vec(0.1))).toBe(true);
    expect(isDescriptor(vec(0.1).slice(1))).toBe(false);
    expect(isDescriptor([...vec(0.1).slice(1), Number.NaN])).toBe(false);
    expect(isDescriptor('x')).toBe(false);
  });
  it('computes Euclidean distance', () => {
    expect(euclidean([0, 0], [3, 4])).toBe(5);
  });
  it('uses the best of several samples against the threshold', () => {
    const samples = [vec(0), vec(0.1)];
    const probe = vec(0.12); // distance to vec(0.1) is 0.02 * sqrt(128) ≈ 0.226
    expect(bestDistance(samples, probe)).toBeCloseTo(0.226, 2);
    expect(isMatch(samples, probe, 0.5)).toBe(true);
    expect(isMatch(samples, vec(0.2), 0.5)).toBe(false); // ≈ 1.13 from the closest
    expect(bestDistance([], probe)).toBeNull();
  });
});

describe('liveness (head turn)', () => {
  const face = (noseX: number) => {
    const pts = Array.from({ length: 68 }, () => ({ x: 0, y: 0 }));
    pts[36] = { x: 100, y: 100 };
    pts[45] = { x: 200, y: 100 };
    pts[30] = { x: noseX, y: 150 };
    return pts;
  };
  it('estimates yaw from the nose offset', () => {
    expect(yawFromLandmarks(face(150))).toBe(0);
    expect(yawFromLandmarks(face(130))).toBeCloseTo(-0.2);
    expect(yawFromLandmarks([])).toBeNull();
  });
  it('passes only when the head turns to both sides', () => {
    expect(livenessPassed([0, -0.2, 0, 0.2])).toBe(true);
    expect(livenessPassed([0, -0.2, -0.25, 0])).toBe(false);
    expect(livenessPassed([0, 0.05, -0.05])).toBe(false);
  });
});
