'use client';
// Client form helpers around server actions.
import { useActionState, useEffect, useRef, useState, type ReactNode } from 'react';
import { useFormStatus } from 'react-dom';
import type { ActionState } from '@/server/action';

export type Action = (prev: ActionState, fd: FormData) => Promise<ActionState>;

export function Submit({
  children,
  className = 'btn',
  pendingText,
}: {
  children: ReactNode;
  className?: string;
  pendingText?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending}>
      {pending ? (pendingText ?? 'Saving…') : children}
    </button>
  );
}

export function Status({ state }: { state: ActionState }) {
  if (!state) return null;
  return (
    <p role={state.ok ? 'status' : 'alert'} className={`m-0 text-sm ${state.ok ? 'text-good' : 'text-bad'}`}>
      {state.message}
    </p>
  );
}

export function ActionForm({
  action,
  children,
  className = 'grid gap-3.5',
  reset = true,
  confirm,
  onDone,
}: {
  action: Action;
  children: ReactNode;
  className?: string;
  reset?: boolean;
  confirm?: string;
  onDone?: (s: ActionState) => void;
}) {
  const [state, formAction] = useActionState(action, null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok && reset) ref.current?.reset();
    if (state) onDone?.(state);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
  return (
    <form
      ref={ref}
      action={formAction}
      className={className}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      {children}
      <Status state={state} />
    </form>
  );
}

/** A one-button form (approve, cancel, deactivate…). */
export function ActionButton({
  action,
  fields,
  label,
  className = 'btn btn-sm',
  confirm,
}: {
  action: Action;
  fields: Record<string, string>;
  label: string;
  className?: string;
  confirm?: string;
}) {
  const [state, formAction] = useActionState(action, null);
  return (
    <form
      action={formAction}
      className="inline-flex flex-col items-start gap-1"
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      {Object.entries(fields).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <Submit className={className} pendingText="…">
        {label}
      </Submit>
      {state && !state.ok ? <Status state={state} /> : null}
    </form>
  );
}

/** Approve, or reject with a required reason. */
export function DecideButtons({ action, kind, id }: { action: Action; kind: string; id: string }) {
  const [rejecting, setRejecting] = useState(false);
  const [state, formAction] = useActionState(action, null);
  const decision = useRef<HTMLInputElement>(null);
  const set = (v: string) => () => {
    if (decision.current) decision.current.value = v;
  };
  return (
    <form action={formAction} className="grid min-w-52 gap-1.5">
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="decision" defaultValue="approve" ref={decision} />
      {rejecting ? (
        <>
          <label className="field">
            Reason for rejecting
            <input name="comment" required minLength={3} autoFocus />
          </label>
          <div className="flex gap-2">
            <button className="btn btn-sm btn-danger" type="submit" onClick={set('reject')}>
              Reject
            </button>
            <button className="btn btn-sm btn-ghost" type="button" onClick={() => setRejecting(false)}>
              Back
            </button>
          </div>
        </>
      ) : (
        <div className="flex gap-2">
          <button className="btn btn-sm" type="submit" onClick={set('approve')}>
            Approve
          </button>
          <button className="btn btn-sm btn-ghost" type="button" onClick={() => setRejecting(true)}>
            Reject
          </button>
        </div>
      )}
      <Status state={state} />
    </form>
  );
}
