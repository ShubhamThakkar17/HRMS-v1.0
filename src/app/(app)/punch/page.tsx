import { requireUser } from '@/server/current-user';
import { db } from '@/server/db';
import { attendanceRange } from '@/server/services/attendance';
import { faceStatus } from '@/server/services/face';
import { getSetting } from '@/server/settings';
import { businessDate, fmtDate, istTime } from '@/lib/dates';
import { METHOD_LABEL } from '@/lib/attendance-rules';
import { whereLabel } from '@/components/attendance-table';
import { Card, DayPill, Facts, PageHead, Stack } from '@/components/ui';
import { PunchPanel } from './punch-panel';

export const metadata = { title: 'Punch in and out' };

export default async function PunchPage() {
  const user = await requireUser();
  const today = businessDate();
  const [[day], settings, face, consent, offices] = await Promise.all([
    attendanceRange(user.id, today, today),
    getSetting('punch'),
    faceStatus(user.id),
    db.consentRecord.findFirst({ where: { employeeId: user.id, kind: 'LOCATION', withdrawnAt: null } }),
    db.office.findMany(),
  ]);
  const home = offices.find((o) => o.id === user.officeId);
  const officeNames = new Map(offices.map((o) => [o.id, o.name.split(',')[0]!]));
  const phase = !day?.firstIn ? 'in' : !day.lastOut ? 'out' : 'done';
  const rule =
    user.workMode === 'OFFICE'
      ? `Office-based: location punches must be inside ${home?.name ?? 'your office'} (${home?.radiusM ?? 200} m). Punches outside are flagged for your manager.`
      : user.workMode === 'HYBRID'
        ? 'Hybrid: punch from the office or remotely. Remote punches are tagged as remote.'
        : 'Remote or field: punch from anywhere. Your location is recorded with each punch.';
  return (
    <Stack>
      <PageHead title="Punch in and out" lead={`${fmtDate(today)} · ${rule}`} />
      <Card title="Today" extra={day ? <DayPill status={day.status} /> : null}>
        {day?.firstIn ? (
          <Facts
            items={[
              [
                'In',
                <span key="i">
                  <span className="font-mono">{istTime(day.firstIn)}</span> ·{' '}
                  {METHOD_LABEL[day.inMethod ?? '']}
                </span>,
              ],
              ['Where', whereLabel(day, officeNames) ?? '—'],
              ...(day.lastOut
                ? ([
                    [
                      'Out',
                      <span key="o">
                        <span className="font-mono">{istTime(day.lastOut)}</span> · {day.hours} hours
                      </span>,
                    ],
                  ] as [string, React.ReactNode][])
                : []),
            ]}
          />
        ) : (
          <p className="text-muted">Not checked in yet today.</p>
        )}
      </Card>
      {phase === 'done' ? (
        <Card>
          <p>
            You have checked in and out today. If a time is wrong, ask for a correction from My attendance.
          </p>
        </Card>
      ) : (
        <PunchPanel
          verb={phase === 'in' ? 'Check in' : 'Check out'}
          methods={{
            face: settings.face && home?.faceEnabled !== false,
            geo: settings.geo && home?.geoEnabled !== false,
            kiosk: settings.kiosk,
            web: settings.web,
          }}
          faceEnrolled={!!face}
          locationConsented={!!consent}
        />
      )}
    </Stack>
  );
}
