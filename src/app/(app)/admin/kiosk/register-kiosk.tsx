'use client';
import { useActionState } from 'react';
import { registerKioskAction } from '@/server/actions/company';
import { Status, Submit } from '@/components/forms';

export function RegisterKiosk({ offices }: { offices: { id: string; name: string }[] }) {
  const [state, action] = useActionState(registerKioskAction, null);
  const url = state?.ok ? (state.data as { url: string }).url : null;
  const full = url && typeof window !== 'undefined' ? `${window.location.origin}${url}` : url;
  return (
    <div className="grid gap-3">
      <form action={action} className="flex flex-wrap items-end gap-3">
        <label className="field">
          Office
          <select name="officeId" required>
            {offices.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field min-w-52 flex-1">
          Device name
          <input name="name" required placeholder="Reception tablet" />
        </label>
        <Submit>Register</Submit>
      </form>
      <Status state={state} />
      {full ? (
        <div className="grid gap-2 rounded-lg border border-line bg-soft p-3">
          <span className="text-sm">Open this link on the kiosk tablet and keep it on screen:</span>
          <code className="font-mono text-[13px] [overflow-wrap:anywhere]">{full}</code>
          <div className="flex gap-2">
            <button type="button" className="btn btn-sm" onClick={() => navigator.clipboard?.writeText(full)}>
              Copy link
            </button>
            <a className="btn btn-sm btn-ghost" href={url!} target="_blank" rel="noopener">
              Open kiosk
            </a>
          </div>
        </div>
      ) : null}
    </div>
  );
}
