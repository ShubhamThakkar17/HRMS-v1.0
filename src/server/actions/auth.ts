'use server';
import { AuthError } from 'next-auth';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { signIn, signOut } from '../auth';
import { db } from '../db';
import { rateLimit } from '../ratelimit';
import { createEmailCode } from '../services/otp';
import { sendEmail } from '../services/notify';
import { getCurrentUser, ROLE_COOKIE } from '../current-user';
import { act, type ActionState } from '../action';
import { UserError } from '../errors';

export async function requestCodeAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return act(async () => {
    const email = z.string().trim().toLowerCase().email('Enter your work email.').parse(fd.get('email'));
    if (!(await rateLimit(`otp:${email}`, 5, 15 * 60_000)))
      throw new UserError('Too many codes requested. Try again in 15 minutes.');
    const e = await db.employee.findUnique({ where: { email } });
    // Same answer whether or not the email exists, so the form cannot be used to discover staff emails.
    if (e && e.status === 'ACTIVE') {
      const code = await createEmailCode(email);
      await sendEmail({
        to: email,
        subject: 'Your Silver Touch HRMS sign-in code',
        text: `Your sign-in code is ${code}. It expires in 10 minutes.`,
      });
    }
    return {
      message: 'If that email belongs to an active employee, a 6-digit code is on its way.',
      data: { email },
    };
  });
}

async function credentialsSignIn(provider: string, data: Record<string, string>): Promise<ActionState> {
  try {
    await signIn(provider, { ...data, redirectTo: '/' });
    return null;
  } catch (e) {
    if (e instanceof AuthError) {
      const code = (e as AuthError & { code?: string }).code;
      return {
        ok: false,
        message:
          code === 'rate_limited'
            ? 'Too many attempts. Wait 15 minutes and try again.'
            : 'That did not work. Check the details and try again.',
        at: Date.now(),
      };
    }
    throw e; // redirect on success
  }
}

export async function verifyCodeAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return credentialsSignIn('email-otp', {
    email: String(fd.get('email') ?? ''),
    code: String(fd.get('code') ?? '').trim(),
  });
}

export async function demoSignInAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return credentialsSignIn('demo', {
    email: String(fd.get('email') ?? ''),
    password: String(fd.get('password') ?? ''),
  });
}

export async function googleSignInAction() {
  await signIn('google', { redirectTo: '/' });
}

export async function signOutAction() {
  (await cookies()).delete(ROLE_COOKIE);
  await signOut({ redirectTo: '/login' });
}

/** Switch the active role; only roles the person holds are accepted. */
export async function switchRoleAction(fd: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  const role = String(fd.get('role') ?? '');
  if (user.roleNames.includes(role)) {
    (await cookies()).set(ROLE_COOKIE, role, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
    });
    await db.auditLog.create({
      data: {
        actorId: user.id,
        role,
        action: 'role.switch',
        entity: 'Employee',
        entityId: user.id,
        detail: { from: user.activeRole, to: role },
      },
    });
  }
  redirect('/');
}
