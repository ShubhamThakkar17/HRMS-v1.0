'use client';
import { useActionState, useState } from 'react';
import { Mail } from 'lucide-react';
import {
  demoSignInAction,
  googleSignInAction,
  requestCodeAction,
  verifyCodeAction,
} from '@/server/actions/auth';
import { Status, Submit } from '@/components/forms';

function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" className="size-5" aria-hidden>
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"
      />
      <path
        fill="#FF3D00"
        d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"
      />
    </svg>
  );
}

function initials(n: string) {
  return n
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('');
}

export function LoginForms({
  google,
  demo,
  chips,
  error,
}: {
  google: boolean;
  demo: boolean;
  chips: { role: string; name: string; email: string }[];
  error?: string;
}) {
  const [codeState, requestCode] = useActionState(requestCodeAction, null);
  const [verifyState, verify] = useActionState(verifyCodeAction, null);
  const [demoState, demoSignIn] = useActionState(demoSignInAction, null);
  const [demoEmail, setDemoEmail] = useState('');
  const sentTo = codeState?.ok ? (codeState.data as { email: string }).email : null;

  return (
    <div className="grid gap-6">
      <div>
        <h1>Welcome back</h1>
        <p className="mt-1 text-muted">Sign in with your work account.</p>
      </div>
      {error ? (
        <p role="alert" className="rounded-xl bg-bad-bg px-3 py-2 text-sm text-bad">
          {error}
        </p>
      ) : null}
      {google ? (
        <form action={googleSignInAction}>
          <button className="btn btn-ghost btn-lg w-full !text-ink" type="submit">
            <GoogleMark /> Continue with Google
          </button>
        </form>
      ) : null}

      {!sentTo ? (
        <form action={requestCode} className="grid gap-3">
          <label className="field">
            Work email
            <input name="email" type="email" autoComplete="username" required placeholder="you@company.com" />
          </label>
          <Submit className="btn w-full" pendingText="Sending…">
            <Mail className="size-4" /> Email me a sign-in code
          </Submit>
          <Status state={codeState} />
        </form>
      ) : (
        <form action={verify} className="anim-rise grid gap-3">
          <p className="text-sm text-muted">{codeState?.message}</p>
          <input type="hidden" name="email" value={sentTo} />
          <label className="field">
            6-digit code
            <input
              name="code"
              inputMode="numeric"
              pattern="\d{6}"
              maxLength={6}
              autoComplete="one-time-code"
              required
              autoFocus
              className="text-center font-mono !text-2xl tracking-[0.4em]"
            />
          </label>
          <Submit className="btn w-full" pendingText="Checking…">
            Sign in
          </Submit>
          <Status state={verifyState} />
        </form>
      )}

      {demo ? (
        <div className="grid gap-3 rounded-2xl border border-line bg-white p-4">
          <div className="flex items-center justify-between">
            <span className="eyebrow">Demo profiles</span>
            <span className="text-xs text-muted">password demo123</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {chips.map((c) => (
              <button
                key={c.email}
                type="button"
                onClick={() => setDemoEmail(c.email)}
                className={`flex cursor-pointer items-center gap-2 rounded-xl border p-2 text-left transition-all ${demoEmail === c.email ? 'border-brand bg-brand-soft' : 'border-line hover:border-brand/40'}`}
              >
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-soft text-xs font-semibold text-brand">
                  {initials(c.name)}
                </span>
                <span className="min-w-0 leading-tight">
                  <span className="block truncate text-[13px] font-semibold">{c.role}</span>
                  <span className="block truncate text-xs text-muted">{c.name.split(' ')[0]}</span>
                </span>
              </button>
            ))}
          </div>
          <form action={demoSignIn} className="grid gap-3">
            <label className="field">
              Email
              <input
                name="email"
                type="email"
                value={demoEmail}
                onChange={(e) => setDemoEmail(e.target.value)}
                required
              />
            </label>
            <input type="hidden" name="password" value="demo123" />
            <Submit className="btn w-full" pendingText="Signing in…">
              Sign in to demo
            </Submit>
            <Status state={demoState} />
          </form>
          <p className="text-xs text-muted">All people and figures are invented.</p>
        </div>
      ) : null}
      <p className="text-center text-[13px] text-muted">
        <a href="/privacy">Privacy notice</a>
      </p>
    </div>
  );
}
