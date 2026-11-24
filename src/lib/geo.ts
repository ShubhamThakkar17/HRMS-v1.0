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

export type GeoDecision =
  | { ok: false; reason: 'INACCURATE' | 'INVALID' | 'NO_OFFICES' }
  | {
      ok: true;
      officeId: string | null;
      distanceM: number;
      nearestOfficeId: string;
      insideGeofence: boolean;
      remote: boolean;
      flag: 'OUTSIDE_GEOFENCE' | null;
    };

/**
 * Work-mode rules (Phase 4):
 * - Office staff outside every geofence are recorded with flag OUTSIDE_GEOFENCE.
 * - Hybrid and Remote staff outside a geofence are recorded as Remote (no flag).
 * - Readings with accuracy worse than 150 m are rejected.
 */
export function evaluateGeoPunch(workMode: WorkModeCode, offices: OfficeGeo[], r: Reading): GeoDecision {
  if (!isValidReading(r)) return { ok: false, reason: 'INVALID' };
  if (r.accuracyM > MAX_ACCURACY_M) return { ok: false, reason: 'INACCURATE' };
  const near = nearestOffice(offices, r.lat, r.lng);
  if (!near) return { ok: false, reason: 'NO_OFFICES' };
  const inside = near.distanceM <= near.office.radiusM;
  if (inside) {
    return {
      ok: true,
      officeId: near.office.id,
      distanceM: near.distanceM,
      nearestOfficeId: near.office.id,
      insideGeofence: true,
      remote: false,
      flag: null,
    };
  }
  return {
    ok: true,
    officeId: null,
    distanceM: near.distanceM,
    nearestOfficeId: near.office.id,
    insideGeofence: false,
    remote: workMode !== 'OFFICE',
    flag: workMode === 'OFFICE' ? 'OUTSIDE_GEOFENCE' : null,
  };
}

export function fmtDistance(m: number | null | undefined): string {
  if (m == null) return '';
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${m} m`;
}
