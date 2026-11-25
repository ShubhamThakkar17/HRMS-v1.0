import { describe, expect, it } from 'vitest';
import {
  bestDistance,
  euclidean,
  framingAdvice,
  headTurnLiveness,
  isDescriptor,
  isMatch,
  samplesConsistent,
  yawFromLandmarks,
} from '@/lib/face';

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
  it('passes on a turn to either side and back', () => {
    expect(headTurnLiveness([0, 0.01, 0, 0.05, 0.14, 0.08, 0.02]).passed).toBe(true);
    expect(headTurnLiveness([0, 0, 0, -0.15, -0.05]).passed).toBe(true);
  });
  it('is measured against the starting pose, not the camera', () => {
    // Someone sitting at an angle: baseline 0.2, turn to 0.33 and back.
    expect(headTurnLiveness([0.2, 0.21, 0.19, 0.33, 0.22]).passed).toBe(true);
    expect(headTurnLiveness([0.2, 0.21, 0.19, 0.25, 0.22]).turned).toBe(false);
  });
  it('fails a still photo or a head that never comes back', () => {
    expect(headTurnLiveness([0, 0.01, 0, 0.02, 0.01, 0]).passed).toBe(false);
    expect(headTurnLiveness([0, 0, 0, 0.15, 0.16, 0.17])).toMatchObject({ passed: false, turned: true });
    expect(headTurnLiveness([0, 0.2]).passed).toBe(false);
  });
});

describe('framing advice', () => {
  const box = { x: 0.32, y: 0.25, width: 0.36, height: 0.45 };
  it('accepts a well-framed, well-lit face', () => {
    expect(framingAdvice({ faces: 1, box, brightness: 120, score: 0.9 })).toBeNull();
  });
  it('guides distance, centring, light and extra faces', () => {
    expect(framingAdvice({ faces: 0 })).toMatch(/oval/);
    expect(framingAdvice({ faces: 2, box })).toMatch(/one face/);
    expect(framingAdvice({ faces: 1, box: { ...box, width: 0.15 } })).toMatch(/closer/);
    expect(framingAdvice({ faces: 1, box: { ...box, width: 0.8, x: 0.1 } })).toMatch(/back/);
    expect(framingAdvice({ faces: 1, box: { ...box, x: 0.6 } })).toMatch(/Centre/);
    expect(framingAdvice({ faces: 1, box, brightness: 30 })).toMatch(/dark/);
  });
});

describe('enrolment samples', () => {
  const vec = (v: number) => Array.from({ length: 128 }, () => v);
  it('must look like the same person', () => {
    expect(samplesConsistent([vec(0.1), vec(0.12), vec(0.11)])).toBe(true);
    expect(samplesConsistent([vec(0.1), vec(0.2)])).toBe(false);
  });
});
