import { redirect } from 'next/navigation';
import { requireUser } from '@/server/current-user';
import { db } from '@/server/db';
import { revokeKioskAction } from '@/server/actions/company';
import { fmtDateTime } from '@/lib/dates';
import { ActionButton } from '@/components/forms';
import { Card, PageHead, Pill, Stack, Table } from '@/components/ui';
import { RegisterKiosk } from './register-kiosk';

export const metadata = { title: 'Office kiosk' };

export default async function KioskAdmin() {
  const user = await requireUser();
  if (!user.permissions.has('settings.manage')) redirect('/');
  const [devices, offices] = await Promise.all([
    db.kioskDevice.findMany({ include: { office: true }, orderBy: { createdAt: 'desc' } }),
    db.office.findMany({ orderBy: { code: 'asc' } }),
  ]);
  return (
    <Stack>
      <PageHead
        title="Office kiosk"
        lead="A reception tablet shows a 6-digit code that changes every 30 seconds. Staff type it on their Punch page to prove they are at the office."
      />
      <Card title="Register a kiosk">
        <RegisterKiosk offices={offices.map((o) => ({ id: o.id, name: o.name }))} />
      </Card>
      <Card title="Devices">
        <Table
          rows={devices.length}
          head={['Name', 'Office', 'Registered', 'Last seen', 'Status', '']}
          empty="No kiosks yet."
        >
          {devices.map((d) => (
            <tr key={d.id}>
              <td>{d.name}</td>
              <td>{d.office.name}</td>
              <td className="whitespace-nowrap">{fmtDateTime(d.createdAt)}</td>
              <td className="whitespace-nowrap">{d.lastSeenAt ? fmtDateTime(d.lastSeenAt) : 'Never'}</td>
              <td>{d.revokedAt ? <Pill tone="bad">Revoked</Pill> : <Pill tone="good">Active</Pill>}</td>
              <td>
                {!d.revokedAt ? (
                  <ActionButton
                    action={revokeKioskAction}
                    fields={{ id: d.id }}
                    label="Revoke"
                    className="btn btn-sm btn-danger"
                    confirm={`Revoke ${d.name}? Its codes stop working at once.`}
                  />
                ) : null}
              </td>
            </tr>
          ))}
        </Table>
        <p className="mt-2 text-[13px] text-muted">
          The kiosk link holds a secret token and is shown only when you register a device. Lost it? Revoke
          the device and register it again.
        </p>
      </Card>
    </Stack>
  );
}
