'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  CalendarHeart,
  ClipboardCheck,
  Fingerprint,
  Home,
  LogOut,
  Menu,
  X,
  CalendarDays,
  ChevronDown,
} from 'lucide-react';
import { signOutAction, switchRoleAction } from '@/server/actions/auth';
import type { NavItem } from '@/lib/permissions';
import { NAV_ICON } from './nav-icons';

type User = { name: string; title: string; code: string; activeRole: string; roles: string[] };

function initials(n: string) {
  return n
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('');
}

function useActive(nav: { group: string; items: NavItem[] }[]) {
  const path = usePathname();
  // Highlight only the most specific matching item (so /team/attendance does not also light up /team).
  const matches = nav
    .flatMap((g) => g.items.map((i) => i.href))
    .filter((h) => (h === '/' ? path === '/' : path === h || path.startsWith(h + '/')));
  return matches.sort((a, b) => b.length - a.length)[0];
}

function NavList({
  nav,
  badge,
  current,
  onNavigate,
}: {
  nav: { group: string; items: NavItem[] }[];
  badge: number;
  current?: string;
  onNavigate?: () => void;
}) {
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  return (
    <nav aria-label="Main sections" className="grid gap-3">
      {nav.map((g) => {
        const collapsible = g.group !== 'My work';
        const isClosed = collapsible && closed[g.group] && !g.items.some((i) => i.href === current);
        return (
          <div key={g.group}>
            <button
              type="button"
              className="flex w-full items-center justify-between px-3 pb-1 text-[11px] font-semibold tracking-[0.09em] text-white/50 uppercase"
              onClick={() => collapsible && setClosed((c) => ({ ...c, [g.group]: !c[g.group] }))}
              aria-expanded={!isClosed}
            >
              {g.group}
              {collapsible ? (
                <ChevronDown className={`size-3.5 transition-transform ${isClosed ? '-rotate-90' : ''}`} />
              ) : null}
            </button>
            <div
              className={`grid transition-[grid-template-rows] duration-300 ${isClosed ? 'grid-rows-[0fr]' : 'grid-rows-[1fr]'}`}
            >
              <div className="overflow-hidden">
                {g.items.map((it) => {
                  const Icon = NAV_ICON[it.href];
                  const on = it.href === current;
                  return (
                    <Link
                      key={it.href}
                      href={it.href}
                      onClick={onNavigate}
                      aria-current={on ? 'page' : undefined}
                      className={`group relative my-0.5 flex items-center gap-3 rounded-xl px-3 py-2 text-[14px] no-underline transition-all duration-200 ${on ? 'bg-white text-brand shadow-sm' : 'text-white/80 hover:bg-white/10 hover:text-white'}`}
                    >
                      {Icon ? (
                        <Icon
                          className={`size-[18px] shrink-0 transition-transform duration-200 group-hover:scale-110 ${on ? 'text-brand' : ''}`}
                          strokeWidth={on ? 2.2 : 1.8}
                        />
                      ) : null}
                      <span className="flex-1 truncate">{it.label}</span>
                      {it.href === '/approvals' && badge > 0 ? (
                        <span
                          className="rounded-full bg-badge px-1.5 text-[11px] font-bold text-[#2a2108]"
                          aria-label={`${badge} waiting`}
                        >
                          {badge}
                        </span>
                      ) : null}
                    </Link>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })}
    </nav>
  );
}

function UserBox({ user }: { user: User }) {
  return (
    <div className="grid gap-2.5 rounded-2xl bg-white/8 p-3 text-[13px]">
      <div className="flex items-center gap-2.5">
        <div className="grid size-9 place-items-center rounded-full bg-white/15 font-semibold">
          {initials(user.name)}
        </div>
        <div className="min-w-0">
          <div className="truncate font-semibold">{user.name}</div>
          <div className="truncate text-white/60">{user.title}</div>
        </div>
      </div>
      {user.roles.length > 1 ? (
        <form action={switchRoleAction} className="grid gap-1 text-xs text-white/70">
          <label htmlFor="role-switch">Viewing as</label>
          <select
            id="role-switch"
            name="role"
            defaultValue={user.activeRole}
            onChange={(e) => e.currentTarget.form?.requestSubmit()}
            className="!rounded-lg !border-white/20 !bg-white/10 !px-2.5 !py-1.5 !text-white [&>option]:text-ink"
          >
            {user.roles.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </form>
      ) : (
        <div className="text-xs text-white/60">Role: {user.activeRole}</div>
      )}
      <form action={signOutAction}>
        <button
          className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-white/20 py-1.5 text-white/90 transition-colors hover:bg-white/10"
          type="submit"
        >
          <LogOut className="size-3.5" /> Sign out
        </button>
      </form>
    </div>
  );
}

const Brand = () => (
  <div className="flex items-center gap-2.5">
    <div className="grid size-9 place-items-center rounded-xl bg-white text-[13px] font-black tracking-tight text-brand shadow-sm">
      ST
    </div>
    <div className="leading-tight">
      <div className="text-[13px] font-bold tracking-[0.16em]">SILVER TOUCH</div>
      <div className="text-[12px] text-white/60">People & attendance</div>
    </div>
  </div>
);

export function Sidebar({
  nav,
  badge,
  user,
}: {
  nav: { group: string; items: NavItem[] }[];
  badge: number;
  user: User;
}) {
  const current = useActive(nav);
  const [open, setOpen] = useState(false);
  const path = usePathname();
  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
  }, [open]);
  const canApprove = nav.some((g) => g.items.some((i) => i.href === '/approvals'));
  const tabs = [
    { href: '/', label: 'Home', Icon: Home },
    { href: '/my/attendance', label: 'Attendance', Icon: CalendarDays },
    { href: '/punch', label: 'Punch', Icon: Fingerprint, main: true },
    canApprove
      ? { href: '/approvals', label: 'Approvals', Icon: ClipboardCheck }
      : { href: '/my/leave', label: 'Leave', Icon: CalendarHeart },
  ];
  return (
    <>
      {/* Desktop */}
      <aside className="sticky top-0 hidden h-screen flex-col gap-5 overflow-y-auto bg-gradient-to-b from-brand to-brand-deep px-3 py-5 text-white lg:flex">
        <div className="px-2">
          <Brand />
        </div>
        <NavList nav={nav} badge={badge} current={current} />
        <div className="mt-auto">
          <UserBox user={user} />
        </div>
      </aside>

      {/* Phone: top bar */}
      <header className="no-print sticky top-0 z-30 flex items-center justify-between bg-brand/95 px-4 pt-[max(env(safe-area-inset-top),10px)] pb-2.5 text-white backdrop-blur lg:hidden">
        <Brand />
        <button
          className="grid size-10 place-items-center rounded-xl bg-white/10"
          onClick={() => setOpen(true)}
          aria-label="Open menu"
        >
          <Menu className="size-5" />
        </button>
      </header>

      {/* Phone: bottom tabs */}
      <nav
        aria-label="Quick"
        className="no-print fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
      >
        <div className="grid grid-cols-5 items-end">
          {tabs
            .slice(0, 2)
            .concat(tabs.slice(2))
            .map((t) => {
              const on = current === t.href;
              if (t.main) {
                return (
                  <Link
                    key={t.href}
                    href={t.href}
                    className="-mt-6 grid justify-items-center gap-1 pb-2 text-[11px] font-semibold text-brand no-underline"
                  >
                    <span
                      className={`grid size-14 place-items-center rounded-full bg-brand text-white shadow-lg ring-4 ring-white transition-transform active:scale-95 ${on ? 'scale-105' : ''}`}
                    >
                      <t.Icon className="size-6" />
                    </span>
                    {t.label}
                  </Link>
                );
              }
              return (
                <Link
                  key={t.href}
                  href={t.href}
                  className={`grid justify-items-center gap-1 py-2 text-[11px] font-medium no-underline ${on ? 'text-brand' : 'text-muted'}`}
                >
                  <t.Icon className="size-[22px]" strokeWidth={on ? 2.3 : 1.8} />
                  {t.label}
                  {t.href === '/approvals' && badge > 0 ? (
                    <span className="absolute ml-6 -mt-1 size-2 rounded-full bg-bad" />
                  ) : null}
                </Link>
              );
            })}
          <button
            onClick={() => setOpen(true)}
            className="grid justify-items-center gap-1 py-2 text-[11px] font-medium text-muted"
          >
            <Menu className="size-[22px]" strokeWidth={1.8} />
            More
          </button>
        </div>
      </nav>

      {/* Phone: full menu sheet */}
      <div
        className={`fixed inset-0 z-40 lg:hidden ${open ? '' : 'pointer-events-none'}`}
        aria-hidden={!open}
      >
        <div
          className={`absolute inset-0 bg-ink/40 transition-opacity duration-300 ${open ? 'opacity-100' : 'opacity-0'}`}
          onClick={() => setOpen(false)}
        />
        <div
          className={`absolute inset-y-0 right-0 flex w-[min(320px,88vw)] flex-col gap-4 overflow-y-auto bg-gradient-to-b from-brand to-brand-deep p-4 pt-[max(env(safe-area-inset-top),16px)] text-white shadow-2xl transition-transform duration-300 ease-[var(--ease)] ${open ? 'translate-x-0' : 'translate-x-full'}`}
        >
          <div className="flex items-center justify-between">
            <Brand />
            <button
              className="grid size-10 place-items-center rounded-xl bg-white/10"
              onClick={() => setOpen(false)}
              aria-label="Close menu"
            >
              <X className="size-5" />
            </button>
          </div>
          {open ? (
            <>
              <NavList nav={nav} badge={badge} current={current} onNavigate={() => setOpen(false)} />
              <UserBox user={user} />
            </>
          ) : null}
        </div>
      </div>
    </>
  );
}
