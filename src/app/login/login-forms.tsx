'use client';
import { useActionState, useState } from 'react';
import {
  demoSignInAction,
  googleSignInAction,
  requestCodeAction,
  verifyCodeAction,
} from '@/server/actions/auth';
import { Status, Submit } from '@/components/forms';

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
    <div className="grid gap-5 px-6.5 pt-6 pb-6">
      <h1>Sign in</h1>
      {error ? (
        <p role="alert" className="text-sm text-bad">
          {error}
        </p>
      ) : null}
      {google ? (
        <form action={googleSignInAction}>
          <button className="btn btn-lg w-full" type="submit">
            Sign in with Google Workspace
          </button>
        </form>
      ) : null}

      {!sentTo ? (
        <form action={requestCode} className="grid gap-3">
          <label className="field">
            Work email
            <input name="email" type="email" autoComplete="username" required />
          </label>
          <Submit className="btn btn-ghost w-full" pendingText="Sending…">
            Email me a sign-in code
          </Submit>
          <Status state={codeState} />
        </form>
      ) : (
        <form action={verify} className="grid gap-3">
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
            />
          </label>
          <Submit className="btn w-full" pendingText="Checking…">
            Sign in
          </Submit>
          <Status state={verifyState} />
        </form>
      )}

      {demo ? (
        <div className="grid gap-2.5 border-t border-line pt-4.5">
          <p className="text-[13px] text-muted">
            Demo profiles. The password for every profile is <span className="font-mono">demo123</span>.
            People can hold several roles and switch between them.
          </p>
          <div className="flex flex-wrap gap-2">
            {chips.map((c) => (
              <button
                key={c.email}
                type="button"
                onClick={() => setDemoEmail(c.email)}
                className={`cursor-pointer rounded-full border px-3 py-1.5 text-[13px] ${demoEmail === c.email ? 'border-brand bg-soft' : 'border-line bg-white hover:border-brand'}`}
              >
                {c.role} · {c.name.split(' ')[0]}
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
            <label className="field">
              Password
              <input name="password" type="password" defaultValue="demo123" required />
            </label>
            <Submit className="btn w-full" pendingText="Signing in…">
              Sign in to demo
            </Submit>
            <Status state={demoState} />
          </form>
          <p className="text-[13px] text-muted">All people and figures are invented.</p>
        </div>
      ) : null}
      <p className="text-[13px] text-muted">
        <a href="/privacy">Privacy notice</a>
      </p>
    </div>
  );
}
