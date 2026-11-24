import { requireUser } from '@/server/current-user';
import { db } from '@/server/db';
import { statusOn } from '@/server/services/attendance';
import { businessDate } from '@/lib/dates';
import { Avatar, Card, DayPill, PageHead, Stack } from '@/components/ui';

export const metadata = { title: 'Directory' };

export default async function Directory({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; dept?: string }>;
}) {
  await requireUser();
  const { q = '', dept = '' } = await searchParams;
  const all = await db.employee.findMany({
    where: { status: 'ACTIVE' },
    orderBy: { name: 'asc' },
    include: { office: true },
  });
  const depts = [...new Set(all.map((e) => e.dept))].sort();
  const needle = q.trim().toLowerCase();
  const people = all.filter(
    (e) =>
      (!dept || e.dept === dept) &&
      (!needle || `${e.name} ${e.title} ${e.dept} ${e.email}`.toLowerCase().includes(needle)),
  );
  const status = await statusOn(
    people.map((p) => p.id),
    businessDate(),
  );
  return (
    <Stack>
      <PageHead title="Directory" lead={`${all.length} active people. Today’s status shows who is in.`} />
      <form className="flex flex-wrap items-end gap-3">
        <label className="field min-w-52 flex-1">
          Search
          <input name="q" defaultValue={q} placeholder="Name, role or department" />
        </label>
        <label className="field">
          Department
          <select name="dept" defaultValue={dept}>
            <option value="">All departments</option>
            {depts.map((d) => (
              <option key={d}>{d}</option>
            ))}
          </select>
        </label>
        <button className="btn" type="submit">
          Filter
        </button>
      </form>
      <Card>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-3">
          {people.map((p) => {
            const s = status.get(p.id);
            return (
              <div key={p.id} className="flex min-w-0 gap-3 rounded-lg border border-line p-3">
                <Avatar name={p.name} />
                <div className="min-w-0 [overflow-wrap:anywhere]">
                  <strong>{p.name}</strong>
                  <div className="text-[13px] text-muted">
                    {p.title} · {p.dept}
                  </div>
                  <div className="text-[13px]">
                    <a href={`mailto:${p.email}`}>{p.email}</a>
                  </div>
                  {p.phone ? <div className="text-[13px] text-muted">{p.phone}</div> : null}
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    {s ? <DayPill status={s.status} /> : null}
                    {s?.row?.remote ? <span className="text-xs text-muted">Remote</span> : null}
                    <span className="text-xs text-muted">{p.office?.name.split(',')[0]}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        {!people.length ? <p className="text-muted">No one matches.</p> : null}
      </Card>
    </Stack>
  );
}
