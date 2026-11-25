import { describe, expect, it } from 'vitest';
import {
  evaluateGeoPunch,
  haversineM,
  nearestOffice,
  parseLatLng,
  type GeoPolicy,
  type OfficeGeo,
  type ZoneGeo,
} from '@/lib/geo';

const HO: OfficeGeo = { id: 'ho', code: 'HO', name: 'Head office', lat: 23.0225, lng: 72.5714, radiusM: 200 };
const VDR: OfficeGeo = { id: 'vdr', code: 'VDR', name: 'Vadodara', lat: 22.3072, lng: 73.1812, radiusM: 200 };
const CLIENT: ZoneGeo = {
  id: 'z1',
  name: 'Client site, Gandhinagar',
  lat: 23.2156,
  lng: 72.6369,
  radiusM: 300,
};

const policy = (over: Partial<GeoPolicy> = {}): GeoPolicy => ({
  workMode: 'OFFICE',
  rule: 'ANY_OFFICE',
  strict: false,
  assignedOfficeId: 'ho',
  ...over,
});
const inside = { lat: 23.023, lng: 72.5718, accuracyM: 20 };
const farAway = { lat: 23.0675, lng: 72.5714, accuracyM: 20 }; // about 5 km north of HO
const atClient = { lat: 23.2158, lng: 72.637, accuracyM: 15 };
const atVdr = { lat: 22.3074, lng: 73.1813, accuracyM: 15 };

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

describe('default rule: any office', () => {
  it('records the office and distance inside the radius', () => {
    const r = evaluateGeoPunch(policy(), [HO, VDR], [], inside);
    expect(r).toMatchObject({ ok: true, officeId: 'ho', insideGeofence: true, flag: null, remote: false });
    if (r.ok) expect(r.distanceM).toBeLessThan(200);
  });
  it('accepts the other office too', () => {
    expect(evaluateGeoPunch(policy(), [HO, VDR], [], atVdr)).toMatchObject({ ok: true, officeId: 'vdr' });
  });
  it('flags office staff outside every geofence', () => {
    const r = evaluateGeoPunch(policy(), [HO, VDR], [], farAway);
    expect(r).toMatchObject({
      ok: true,
      officeId: null,
      flag: 'OUTSIDE_GEOFENCE',
      remote: false,
      nearestName: 'Head office',
    });
    if (r.ok) expect(r.distanceM).toBeGreaterThan(4_900);
  });
  it('records hybrid and remote staff outside a geofence as remote, unflagged', () => {
    for (const workMode of ['HYBRID', 'REMOTE'] as const) {
      expect(evaluateGeoPunch(policy({ workMode }), [HO], [], farAway)).toMatchObject({
        ok: true,
        remote: true,
        flag: null,
      });
    }
  });
});

describe('per-employee rules', () => {
  it('assigned office only: the other office counts as outside', () => {
    expect(evaluateGeoPunch(policy({ rule: 'ASSIGNED_OFFICE' }), [HO, VDR], [], atVdr)).toMatchObject({
      ok: true,
      flag: 'OUTSIDE_GEOFENCE',
    });
    expect(evaluateGeoPunch(policy({ rule: 'ASSIGNED_OFFICE' }), [HO, VDR], [], inside)).toMatchObject({
      ok: true,
      officeId: 'ho',
    });
  });
  it('offices and zones: a custom zone is inside and named', () => {
    const r = evaluateGeoPunch(policy({ rule: 'OFFICES_AND_ZONES' }), [HO], [CLIENT], atClient);
    expect(r).toMatchObject({
      ok: true,
      officeId: null,
      zoneName: 'Client site, Gandhinagar',
      insideGeofence: true,
      flag: null,
    });
  });
  it('zones only: the office itself is outside', () => {
    expect(evaluateGeoPunch(policy({ rule: 'ZONES_ONLY' }), [HO], [CLIENT], inside)).toMatchObject({
      ok: true,
      flag: 'OUTSIDE_GEOFENCE',
    });
    expect(evaluateGeoPunch(policy({ rule: 'ZONES_ONLY' }), [HO], [], inside)).toEqual({
      ok: false,
      reason: 'NO_AREAS',
    });
  });
  it('anywhere: never flags or refuses, still names a matching area', () => {
    expect(evaluateGeoPunch(policy({ rule: 'ANYWHERE', strict: true }), [HO], [], farAway)).toMatchObject({
      ok: true,
      flag: null,
      remote: true,
    });
    expect(evaluateGeoPunch(policy({ rule: 'ANYWHERE' }), [HO], [], inside)).toMatchObject({
      ok: true,
      officeId: 'ho',
    });
  });
  it('strict: refuses outside punches with the nearest area and distance', () => {
    const r = evaluateGeoPunch(policy({ strict: true }), [HO], [], farAway);
    expect(r).toMatchObject({ ok: false, reason: 'OUTSIDE_ALLOWED', nearestName: 'Head office' });
    expect(evaluateGeoPunch(policy({ strict: true }), [HO], [], inside).ok).toBe(true);
  });
});

describe('reading checks', () => {
  it('rejects readings with accuracy worse than 150 m', () => {
    expect(evaluateGeoPunch(policy(), [HO], [], { ...inside, accuracyM: 151 })).toEqual({
      ok: false,
      reason: 'INACCURATE',
    });
    expect(evaluateGeoPunch(policy(), [HO], [], { ...inside, accuracyM: 150 }).ok).toBe(true);
  });
  it('rejects invalid readings and an empty office list', () => {
    expect(evaluateGeoPunch(policy(), [HO], [], { lat: 200, lng: 0, accuracyM: 5 })).toEqual({
      ok: false,
      reason: 'INVALID',
    });
    expect(evaluateGeoPunch(policy(), [], [], inside)).toEqual({ ok: false, reason: 'NO_AREAS' });
  });
});

describe('parseLatLng', () => {
  it('reads Google Maps and OpenStreetMap links and plain pairs', () => {
    expect(parseLatLng('https://www.google.com/maps/@23.0225,72.5714,17z')).toEqual({
      lat: 23.0225,
      lng: 72.5714,
    });
    expect(parseLatLng('https://maps.google.com/?q=23.2156,72.6369')).toEqual({ lat: 23.2156, lng: 72.6369 });
    expect(parseLatLng('https://www.google.com/maps/place/X/data=!3d23.1!4d72.6')).toEqual({
      lat: 23.1,
      lng: 72.6,
    });
    expect(parseLatLng('https://www.openstreetmap.org/#map=17/22.3072/73.1812')).toEqual({
      lat: 22.3072,
      lng: 73.1812,
    });
    expect(parseLatLng(' 23.02, 72.57 ')).toEqual({ lat: 23.02, lng: 72.57 });
  });
  it('rejects nonsense', () => {
    expect(parseLatLng('Ahmedabad')).toBeNull();
    expect(parseLatLng('95, 200')).toBeNull();
  });
});
