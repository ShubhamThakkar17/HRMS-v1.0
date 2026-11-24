'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { signOutAction, switchRoleAction } from '@/server/actions/auth';
import type { NavItem } from '@/lib/permissions';

export function Sidebar({
  nav,
  badge,
  user,
}: {
  nav: { group: string; items: NavItem[] }[];
  badge: number;
  user: { name: string; title: string; code: string; activeRole: string; roles: string[] };
}) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  // Highlight only the most specific matching item (so /team/attendance does not also light up /team).
  const matches = nav
    .flatMap((g) => g.items.map((i) => i.href))
    .filter((h) => (h === '/' ? path === '/' : path === h || path.startsWith(h + '/')));
  const current = matches.sort((a, b) => b.length - a.length)[0];
  const isOn = (href: string) => href === current;
  return (
    <aside className="flex flex-col gap-2.5 bg-brand px-3 py-3.5 text-white lg:sticky lg:top-0 lg:h-screen lg:overflow-y-auto lg:py-5">
      <div className="flex items-center justify-between border-b border-white/20 px-1.5 pb-3">
        <div>
          <div className="text-[15px] font-bold tracking-[0.18em]">SILVER TOUCH</div>
          <div className="mt-0.5 text-[13px] opacity-85">HRMS</div>
        </div>
        <button
          className="btn btn-sm border-white/45 bg-transparent lg:hidden"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          aria-controls="nav"
        >
          {open ? 'Close' : 'Menu'}
        </button>
      </div>
      <nav id="nav" aria-label="Main sections" className={`${open ? 'grid' : 'hidden'} gap-2.5 lg:grid`}>
        {nav.map((g) => (
          <div key={g.group}>
            <div className="px-2.5 pb-1 text-[11px] tracking-[0.08em] uppercase opacity-65">{g.group}</div>
            {g.items.map((it) => (
              <Link
                key={it.href}
                href={it.href}
                onClick={() => setOpen(false)}
                aria-current={isOn(it.href) ? 'page' : undefined}
                className={`flex items-center justify-between rounded-lg px-2.5 py-1.5 text-sm no-underline ${isOn(it.href) ? 'bg-white/16 text-white shadow-[inset_3px_0_0_var(--accent)]' : 'text-[#dde9e4] hover:bg-white/8'}`}
              >
                {it.label}
                {it.href === '/approvals' && badge > 0 ? (
                  <span
                    className="rounded-full bg-badge px-1.5 text-[11px] font-bold text-[#2a2108]"
                    aria-label={`${badge} waiting`}
                  >
                    {badge}
                  </span>
                ) : null}
              </Link>
            ))}
          </div>
        ))}
      </nav>
      <div
        className={`${open ? 'grid' : 'hidden'} mt-auto gap-1 border-t border-white/20 px-1.5 pt-3 text-[13px] lg:grid`}
      >
        <strong>{user.name}</strong>
        <span className="opacity-75">
          {user.title} · {user.code}
        </span>
        {user.roles.length > 1 ? (
          <form action={switchRoleAction} className="mt-1.5 grid gap-1 text-xs text-[#dde9e4]">
            <label htmlFor="role-switch">Viewing as</label>
            <select
              id="role-switch"
              name="role"
              defaultValue={user.activeRole}
              onChange={(e) => e.currentTarget.form?.requestSubmit()}
              className="!border-white/35 !bg-white/10 !px-2 !py-1.5 !text-white [&>option]:text-ink"
            >
              {user.roles.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            <noscript>
              <button className="btn btn-sm" type="submit">
                Switch
              </button>
            </noscript>
          </form>
        ) : (
          <span className="opacity-75">Role: {user.activeRole}</span>
        )}
        <form action={signOutAction} className="mt-2">
          <button
            className="btn btn-sm w-full border-white/45 bg-transparent hover:bg-white/12"
            type="submit"
          >
            Sign out
          </button>
        </form>
      </div>
    </aside>
  );
}
