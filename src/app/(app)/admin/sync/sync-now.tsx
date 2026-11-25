'use client';
import { useActionState } from 'react';
import { syncNowAction } from '@/server/actions/company';
import { Status, Submit } from '@/components/forms';

export function SyncNow({ disabled }: { disabled: boolean }) {
  const [state, action] = useActionState(syncNowAction, null);
  const results = (
    state?.data as { results?: { tab: string; ok: boolean; rows: number; error?: string }[] } | undefined
  )?.results;
  return (
    <form action={action} className="grid gap-3">
      <div className="flex items-center gap-3">
        {disabled ? (
          <button className="btn" disabled type="button">
            Sync now
          </button>
        ) : (
          <Submit pendingText="Syncing every tab…">Sync now</Submit>
        )}
        {disabled ? (
          <span className="text-[13px] text-muted">Connect Google Sheets first (see Connection).</span>
        ) : null}
      </div>
      <Status state={state} />
      {results ? (
        <ul className="grid gap-1 text-sm">
          {results.map((r) => (
            <li key={r.tab} className={r.ok ? 'text-good' : 'text-bad'}>
              {r.ok ? '✓' : '✗'} {r.tab}: {r.ok ? `${r.rows} rows` : r.error}
            </li>
          ))}
        </ul>
      ) : null}
    </form>
  );
}
