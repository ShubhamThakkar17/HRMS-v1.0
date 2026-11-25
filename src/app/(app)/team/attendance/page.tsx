import { redirect } from 'next/navigation';
import { requireUser } from '@/server/current-user';
import { db } from '@/server/db';
import { attendanceForMany } from '@/server/services/attendance';
import { businessDate, fmtMonth, isValidMonth, monthRange } from '@/lib/dates';
import { AttendanceGrid } from '@/components/attendance-grid';
import { Card, MonthNav, PageHead, Stack } from '@/components/ui';

export const metadata = { title: 'Team attendance' };

export default async function TeamAttendance({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const user = await requireUser();
  if (!user.permissions.has('team.view')) redirect('/');
  const sp = await searchParams;
  const ym = sp.month && isValidMonth(sp.month) ? sp.month : businessDate().slice(0, 7);
  const team = await db.employee.findMany({
    where: { managerId: user.id, status: 'ACTIVE' },
    orderBy: { name: 'asc' },
  });
  const { from, to } = monthRange(ym);
  const byId = await attendanceForMany(team, from, to);
  const rows = team.map((t) => ({ id: t.id, name: t.name, days: byId.get(t.id)! }));
  return (
    <Stack>
      <PageHead
        title="Team attendance"
        lead="Each cell is one day. Hover a cell for details."
        actions={<MonthNav ym={ym} label={fmtMonth(ym)} base="/team/attendance" />}
      />
      <Card>
        <AttendanceGrid ym={ym} rows={rows} />
      </Card>
    </Stack>
  );
}
