import { redirect } from 'next/navigation';
import { requireUser } from '@/server/current-user';
import { db } from '@/server/db';
import { getSetting, getShift } from '@/server/settings';
import { officeAction, punchSettingsAction, shiftAction } from '@/server/actions/company';
import { ActionForm, Submit } from '@/components/forms';
import { Card, PageHead, Stack, Two } from '@/components/ui';

export const metadata = { title: 'Settings' };

function mapUrl(lat: number, lng: number) {
  const d = 0.006;
  return `https://www.openstreetmap.org/export/embed.html?bbox=${lng - d},${lat - d},${lng + d},${lat + d}&layer=mapnik&marker=${lat},${lng}`;
}

function OfficeForm({
  o,
}: {
  o?: {
    id: string;
    code: string;
    name: string;
    lat: number;
    lng: number;
    radiusM: number;
    faceEnabled: boolean;
    geoEnabled: boolean;
  };
}) {
  return (
    <ActionForm
      action={officeAction}
      reset={!o}
      className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] items-end gap-3"
    >
      {o ? <input type="hidden" name="id" value={o.id} /> : null}
      <label className="field">
        Code
        <input name="code" defaultValue={o?.code} required maxLength={10} />
      </label>
      <label className="field col-span-2">
        Name
        <input name="name" defaultValue={o?.name} required />
      </label>
      <label className="field">
        Latitude
        <input name="lat" type="number" step="0.000001" defaultValue={o?.lat} required />
      </label>
      <label className="field">
        Longitude
        <input name="lng" type="number" step="0.000001" defaultValue={o?.lng} required />
      </label>
      <label className="field">
        Radius (m)
        <input name="radiusM" type="number" min={50} max={5000} defaultValue={o?.radiusM ?? 200} required />
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="geoEnabled" defaultChecked={o?.geoEnabled ?? true} /> GPS punch
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="faceEnabled" defaultChecked={o?.faceEnabled ?? true} /> Face punch
      </label>
      <div>
        <Submit>{o ? 'Save office' : 'Add office'}</Submit>
      </div>
    </ActionForm>
  );
}

export default async function Settings() {
  const user = await requireUser();
  if (!user.permissions.has('settings.manage')) redirect('/');
  const [offices, shift, punch, retention] = await Promise.all([
    db.office.findMany({ orderBy: { code: 'asc' } }),
    getShift(),
    getSetting('punch'),
    getSetting('retention'),
  ]);
  return (
    <Stack>
      <PageHead
        title="Settings"
        lead="Offices and geofences, shift timings, punch methods and data retention."
      />
      <Two>
        <Card title="Shift">
          <ActionForm action={shiftAction} reset={false} className="grid grid-cols-2 gap-3">
            <label className="field">
              Start
              <input type="time" name="start" defaultValue={shift.start} required />
            </label>
            <label className="field">
              End
              <input type="time" name="end" defaultValue={shift.end} required />
            </label>
            <label className="field">
              Late after
              <input type="time" name="lateAfter" defaultValue={shift.lateAfter} required />
            </label>
            <label className="field">
              Short day under (hours)
              <input
                type="number"
                step="0.5"
                min={1}
                max={12}
                name="shortDayHours"
                defaultValue={shift.shortDayHours}
                required
              />
            </label>
            <div className="col-span-2">
              <Submit>Save shift</Submit>
            </div>
          </ActionForm>
        </Card>
        <Card title="Punch methods and privacy">
          <ActionForm action={punchSettingsAction} reset={false} className="grid gap-3">
            <div className="flex flex-wrap gap-x-4.5 gap-y-2">
              {(['face', 'geo', 'kiosk', 'web'] as const).map((k) => (
                <label key={k} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name={k} defaultChecked={punch[k]} />{' '}
                  {
                    {
                      face: 'Face ID',
                      geo: 'GPS location',
                      kiosk: 'Office kiosk code',
                      web: 'Quick web punch',
                    }[k]
                  }
                </label>
              ))}
            </div>
            <label className="field">
              Face match threshold (lower is stricter; default 0.5)
              <input
                type="number"
                name="faceThreshold"
                step="0.01"
                min={0.2}
                max={0.8}
                defaultValue={punch.faceThreshold}
              />
            </label>
            <label className="field">
              Delete precise punch coordinates after (days)
              <input type="number" name="coordsDays" min={7} max={3650} defaultValue={retention.coordsDays} />
            </label>
            <div>
              <Submit>Save</Submit>
            </div>
          </ActionForm>
        </Card>
      </Two>
      {offices.map((o) => (
        <Card key={o.id} title={o.name}>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
            <OfficeForm o={o} />
            <iframe
              title={`Map of ${o.name}`}
              src={mapUrl(o.lat, o.lng)}
              className="h-52 w-full rounded-lg border border-line"
              loading="lazy"
            />
          </div>
        </Card>
      ))}
      <Card title="Add an office">
        <OfficeForm />
      </Card>
    </Stack>
  );
}
