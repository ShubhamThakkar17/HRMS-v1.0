import { requireUser } from '@/server/current-user';
import { approvalsCount } from '@/server/services/approvals';
import { navFor, canSeeApprovals, sortRoles } from '@/lib/permissions';
import { Sidebar } from '@/components/sidebar';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const nav = navFor(user.permissions);
  const badge = canSeeApprovals(user.permissions) ? await approvalsCount(user) : 0;
  return (
    <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[248px_minmax(0,1fr)]">
      <Sidebar
        nav={nav}
        badge={badge}
        user={{
          name: user.name,
          title: user.title,
          code: user.code,
          activeRole: user.activeRole,
          roles: sortRoles(user.roleNames.map((name) => ({ name }))).map((r) => r.name),
        }}
      />
      <main id="main" tabIndex={-1} className="min-w-0 px-4 pt-5 pb-14 outline-none lg:px-7.5 lg:pt-6.5">
        {children}
      </main>
    </div>
  );
}
