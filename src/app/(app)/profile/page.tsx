import Link from 'next/link';
import { requireUser } from '@/server/current-user';
import { db } from '@/server/db';
import { faceStatus, FACE_CONSENT_VERSION } from '@/server/services/face';
import { getSetting } from '@/server/settings';
import { fmtDate, fmtDateTime, fromDbDate } from '@/lib/dates';
import { Card, Facts, PageHead, Stack, Two } from '@/components/ui';
import { FaceEnrol } from '@/components/face/face-enrol';

export const metadata = { title: 'My profile' };

const MODE = { OFFICE: 'Office-based', HYBRID: 'Hybrid', REMOTE: 'Remote or field' } as const;

export default async function Profile() {
  const user = await requireUser();
  const [e, face, punch] = await Promise.all([
    db.employee.findUniqueOrThrow({ where: { id: user.id }, include: { manager: true, office: true } }),
    faceStatus(user.id),
    getSetting('punch'),
  ]);
  return (
    <Stack>
      <PageHead title="My profile" lead="Ask HR to change any of these details." />
      <Two>
        <Card title="Details">
          <Facts
            items={[
              [
                'Employee ID',
                <span key="c" className="font-mono">
                  {e.code}
                </span>,
              ],
              ['Name', e.name],
              ['Email', e.email],
              ['Phone', e.phone ?? '—'],
              ['Department', e.dept],
              ['Designation', e.title],
              ['Manager', e.manager?.name ?? '—'],
              ['Joined', fmtDate(fromDbDate(e.joinedOn))],
              ['Work mode', MODE[e.workMode]],
              ['Office', e.office?.name ?? '—'],
              ['Roles', user.roleNames.join(', ')],
            ]}
          />
        </Card>
        <Card title="Face ID for punching">
          {!punch.face ? (
            <p className="text-muted">Face punch is turned off for the company.</p>
          ) : face ? (
            <div className="grid gap-3">
              <p>
                Enrolled with {face.sampleCount} sample(s) on {fmtDateTime(face.consentAt)}. Consent version{' '}
                <span className="font-mono text-[13px]">{face.consentVersion}</span>.
              </p>
              <FaceEnrol consentVersion={FACE_CONSENT_VERSION} enrolled />
            </div>
          ) : (
            <FaceEnrol consentVersion={FACE_CONSENT_VERSION} enrolled={false} />
          )}
        </Card>
      </Two>
      <Card title="Your data">
        <div className="flex flex-wrap items-center gap-3">
          <p className="max-w-[70ch] text-muted">
            Download everything the HRMS holds about you: profile, punches with locations, attendance, leave,
            corrections, claims and consent records.
          </p>
          <a className="btn btn-ghost" href="/api/me/export">
            Download my data (JSON)
          </a>
          <Link href="/privacy">Privacy notice</Link>
        </div>
      </Card>
    </Stack>
  );
}
