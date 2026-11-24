import 'server-only';
import NextAuth, { CredentialsSignin } from 'next-auth';
import Google from 'next-auth/providers/google';
import Credentials from 'next-auth/providers/credentials';
import { z } from 'zod';
import { db } from './db';
import { rateLimit } from './ratelimit';
import { verifyEmailCode } from './services/otp';

export const DEMO_PASSWORD = 'demo123';
export function demoLoginEnabled(): boolean {
  return process.env.AUTH_DEMO === 'true';
}

class RateLimited extends CredentialsSignin {
  code = 'rate_limited';
}
class BadCode extends CredentialsSignin {
  code = 'bad_code';
}

async function activeEmployeeByEmail(email: string) {
  const e = await db.employee.findUnique({ where: { email: email.toLowerCase().trim() } });
  return e && e.status === 'ACTIVE' ? e : null;
}

const providers = [];
if (process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET) {
  providers.push(
    Google({
      authorization: process.env.AUTH_GOOGLE_HD
        ? { params: { hd: process.env.AUTH_GOOGLE_HD, prompt: 'select_account' } }
        : { params: { prompt: 'select_account' } },
    }),
  );
}
providers.push(
  Credentials({
    id: 'email-otp',
    name: 'Email code',
    credentials: { email: {}, code: {} },
    async authorize(raw) {
      const p = z.object({ email: z.string().email(), code: z.string().regex(/^\d{6}$/) }).safeParse(raw);
      if (!p.success) throw new BadCode();
      const email = p.data.email.toLowerCase();
      if (!(await rateLimit(`signin:${email}`, 10, 15 * 60_000))) throw new RateLimited();
      const ok = await verifyEmailCode(email, p.data.code);
      if (!ok) throw new BadCode();
      const e = await activeEmployeeByEmail(email);
      if (!e) throw new BadCode();
      return { id: e.id, email: e.email, name: e.name };
    },
  }),
);
if (demoLoginEnabled()) {
  providers.push(
    Credentials({
      id: 'demo',
      name: 'Demo profile',
      credentials: { email: {}, password: {} },
      async authorize(raw) {
        const p = z.object({ email: z.string().email(), password: z.string() }).safeParse(raw);
        if (!p.success || p.data.password !== DEMO_PASSWORD) throw new BadCode();
        if (!(await rateLimit(`signin:${p.data.email.toLowerCase()}`, 20, 15 * 60_000)))
          throw new RateLimited();
        const e = await activeEmployeeByEmail(p.data.email);
        if (!e) throw new BadCode();
        return { id: e.id, email: e.email, name: e.name };
      },
    }),
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers,
  session: { strategy: 'jwt', maxAge: 12 * 60 * 60 },
  pages: { signIn: '/login', error: '/login' },
  trustHost: true,
  callbacks: {
    // Link every sign-in to an Employee by email; inactive employees cannot sign in.
    async signIn({ user, account, profile }) {
      if (!user.email) return false;
      if (account?.provider === 'google') {
        if (profile && (profile as { email_verified?: boolean }).email_verified === false) return false;
        const hd = process.env.AUTH_GOOGLE_HD;
        if (hd && !user.email.toLowerCase().endsWith(`@${hd.toLowerCase()}`)) return false;
      }
      return !!(await activeEmployeeByEmail(user.email));
    },
    async jwt({ token, user }) {
      if (user?.email) {
        const e = await activeEmployeeByEmail(user.email);
        if (e) token.employeeId = e.id;
      }
      return token;
    },
    async session({ session, token }) {
      (session as unknown as { employeeId?: string }).employeeId = token.employeeId as string | undefined;
      return session;
    },
  },
});
