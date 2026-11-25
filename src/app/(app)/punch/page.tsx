import { Clock3, LogIn, LogOut, MapPinned } from 'lucide-react';
import { requireUser } from '@/server/current-user';
import { db } from '@/server/db';
import { attendanceRange } from '@/server/services/attendance';
import { faceStatus } from '@/server/services/face';
import { getSetting } from '@/server/settings';
import { businessDate, fmtDate, fmtWeekday, istTime } from '@/lib/dates';
import { METHOD_LABEL } from '@/lib/attendance-rules';
import { GEO_RULE_LABEL, allowedAreas, fmtDistance } from '@/lib/geo';
import { whereLabel } from '@/components/attendance-table';
import { Card, DayPill, PageHead, Stack, Two } from '@/components/ui';
import { Elapsed, LiveClock } from '@/components/clock';
import { PunchPanel } from './punch-panel';

export const metadata = { title: 'Punch in and out' };

export default async function PunchPage() {
  const user = await requireUser();
  const today = businessDate();
  const [[day], settings, face, consent, offices, me] = await Promise.all([
    attendanceRange(user.id, today, today),
    getSetting('punch'),
    faceStatus(user.id),
    db.consentRecord.findFirst({ where: { employeeId: user.id, kind: 'LOCATION', withdrawnAt: null } }),
    db.office.findMany({ orderBy: { code: 'asc' } }),
    db.employee.findUniqueOrThrow({
      where: { id: user.id },
      select: { geoRule: true, geoStrict: true, zones: true },
    }),
  ]);
  const home = offices.find((o) => o.id === user.officeId);
  const officeNames = new Map(offices.map((o) => [o.id, o.name.split(',')[0]!]));
  const phase = !day!.firstIn ? 'in' : !day!.lastOut ? 'out' : 'done';
  const areas = allowedAreas(
    { workMode: user.workMode, rule: me.geoRule, strict: me.geoStrict, assignedOfficeId: user.officeId },
    offices,
    me.zones,
  );
  const outsideText =
    me.geoRule === 'ANYWHERE'
      ? 'You can punch from anywhere; your location is recorded.'
      : me.geoStrict
        ? 'Punches outside these areas are refused.'
        : user.workMode === 'OFFICE'
          ? 'Punches outside these areas are allowed but flagged for your manager.'
          : 'Punches outside these areas are recorded as remote.';
  return (
    <Stack>
      <PageHead
        eyebrow={`${fmtWeekday(today)}, ${fmtDate(today)}`}
        title={phase === 'done' ? 'All done for today' : phase === 'out' ? 'Ready to check out?' : 'Check in'}
        actions={
          <div className="text-right">
            <div className="text-3xl font-semibold tracking-tight">
              <LiveClock seconds />
            </div>
            <div className="text-xs text-muted">India Standard Time</div>
          </div>
        }
      />
      <Two wide>
        {phase === 'done' ? (
          <Card>
            <p className="text-muted">
              You have checked in and out today. If a time is wrong, ask for a correction from My attendance.
            </p>
          </Card>
        ) : (
          <PunchPanel
            key={phase}
            verb={phase === 'in' ? 'Check in' : 'Check out'}
            methods={{
              face: settings.face && home?.faceEnabled !== false,
              geo: settings.geo && home?.geoEnabled !== false,
              kiosk: settings.kiosk,
              web: settings.web,
            }}
            faceEnrolled={!!face}
            locationConsented={!!consent}
            ruleLabel={GEO_RULE_LABEL[me.geoRule]}
          />
        )}
        <div className="grid content-start gap-5">
          <Card title="Today" icon={<Clock3 />} extra={<DayPill status={day!.status} />}>
            <ol className="relative grid gap-4 border-l-2 border-line pl-5">
              <li className="relative">
                <span
                  className={`absolute top-0.5 -left-[29px] grid size-6 place-items-center rounded-full ${day!.firstIn ? 'bg-good text-white' : 'bg-soft text-faint'}`}
                >
                  <LogIn className="size-3.5" />
                </span>
                <div className="text-sm font-semibold">
                  {day!.firstIn ? `Checked in at ${istTime(day!.firstIn)}` : 'Not checked in yet'}
                </div>
                {day!.firstIn ? (
                  <div className="text-[13px] text-muted">
                    {METHOD_LABEL[day!.inMethod ?? '']} · {whereLabel(day!, officeNames) ?? '—'}
                  </div>
                ) : null}
              </li>
              <li className="relative">
                <span
                  className={`absolute top-0.5 -left-[29px] grid size-6 place-items-center rounded-full ${day!.lastOut ? 'bg-good text-white' : 'bg-soft text-faint'}`}
                >
                  <LogOut className="size-3.5" />
                </span>
                <div className="text-sm font-semibold">
                  {day!.lastOut
                    ? `Checked out at ${istTime(day!.lastOut)} · ${day!.hours} h`
                    : day!.firstIn
                      ? 'Working now'
                      : 'Check out later'}
                </div>
                {day!.firstIn && !day!.lastOut ? (
                  <div className="text-[13px] text-muted">
                    <Elapsed since={day!.firstIn.toISOString()} /> so far
                  </div>
                ) : null}
              </li>
            </ol>
          </Card>
          <Card title="Where you can punch" icon={<MapPinned />} sub={GEO_RULE_LABEL[me.geoRule]}>
            <ul className="grid gap-2 text-sm">
              {areas.map((a) => {
                const g = a.kind === 'office' ? a.office : a.zone;
                return (
                  <li key={`${a.kind}-${g.id}`} className="flex items-center justify-between gap-3">
                    <a
                      href={`https://www.openstreetmap.org/?mlat=${g.lat}&mlon=${g.lng}#map=17/${g.lat}/${g.lng}`}
                      target="_blank"
                      rel="noopener"
                      className="truncate"
                    >
                      {a.kind === 'office' ? a.office.name : a.zone.name}
                    </a>
                    <span className="chip shrink-0 bg-soft text-muted">{fmtDistance(g.radiusM)} radius</span>
                  </li>
                );
              })}
              {!areas.length ? <li className="text-muted">No fixed area.</li> : null}
            </ul>
            <p className="mt-3 text-xs text-muted">{outsideText}</p>
          </Card>
        </div>
      </Two>
    </Stack>
  );
}
