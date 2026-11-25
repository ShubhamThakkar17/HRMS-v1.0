// Geofence helpers. The server always recomputes distance; never trust a client-computed value.

export type WorkModeCode = 'OFFICE' | 'HYBRID' | 'REMOTE';

export interface OfficeGeo {
  id: string;
  code: string;
  name: string;
  lat: number;
  lng: number;
  radiusM: number;
}

export interface Reading {
  lat: number;
  lng: number;
  accuracyM: number;
}

export const MAX_ACCURACY_M = 150;

/** Great-circle distance in metres (haversine formula). */
export function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000;
  const toR = Math.PI / 180;
  const dLat = (lat2 - lat1) * toR;
  const dLng = (lng2 - lng1) * toR;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * toR) * Math.cos(lat2 * toR) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.min(1, Math.sqrt(a))));
}

export function nearestOffice(
  offices: OfficeGeo[],
  lat: number,
  lng: number,
): { office: OfficeGeo; distanceM: number } | null {
  let best: { office: OfficeGeo; distanceM: number } | null = null;
  for (const o of offices) {
    const d = haversineM(lat, lng, o.lat, o.lng);
    if (!best || d < best.distanceM) best = { office: o, distanceM: d };
  }
  return best;
}

export function isValidReading(r: Reading): boolean {
  return (
    Number.isFinite(r.lat) &&
    Number.isFinite(r.lng) &&
    Math.abs(r.lat) <= 90 &&
    Math.abs(r.lng) <= 180 &&
    Number.isFinite(r.accuracyM) &&
    r.accuracyM >= 0
  );
}

export type GeoRuleCode = 'ANY_OFFICE' | 'ASSIGNED_OFFICE' | 'OFFICES_AND_ZONES' | 'ZONES_ONLY' | 'ANYWHERE';

export interface ZoneGeo {
  id: string;
  name: string;
  lat: number;
  lng: number;
  radiusM: number;
}

export interface GeoPolicy {
  workMode: WorkModeCode;
  rule: GeoRuleCode;
  /** Refuse the punch outside every allowed area instead of recording and flagging it. */
  strict: boolean;
  assignedOfficeId: string | null;
}

export const GEO_RULE_LABEL: Record<GeoRuleCode, string> = {
  ANY_OFFICE: 'Any office',
  ASSIGNED_OFFICE: 'Their own office only',
  OFFICES_AND_ZONES: 'Any office or their own zones',
  ZONES_ONLY: 'Their own zones only',
  ANYWHERE: 'Anywhere (no geofence)',
};

type Area = { kind: 'office'; office: OfficeGeo } | { kind: 'zone'; zone: ZoneGeo };

/** The areas a policy allows. */
export function allowedAreas(policy: GeoPolicy, offices: OfficeGeo[], zones: ZoneGeo[]): Area[] {
  const officeAreas = (list: OfficeGeo[]): Area[] => list.map((office) => ({ kind: 'office', office }));
  const zoneAreas: Area[] = zones.map((zone) => ({ kind: 'zone', zone }));
  switch (policy.rule) {
    case 'ASSIGNED_OFFICE':
      return officeAreas(offices.filter((o) => o.id === policy.assignedOfficeId));
    case 'OFFICES_AND_ZONES':
      return [...officeAreas(offices), ...zoneAreas];
    case 'ZONES_ONLY':
      return zoneAreas;
    case 'ANYWHERE':
      return [...officeAreas(offices), ...zoneAreas];
    default:
      return officeAreas(offices);
  }
}

function areaGeo(a: Area) {
  return a.kind === 'office' ? a.office : a.zone;
}
function areaName(a: Area) {
  return a.kind === 'office' ? a.office.name : a.zone.name;
}

