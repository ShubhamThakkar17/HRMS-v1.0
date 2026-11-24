import { redirect } from 'next/navigation';
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
    <div className="grid min-h-screen place-items-center p-6">
      <div className="w-full max-w-[460px] overflow-hidden rounded-2xl border border-line bg-surface">
        <div className="bg-brand px-6.5 py-5.5 text-white">
          <div className="text-[15px] font-bold tracking-[0.18em]">SILVER TOUCH</div>
          <div className="mt-0.5 text-[13px] opacity-85">People and attendance</div>
        </div>
        <LoginForms
          google={!!process.env.AUTH_GOOGLE_ID}
          demo={demo}
          chips={chips}
          error={
            error === 'AccessDenied'
              ? 'That account is not linked to an active employee.'
              : error
                ? 'Sign-in failed. Please try again.'
                : undefined
          }
        />
      </div>
    </div>
  );
}
