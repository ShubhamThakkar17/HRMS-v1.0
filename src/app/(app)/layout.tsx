import { requireUser } from '@/server/current-user';
import { approvalsCount } from '@/server/services/approvals';
import { navFor, canSeeApprovals, sortRoles } from '@/lib/permissions';
import { Suspense } from 'react';
import { Sidebar } from '@/components/sidebar';
import { NavProgress } from '@/components/nav-progress';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const nav = navFor(user.permissions);
  const badge = canSeeApprovals(user.permissions) ? await approvalsCount(user) : 0;
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[256px_minmax(0,1fr)]">
      <Suspense fallback={null}>
        <NavProgress />
      </Suspense>
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
      <main
        id="main"
        tabIndex={-1}
        className="mx-auto w-full max-w-[1240px] min-w-0 px-4 pt-5 pb-28 outline-none md:px-6 lg:px-9 lg:pt-8 lg:pb-14"
      >
        {children}
      </main>
    </div>
  );
}
