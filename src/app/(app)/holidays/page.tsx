import { requireUser } from '@/server/current-user';
import { db } from '@/server/db';
import { addHolidayAction, removeHolidayAction } from '@/server/actions/company';
import { businessDate, fmtDate, fmtWeekday, fromDbDate, toDbDate } from '@/lib/dates';
import { ActionButton, ActionForm, Submit } from '@/components/forms';
import { Card, PageHead, Stack, Table } from '@/components/ui';

export const metadata = { title: 'Holidays' };

export default async function Holidays() {
  const user = await requireUser();
  const year = Number(businessDate().slice(0, 4));
  const [holidays, offices] = await Promise.all([
    db.holiday.findMany({
      where: { date: { gte: toDbDate(`${year - 1}-01-01`) } },
      orderBy: { date: 'asc' },
      include: { office: true },
    }),
    db.office.findMany({ orderBy: { code: 'asc' } }),
  ]);
  const manage = user.permissions.has('holidays.manage');
  const today = businessDate();
  return (
    <Stack>
      <PageHead
        title="Holidays"
        lead="Company holidays apply to everyone; office holidays apply only to that office."
      />
      {manage ? (
        <Card title="Add a holiday">
          <ActionForm
            action={addHolidayAction}
            className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] items-end gap-3.5"
          >
            <label className="field">
              Date
              <input type="date" name="date" required />
            </label>
            <label className="field">
              Name
              <input name="name" required />
            </label>
            <label className="field">
              Applies to
              <select name="officeId" defaultValue="">
                <option value="">All offices</option>
                {offices.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </label>
            <div>
              <Submit>Add holiday</Submit>
            </div>
          </ActionForm>
        </Card>
      ) : null}
      <Card>
        <Table
          rows={holidays.length}
          head={['Date', 'Day', 'Holiday', 'Applies to', ...(manage ? [''] : [])]}
          empty="No holidays set."
        >
          {holidays.map((h) => {
            const d = fromDbDate(h.date);
            return (
              <tr key={h.id} className={d < today ? 'text-muted' : ''}>
                <td className="whitespace-nowrap">{fmtDate(d)}</td>
                <td>{fmtWeekday(d)}</td>
                <td>{h.name}</td>
                <td>{h.office?.name ?? 'All offices'}</td>
                {manage ? (
                  <td>
                    <ActionButton
                      action={removeHolidayAction}
                      fields={{ id: h.id }}
                      label="Remove"
                      className="btn btn-sm btn-ghost"
                      confirm={`Remove ${h.name}?`}
                    />
                  </td>
                ) : null}
              </tr>
            );
          })}
        </Table>
      </Card>
    </Stack>
  );
}
