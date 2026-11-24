'use client';
import { useActionState, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { withdrawFaceAction } from '@/server/actions/profile';
import { MAX_SAMPLES } from '@/lib/face';
import { Status } from '../forms';
import { analyse, cameraError, loadFaceApi, openCamera, stopCamera } from './face-client';

export function FaceConsentNotice() {
  return (
    <div className="grid gap-2 rounded-lg border border-line bg-soft p-3 text-sm">
      <strong>Before you enrol</strong>
      <ul className="ml-4 list-disc space-y-1">
        <li>
          <b>What is stored:</b> up to 3 face templates, each a list of 128 numbers worked out on this device.
          No photo is ever sent or kept.
        </li>
        <li>
          <b>Why:</b> only to confirm it is you when you punch in or out with Face ID.
        </li>
        <li>
          <b>Protection:</b> templates are encrypted in the database and are never exported, including to the
          Google Sheets backup.
        </li>
        <li>
          <b>Retention:</b> kept while you use Face ID and deleted when you withdraw consent or leave the
          company.
        </li>
        <li>
          <b>Your choice:</b> Face ID is optional. You can always punch with your location, the office kiosk
          code or the web punch. Withdraw consent here at any time.
        </li>
      </ul>
    </div>
  );
}

export function FaceEnrol({ consentVersion, enrolled }: { consentVersion: string; enrolled: boolean }) {
  const router = useRouter();
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const [phase, setPhase] = useState<'idle' | 'consent' | 'camera' | 'saving'>('idle');
  const [agree, setAgree] = useState(false);
  const [samples, setSamples] = useState<number[][]>([]);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [withdrawState, withdraw] = useActionState(withdrawFaceAction, null);

  useEffect(() => () => stopCamera(stream.current), []);

  async function startCamera() {
    setErr('');
    setPhase('camera');
    try {
      await Promise.all([
        loadFaceApi(setMsg),
        (async () => {
          stream.current = await openCamera(video.current!);
        })(),
      ]);
      setMsg('Look straight at the camera, then capture.');
    } catch (e) {
      setErr(cameraError(e));
      setPhase('consent');
    }
  }

  async function capture() {
    if (!video.current) return;
    setBusy(true);
    setErr('');
    const r = await analyse(video.current);
    setBusy(false);
    if (!r.ok) return setErr(r.reason);
    const next = [...samples, r.descriptor];
    setSamples(next);
    setMsg(
      next.length < MAX_SAMPLES
        ? `Sample ${next.length} captured. Turn your head slightly and capture another, or save now.`
        : 'All samples captured. Save to finish.',
    );
  }

  async function save() {
    setPhase('saving');
    const res = await fetch('/api/face/enrol', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ samples, consentVersion }),
    });
    const j = (await res.json()) as { error?: string };
    stopCamera(stream.current);
    if (!res.ok) {
      setErr(j.error ?? 'Could not save.');
      setPhase('camera');
      return;
    }
    setPhase('idle');
    setSamples([]);
    setMsg('Face ID saved. You can now punch with Face ID.');
    router.refresh();
  }

  if (phase === 'idle') {
    return (
      <div className="grid gap-3">
        {!enrolled ? <p>Enrol once to check in with your face from the Punch page.</p> : null}
        <div className="flex flex-wrap gap-2">
          <button className="btn" type="button" onClick={() => setPhase('consent')}>
            {enrolled ? 'Re-enrol' : 'Enrol my face'}
          </button>
          {enrolled ? (
            <form
              action={withdraw}
              onSubmit={(e) => {
                if (!confirm('Withdraw consent and delete your face template?')) e.preventDefault();
              }}
            >
              <button className="btn btn-danger" type="submit">
                Withdraw consent
              </button>
            </form>
          ) : null}
        </div>
        {msg ? <p className="text-sm text-good">{msg}</p> : null}
        <Status state={withdrawState} />
      </div>
    );
  }
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
            <button className="btn" type="button" disabled={!agree} onClick={startCamera}>
              Open camera
            </button>
            <button className="btn btn-ghost" type="button" onClick={() => setPhase('idle')}>
              Cancel
            </button>
          </div>
        </>
      ) : null}
      <div className={phase === 'camera' || phase === 'saving' ? 'grid gap-3' : 'hidden'}>
        <div className="aspect-[4/3] max-w-[420px] overflow-hidden rounded-lg bg-[#0c1512]">
          <video ref={video} playsInline muted className="size-full -scale-x-100 object-cover" />
        </div>
        <p className="text-sm text-muted" aria-live="polite">
          {msg}
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            className="btn"
            type="button"
            onClick={capture}
            disabled={busy || samples.length >= MAX_SAMPLES || phase === 'saving'}
          >
            {busy
              ? 'Checking…'
              : `Capture sample ${Math.min(samples.length + 1, MAX_SAMPLES)} of ${MAX_SAMPLES}`}
          </button>
          <button
            className="btn btn-ghost"
            type="button"
            onClick={save}
            disabled={!samples.length || phase === 'saving'}
          >
            {phase === 'saving' ? 'Saving…' : `Save ${samples.length} sample(s)`}
          </button>
          <button
            className="btn btn-ghost"
            type="button"
            onClick={() => {
              stopCamera(stream.current);
              setSamples([]);
              setPhase('idle');
            }}
          >
            Cancel
          </button>
        </div>
      </div>
      {err ? (
        <p role="alert" className="text-sm text-bad">
          {err}
        </p>
      ) : null}
    </div>
  );
}
