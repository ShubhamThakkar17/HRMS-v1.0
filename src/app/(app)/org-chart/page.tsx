import { requireUser } from '@/server/current-user';
import { db } from '@/server/db';
import { Card, PageHead, Stack } from '@/components/ui';

export const metadata = { title: 'Org chart' };

type Node = { id: string; name: string; title: string; dept: string; managerId: string | null };

function Tree({ nodes, parent, depth = 0 }: { nodes: Node[]; parent: string | null; depth?: number }) {
  const kids = nodes.filter((n) => n.managerId === parent);
  if (!kids.length || depth > 20) return null;
  return (
    <ul className={depth ? 'ml-5 border-l-2 border-line pl-5' : ''}>
      {kids.map((k) => (
        <li key={k.id} className="relative my-2">
          {depth ? <span className="absolute top-5 -left-5 w-4 border-t-2 border-line" aria-hidden /> : null}
          <div className="inline-grid rounded-lg border border-line bg-white px-3 py-1.5">
            <strong>{k.name}</strong>
            <span className="text-[13px] text-muted">
              {k.title} · {k.dept}
            </span>
          </div>
          <Tree nodes={nodes} parent={k.id} depth={depth + 1} />
        </li>
      ))}
    </ul>
  );
}

export default async function OrgChart() {
  await requireUser();
  const nodes = await db.employee.findMany({
    where: { status: 'ACTIVE' },
    select: { id: true, name: true, title: true, dept: true, managerId: true },
    orderBy: { name: 'asc' },
  });
  const ids = new Set(nodes.map((n) => n.id));
  // People whose manager is inactive or missing appear at the top level.
  const fixed = nodes.map((n) => ({
    ...n,
    managerId: n.managerId && ids.has(n.managerId) ? n.managerId : null,
  }));
  return (
    <Stack>
      <PageHead title="Org chart" lead="Built from each person’s manager." />
      <Card>
        <div className="overflow-x-auto">
          <Tree nodes={fixed} parent={null} />
        </div>
      </Card>
    </Stack>
  );
}
