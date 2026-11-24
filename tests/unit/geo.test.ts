import { describe, expect, it } from 'vitest';
import { evaluateGeoPunch, haversineM, nearestOffice, type OfficeGeo } from '@/lib/geo';

const HO: OfficeGeo = { id: 'ho', code: 'HO', name: 'Head office', lat: 23.0225, lng: 72.5714, radiusM: 200 };
const VDR: OfficeGeo = { id: 'vdr', code: 'VDR', name: 'Vadodara', lat: 22.3072, lng: 73.1812, radiusM: 200 };

describe('haversine', () => {
  it('is zero for the same point', () => {
    expect(haversineM(23.0225, 72.5714, 23.0225, 72.5714)).toBe(0);
  });
  it('matches a known distance (Ahmedabad to Vadodara is about 100 km)', () => {
    const d = haversineM(HO.lat, HO.lng, VDR.lat, VDR.lng);
    expect(d).toBeGreaterThan(98_000);
    expect(d).toBeLessThan(103_000);
  });
  it('measures about 111 m per 0.001 degree of latitude', () => {
    expect(haversineM(23, 72, 23.001, 72)).toBe(111);
  });
  it('finds the nearest office', () => {
    expect(nearestOffice([HO, VDR], 22.31, 73.18)?.office.code).toBe('VDR');
  });
});

describe('work-mode geofence rules', () => {
  const inside = { lat: 23.023, lng: 72.5718, accuracyM: 20 };
  const farAway = { lat: 23.0675, lng: 72.5714, accuracyM: 20 }; // about 5 km north

  it('records the office and distance inside the radius', () => {
    const r = evaluateGeoPunch('OFFICE', [HO, VDR], inside);
    expect(r).toMatchObject({ ok: true, officeId: 'ho', insideGeofence: true, flag: null, remote: false });
    if (r.ok) expect(r.distanceM).toBeLessThan(200);
  });
  it('flags office staff outside every geofence', () => {
    const r = evaluateGeoPunch('OFFICE', [HO, VDR], farAway);
    expect(r).toMatchObject({ ok: true, officeId: null, flag: 'OUTSIDE_GEOFENCE', remote: false });
    if (r.ok) expect(r.distanceM).toBeGreaterThan(4_900);
  });
  it('records hybrid and remote staff outside a geofence as remote, unflagged', () => {
    for (const mode of ['HYBRID', 'REMOTE'] as const) {
      expect(evaluateGeoPunch(mode, [HO], farAway)).toMatchObject({
        ok: true,
        remote: true,
        flag: null,
        officeId: null,
      });
    }
  });
  it('treats hybrid staff inside the office as in the office', () => {
    expect(evaluateGeoPunch('HYBRID', [HO], inside)).toMatchObject({
      ok: true,
      remote: false,
      officeId: 'ho',
    });
  });
  it('rejects readings with accuracy worse than 150 m', () => {
    expect(evaluateGeoPunch('OFFICE', [HO], { ...inside, accuracyM: 151 })).toEqual({
      ok: false,
      reason: 'INACCURATE',
    });
    expect(evaluateGeoPunch('OFFICE', [HO], { ...inside, accuracyM: 150 }).ok).toBe(true);
  });
  it('rejects invalid readings and an empty office list', () => {
    expect(evaluateGeoPunch('OFFICE', [HO], { lat: 200, lng: 0, accuracyM: 5 })).toEqual({
      ok: false,
      reason: 'INVALID',
    });
    expect(evaluateGeoPunch('OFFICE', [], inside)).toEqual({ ok: false, reason: 'NO_OFFICES' });
  });
});