export type GeoDecision =
  | { ok: false; reason: 'INACCURATE' | 'INVALID' | 'NO_AREAS' }
  | { ok: false; reason: 'OUTSIDE_ALLOWED'; nearestName: string; distanceM: number }
  | {
      ok: true;
      officeId: string | null;
      zoneName: string | null;
      distanceM: number;
      nearestName: string | null;
      insideGeofence: boolean;
      remote: boolean;
      flag: 'OUTSIDE_GEOFENCE' | null;
    };

/**
 * Per-employee geofence rules:
 * - Readings with accuracy worse than 150 m are rejected.
 * - Inside an allowed office or zone: recorded with that office (or zone name) and distance.
 * - Outside every allowed area: refused when the policy is strict; otherwise office-based staff are
 *   recorded with flag OUTSIDE_GEOFENCE, and hybrid or remote staff are recorded as remote.
 * - ANYWHERE never flags or refuses; it still records the nearest office or zone.
 */
export function evaluateGeoPunch(
  policy: GeoPolicy,
  offices: OfficeGeo[],
  zones: ZoneGeo[],
  r: Reading,
): GeoDecision {
  if (!isValidReading(r)) return { ok: false, reason: 'INVALID' };
  if (r.accuracyM > MAX_ACCURACY_M) return { ok: false, reason: 'INACCURATE' };
  const areas = allowedAreas(policy, offices, zones);
  if (!areas.length && policy.rule !== 'ANYWHERE') return { ok: false, reason: 'NO_AREAS' };
  let best: { area: Area; d: number } | null = null;
  for (const a of areas) {
    const g = areaGeo(a);
    const d = haversineM(r.lat, r.lng, g.lat, g.lng);
    const inside = d <= g.radiusM;
    // Prefer an area we are inside; among those (or among none), the closest.
    if (!best) best = { area: a, d };
    else {
      const bestInside = best.d <= areaGeo(best.area).radiusM;
      if ((inside && !bestInside) || (inside === bestInside && d < best.d)) best = { area: a, d };
    }
  }
  if (best && best.d <= areaGeo(best.area).radiusM) {
    return {
      ok: true,
      officeId: best.area.kind === 'office' ? best.area.office.id : null,
      zoneName: best.area.kind === 'zone' ? best.area.zone.name : null,
      distanceM: best.d,
      nearestName: areaName(best.area),
      insideGeofence: true,
      remote: false,
      flag: null,
    };
  }
  const distanceM = best?.d ?? 0;
  const nearestName = best ? areaName(best.area) : null;
  if (policy.rule === 'ANYWHERE') {
    return {
      ok: true,
      officeId: null,
      zoneName: null,
      distanceM,
      nearestName,
      insideGeofence: false,
      remote: true,
      flag: null,
    };
  }
  if (policy.strict)
    return { ok: false, reason: 'OUTSIDE_ALLOWED', nearestName: nearestName ?? 'your area', distanceM };
  const office = policy.workMode === 'OFFICE';
  return {
    ok: true,
    officeId: null,
    zoneName: null,
    distanceM,
    nearestName,
    insideGeofence: false,
    remote: !office,
    flag: office ? 'OUTSIDE_GEOFENCE' : null,
  };
}

/** Pull "lat,lng" out of a Google Maps / OpenStreetMap link or a plain "lat, lng" string. */
export function parseLatLng(input: string): { lat: number; lng: number } | null {
  const s = input.trim();
  const patterns = [
    /@(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/, // google.com/maps/@23.02,72.57,15z
    /[?&](?:q|query|ll|center|destination)=(-?\d+(?:\.\d+)?)(?:,|%2C)\s*(-?\d+(?:\.\d+)?)/i,
    /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/, // place links
    /[#&]map=\d+\/(-?\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)/, // openstreetmap.org/#map=16/23.02/72.57
    /^(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)$/,
  ];
  for (const p of patterns) {
    const m = s.match(p);
    if (m) {
      const lat = Number(m[1]);
      const lng = Number(m[2]);
      if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) return { lat, lng };
    }
  }
  return null;
}

export function fmtDistance(m: number | null | undefined): string {
  if (m == null) return '';
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${m} m`;
}
