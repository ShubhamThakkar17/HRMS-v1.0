'use client';
import { useActionState, useState } from 'react';
import { Crosshair, MapPin, Plus } from 'lucide-react';
import { addZoneAction, geoPolicyAction, removeZoneAction } from '@/server/actions/geofence';
import { GEO_RULE_LABEL, fmtDistance, parseLatLng, type GeoRuleCode } from '@/lib/geo';
import { ActionButton, Status, Submit } from './forms';

const RULE_HELP: Record<GeoRuleCode, string> = {
  ANY_OFFICE: 'Inside any office geofence.',
  ASSIGNED_OFFICE: 'Only inside their own office.',
  OFFICES_AND_ZONES: 'Any office, or one of the zones below (client sites, a home office).',
  ZONES_ONLY: 'Only the zones below. Good for field staff with a fixed territory.',
  ANYWHERE: 'No geofence. Location is still recorded with every punch.',
};

function mapSrc(lat: number, lng: number, radiusM: number) {
  const d = Math.max(0.004, (radiusM / 111_000) * 2.2);
  return `https://www.openstreetmap.org/export/embed.html?bbox=${lng - d},${lat - d},${lng + d},${lat + d}&layer=mapnik&marker=${lat},${lng}`;
}

export function GeofenceEditor({
  employeeId,
  rule,
  strict,
  zones,
  workMode,
  canEdit,
}: {
  employeeId: string;
  rule: GeoRuleCode;
  strict: boolean;
  zones: { id: string; name: string; lat: number; lng: number; radiusM: number }[];
  workMode: string;
  canEdit: boolean;
}) {
  const [policyState, policyAction] = useActionState(geoPolicyAction, null);
  const [zoneState, zoneAction] = useActionState(addZoneAction, null);
  const [where, setWhere] = useState('');
  const [radius, setRadius] = useState(150);
  const [locMsg, setLocMsg] = useState('');
  const [selRule, setSelRule] = useState<GeoRuleCode>(rule);
  const preview = parseLatLng(where);

  const useMine = () => {
    setLocMsg('Getting your location…');
    navigator.geolocation?.getCurrentPosition(
      (p) => {
        setWhere(`${p.coords.latitude.toFixed(6)}, ${p.coords.longitude.toFixed(6)}`);
        setLocMsg(`Got it, ±${Math.round(p.coords.accuracy)} m.`);
      },
      () => setLocMsg('Location was refused or unavailable.'),
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  };

  return (
    <div className="grid gap-5">
      <form action={policyAction} className="grid gap-3">
        <input type="hidden" name="employeeId" value={employeeId} />
        <div className="grid gap-2 sm:grid-cols-2">
          {(Object.keys(GEO_RULE_LABEL) as GeoRuleCode[]).map((r) => (
            <label
              key={r}
              className={`flex cursor-pointer gap-3 rounded-xl border p-3 text-sm transition-colors ${selRule === r ? 'border-brand bg-brand-soft' : 'border-line hover:border-brand/40'} ${canEdit ? '' : 'pointer-events-none opacity-80'}`}
            >
              <input
                type="radio"
                name="rule"
                value={r}
                checked={selRule === r}
                onChange={() => setSelRule(r)}
                className="mt-0.5"
                disabled={!canEdit}
              />
              <span>
                <span className="font-semibold">{GEO_RULE_LABEL[r]}</span>
                <span className="block text-[13px] text-muted">{RULE_HELP[r]}</span>
              </span>
            </label>
          ))}
        </div>
        <label className="flex items-start gap-2.5 text-sm">
          <input
            type="checkbox"
            name="strict"
            defaultChecked={strict}
            className="mt-0.5"
            disabled={!canEdit || selRule === 'ANYWHERE'}
          />
          <span>
            <b>Block punches outside these areas</b>
            <span className="block text-[13px] text-muted">
              Off: punches outside are still saved,{' '}
              {workMode === 'OFFICE' ? 'and flagged for the manager' : 'and marked remote'}. On: they are
              refused.
            </span>
          </span>
        </label>
        {canEdit ? (
          <div className="flex items-center gap-3">
            <Submit>Save punch area</Submit>
            <Status state={policyState} />
          </div>
        ) : null}
      </form>

      <div className="grid gap-3">
        <div className="eyebrow">Custom zones ({zones.length})</div>
        {zones.length ? (
          <div className="grid gap-3 md:grid-cols-2">
            {zones.map((z) => (
              <div key={z.id} className="overflow-hidden rounded-2xl border border-line">
                <iframe
                  title={`Map of ${z.name}`}
                  src={mapSrc(z.lat, z.lng, z.radiusM)}
                  className="h-36 w-full"
                  loading="lazy"
                />
                <div className="flex items-center justify-between gap-2 p-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">{z.name}</div>
                    <div className="text-xs text-muted">
                      {z.lat.toFixed(5)}, {z.lng.toFixed(5)} · {fmtDistance(z.radiusM)} radius
                    </div>
                  </div>
                  {canEdit ? (
                    <ActionButton
                      action={removeZoneAction}
                      fields={{ id: z.id }}
                      label="Remove"
                      className="btn btn-sm btn-ghost"
                      confirm={`Remove ${z.name}?`}
                    />
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted">
            No custom zones. Add one for a client site, a home office or a field area.
          </p>
        )}
      </div>

      {canEdit ? (
        <form action={zoneAction} className="grid gap-3 rounded-2xl border border-dashed border-line p-4">
          <input type="hidden" name="employeeId" value={employeeId} />
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Plus className="size-4" /> Add a zone
          </div>
          <div className="grid gap-3 md:grid-cols-[1fr_1.4fr]">
            <label className="field">
              Name
              <input name="name" placeholder="Client site, Gandhinagar" required />
            </label>
            <label className="field">
              Google Maps link, or latitude, longitude
              <div className="flex gap-2">
                <input
                  name="where"
                  value={where}
                  onChange={(e) => setWhere(e.target.value)}
                  placeholder="https://maps.google.com/?q=23.2156,72.6369"
                  required
                />
                <button
                  type="button"
                  className="btn btn-ghost !px-3"
                  onClick={useMine}
                  title="Use my current location"
                >
                  <Crosshair className="size-4" />
                </button>
              </div>
            </label>
          </div>
          <label className="field">
            Radius: {fmtDistance(radius)}
            <input
              type="range"
              name="radiusM"
              min={50}
              max={3000}
              step={50}
              value={radius}
              onChange={(e) => setRadius(Number(e.target.value))}
              className="accent-[var(--brand)]"
            />
          </label>
          {locMsg ? <p className="text-xs text-muted">{locMsg}</p> : null}
          {preview ? (
            <div className="anim-fade overflow-hidden rounded-xl border border-line">
              <iframe
                title="Zone preview"
                src={mapSrc(preview.lat, preview.lng, radius)}
                className="h-44 w-full"
                loading="lazy"
              />
              <div className="flex items-center gap-1.5 p-2 text-xs text-muted">
                <MapPin className="size-3.5" /> {preview.lat.toFixed(5)}, {preview.lng.toFixed(5)}
              </div>
            </div>
          ) : where ? (
            <p className="text-xs text-bad">Could not read a location from that yet.</p>
          ) : null}
          <div className="flex items-center gap-3">
            <Submit>Add zone</Submit>
            <Status state={zoneState} />
          </div>
          <p className="text-xs text-muted">
            In Google Maps, long-press a spot and copy the coordinates, or open “Share” and paste the link.
            Short links (maps.app.goo.gl) do not contain coordinates.
          </p>
        </form>
      ) : null}
    </div>
  );
}
