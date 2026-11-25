'use client';
import { useActionState, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, ScanFace, ShieldCheck, Trash2 } from 'lucide-react';
import { withdrawFaceAction } from '@/server/actions/profile';
import { Status } from '../forms';
import { FaceScanner } from './face-scanner';

export function FaceConsentNotice() {
  return (
    <div className="grid gap-2 rounded-2xl border border-line bg-surface-2 p-4 text-sm">
      <strong className="flex items-center gap-2">
        <ShieldCheck className="size-4 text-brand" /> Before you enrol
      </strong>
      <ul className="ml-4 list-disc space-y-1 text-muted">
        <li>
          <b className="text-ink">What is stored:</b> up to 3 face templates, each 128 numbers worked out on
          this device. No photo is sent or kept.
        </li>
        <li>
          <b className="text-ink">Why:</b> only to confirm it is you when you punch with Face ID.
        </li>
        <li>
          <b className="text-ink">Protection:</b> encrypted in the database, never exported (not even to the
          Google Sheets backup).
        </li>
        <li>
          <b className="text-ink">Retention:</b> kept while you use Face ID; deleted when you withdraw consent
          or leave.
        </li>
        <li>
          <b className="text-ink">Your choice:</b> optional. You can always punch with location, the office
          code or the web punch.
        </li>
      </ul>
    </div>
  );
}

type Phase = 'idle' | 'consent' | 'scan' | 'saving' | 'test';

export function FaceEnrol({ consentVersion, enrolled }: { consentVersion: string; enrolled: boolean }) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>('idle');
  const [agree, setAgree] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [withdrawState, withdraw] = useActionState(withdrawFaceAction, null);

  async function save(samples: number[][]) {
    setPhase('saving');
    const res = await fetch('/api/face/enrol', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ samples, consentVersion }),
    });
    const j = (await res.json()) as { error?: string };
    setPhase('idle');
    if (!res.ok) return setMsg({ ok: false, text: j.error ?? 'Could not save. Please try again.' });
    setMsg({ ok: true, text: 'Face ID is ready. Use “Test my Face ID” to check it.' });
    router.refresh();
  }

  async function test(descriptor: number[]) {
    setPhase('idle');
    const res = await fetch('/api/face/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ descriptor }),
    });
    const j = (await res.json()) as { error?: string; distance?: number; threshold?: number };
    if (!res.ok) return setMsg({ ok: false, text: j.error ?? 'That did not match.' });
    const strength = Math.round((1 - (j.distance ?? 0) / (j.threshold ?? 0.5)) * 100);
    setMsg({
      ok: true,
      text: `It’s you. Match strength ${Math.max(1, strength)}% (distance ${j.distance} ≤ ${j.threshold}).`,
    });
  }

  if (phase === 'scan')
    return (
      <FaceScanner
        mode="enrol"
        onDone={(r) => 'samples' in r && save(r.samples)}
        onCancel={() => setPhase('idle')}
      />
    );
  if (phase === 'test')
    return (
      <FaceScanner
        mode="punch"
        onDone={(r) => 'descriptor' in r && test(r.descriptor)}
        onCancel={() => setPhase('idle')}
      />
    );

  return (
    <div className="grid gap-3">
      {phase === 'consent' ? (
        <>
          <FaceConsentNotice />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} /> I have read
            this and agree to Face ID enrolment.
          </label>
          <div className="flex gap-2">
            <button className="btn" type="button" disabled={!agree} onClick={() => setPhase('scan')}>
              <ScanFace className="size-4" /> Start
            </button>
            <button className="btn btn-ghost" type="button" onClick={() => setPhase('idle')}>
              Cancel
            </button>
          </div>
          <p className="text-xs text-muted">
            Tip: face a window or a light, take off sunglasses or a mask, and keep only your face in view. It
            captures automatically.
          </p>
        </>
      ) : (
        <>
          {!enrolled ? (
            <p className="text-sm text-muted">
              Enrol once (about 10 seconds), then check in with your face from the Punch page.
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <button
              className="btn"
              type="button"
              onClick={() => setPhase('consent')}
              disabled={phase === 'saving'}
            >
              <ScanFace className="size-4" />{' '}
              {phase === 'saving' ? 'Saving…' : enrolled ? 'Re-enrol' : 'Enrol my face'}
            </button>
            {enrolled ? (
              <>
                <button className="btn btn-ghost" type="button" onClick={() => setPhase('test')}>
                  <CheckCircle2 className="size-4" /> Test my Face ID
                </button>
                <form
                  action={withdraw}
                  onSubmit={(e) => {
                    if (!confirm('Withdraw consent and delete your face template?')) e.preventDefault();
                  }}
                >
                  <button className="btn btn-danger" type="submit">
                    <Trash2 className="size-4" /> Withdraw consent
                  </button>
                </form>
              </>
            ) : null}
          </div>
        </>
      )}
      {msg ? (
        <p
          role={msg.ok ? 'status' : 'alert'}
          className={`anim-rise text-sm ${msg.ok ? 'text-good' : 'text-bad'}`}
        >
          {msg.text}
        </p>
      ) : null}
      <Status state={withdrawState} />
    </div>
  );
}
