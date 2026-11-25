import { redirect } from 'next/navigation';
import { CalendarHeart, Fingerprint, LineChart, ShieldCheck } from 'lucide-react';
import { getCurrentUser } from '@/server/current-user';
import { demoLoginEnabled } from '@/server/auth';
import { db } from '@/server/db';
import { LoginForms } from './login-forms';

export const metadata = { title: 'Sign in' };

const DEMO = [
  ['Super Admin', 'aditya'],
  ['Director', 'meera'],
  ['HR Admin', 'priya'],
  ['HR Executive', 'pooja'],
  ['Finance', 'neha'],
  ['Manager', 'rohan'],
  ['Employee', 'ananya'],
  ['Field employee', 'harsh'],
] as const;

const FEATURES = [
  { Icon: Fingerprint, text: 'Punch in with Face ID, GPS or the office code' },
  { Icon: CalendarHeart, text: 'Leave, corrections and claims in one inbox' },
  { Icon: LineChart, text: 'Live dashboards for leaders' },
  { Icon: ShieldCheck, text: 'Private by design: no photos stored' },
];

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await getCurrentUser()) redirect('/');
  const { error } = await searchParams;
  const demo = demoLoginEnabled();
  const people = demo
    ? await db.employee.findMany({
        where: { email: { in: DEMO.map((d) => `${d[1]}@demo.example`) }, status: 'ACTIVE' },
        select: { name: true, email: true },
      })
    : [];
  const chips = DEMO.flatMap(([role, key]) => {
    const p = people.find((x) => x.email === `${key}@demo.example`);
    return p ? [{ role, name: p.name, email: p.email }] : [];
  });
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <section className="relative hidden overflow-hidden bg-gradient-to-br from-brand via-brand to-brand-deep p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="pointer-events-none absolute -top-24 -left-24 size-96 animate-[sweep_14s_ease-in-out_infinite] rounded-full bg-brand-glow/25 blur-3xl" />
        <div className="pointer-events-none absolute -right-20 bottom-10 size-80 animate-[sweep_18s_ease-in-out_infinite_reverse] rounded-full bg-white/10 blur-3xl" />
        <div className="relative flex items-center gap-3">
          <div className="grid size-11 place-items-center rounded-2xl bg-white text-sm font-black text-brand">
            ST
          </div>
          <div>
            <div className="text-sm font-bold tracking-[0.18em]">SILVER TOUCH</div>
            <div className="text-sm text-white/65">People & attendance</div>
          </div>
        </div>
        <div className="rise relative grid max-w-md gap-6">
          <h1 className="!text-[40px] leading-[1.1] !font-semibold">Work days, made simple.</h1>
          <ul className="grid gap-3.5">
            {FEATURES.map(({ Icon, text }) => (
              <li key={text} className="flex items-center gap-3 text-white/90">
                <span className="grid size-9 place-items-center rounded-xl bg-white/12 backdrop-blur">
                  <Icon className="size-[18px]" />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-sm text-white/55">© Silver Touch Technologies</p>
      </section>
      <section className="grid place-items-center p-5 sm:p-8">
        <div className="anim-rise w-full max-w-[440px]">
          <div className="mb-6 flex items-center gap-3 lg:hidden">
            <div className="grid size-11 place-items-center rounded-2xl bg-brand text-sm font-black text-white">
              ST
            </div>
            <div>
              <div className="text-sm font-bold tracking-[0.18em] text-brand">SILVER TOUCH</div>
              <div className="text-sm text-muted">People & attendance</div>
            </div>
          </div>
          <LoginForms
            google={!!process.env.AUTH_GOOGLE_ID}
            demo={demo}
            chips={chips}
            error={
              error === 'AccessDenied'
                ? 'That account is not linked to an active employee. Ask HR to add your work email.'
                : error
                  ? 'Sign-in failed. Please try again.'
                  : undefined
            }
          />
        </div>
      </section>
    </div>
  );
}
