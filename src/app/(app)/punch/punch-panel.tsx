'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { livenessPassed } from '@/lib/face';
import {
  analyse,
  cameraError,
  loadFaceApi,
  openCamera,
  stopCamera,
  yawOf,
} from '@/components/face/face-client';

type Method = 'FACE' | 'GEO' | 'KIOSK' | 'WEB';
type Reading = { lat: number; lng: number; accuracyM: number };

function getLocation(timeoutMs = 10_000): Promise<Reading> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('This browser cannot share its location.'));
    navigator.geolocation.getCurrentPosition(
      (p) =>
        resolve({
          lat: +p.coords.latitude.toFixed(6),
          lng: +p.coords.longitude.toFixed(6),
          accuracyM: Math.round(p.coords.accuracy),
        }),
      (err) =>
        reject(
          new Error(
            err.code === err.PERMISSION_DENIED
              ? 'Location permission was refused. Allow location for this site in your browser settings, or use the office code.'
              : err.code === err.TIMEOUT
                ? 'Getting your location took too long. Step outdoors or near a window and try again.'
                : 'Your location is not available right now. Turn on location services and try again.',
          ),
        ),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 0 },
    );
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function PunchPanel({
  verb,
  methods,
  faceEnrolled,
  locationConsented,
}: {
  verb: string;
  methods: { face: boolean; geo: boolean; kiosk: boolean; web: boolean };
  faceEnrolled: boolean;
  locationConsented: boolean;
}) {
  const router = useRouter();
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const [active, setActive] = useState<Method | null>(null);
  const [step, setStep] = useState('');
  const [err, setErr] = useState('');
  const [done, setDone] = useState('');
  const [busy, setBusy] = useState(false);
  const [consent, setConsent] = useState(locationConsented);
  const [code, setCode] = useState('');

  useEffect(() => () => stopCamera(stream.current), []);

  async function send(body: Record<string, unknown>) {
    const res = await fetch('/api/punch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, locationConsent: consent }),
    });
    const j = (await res.json()) as {
      error?: string;
      direction?: string;
      time?: string;
      flag?: string | null;
      distanceM?: number | null;
      officeId?: string | null;
    };
    if (!res.ok) throw new Error(j.error ?? 'The punch did not go through.');
    const where = j.officeId
      ? 'at the office'
      : j.flag
        ? 'outside the office (flagged for your manager)'
        : body.method === 'WEB'
          ? 'without location'
          : 'remotely';
    setDone(
      `${j.direction === 'IN' ? 'Checked in' : 'Checked out'} at ${j.time}, ${where}${j.distanceM ? ` · ${j.distanceM} m from the office` : ''}.`,
    );
    stopCamera(stream.current);
    setActive(null);
    router.refresh();
  }

  async function run(m: Method, fn: () => Promise<void>) {
    setActive(m);
    setErr('');
    setDone('');
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      stopCamera(stream.current);
    } finally {
      setBusy(false);
      setStep('');
    }
  }

  const needConsent = !consent;

  const faceFlow = () =>
    run('FACE', async () => {
      if (needConsent) throw new Error('Tick the location notice first.');
      setStep('Opening the camera…');
      await sleep(0);
      await Promise.all([
        loadFaceApi(setStep),
        (async () => {
          stream.current = await openCamera(video.current!);
        })(),
      ]).catch((e) => {
        throw new Error(cameraError(e));
      });
      setStep('Look straight at the camera…');
      await sleep(600);
      const a = await analyse(video.current!);
      if (!a.ok) throw new Error(a.reason);
      setStep('Liveness check: slowly turn your head to one side, then the other.');
      const yaws: number[] = [];
      const until = Date.now() + 10_000;
      while (Date.now() < until && !livenessPassed(yaws)) {
        const y = await yawOf(video.current!);
        if (y !== null) yaws.push(y);
        await sleep(150);
      }
      if (!livenessPassed(yaws))
        throw new Error(
          'The liveness check did not see your head turn. Try again and turn a little further.',
        );
      setStep('Getting your location…');
      const location = await getLocation();
      setStep('Matching…');
      await send({ method: 'FACE', descriptor: a.descriptor, location });
    });

  const geoFlow = () =>
    run('GEO', async () => {
      if (needConsent) throw new Error('Tick the location notice first.');
      setStep('Getting your location…');
      const location = await getLocation();
      await send({ method: 'GEO', location });
    });

  const kioskFlow = () => run('KIOSK', async () => send({ method: 'KIOSK', code }));
  const webFlow = () => run('WEB', async () => send({ method: 'WEB' }));

  const card = 'flex flex-col justify-between gap-3 rounded-xl border border-line bg-surface p-4';
  return (
    <div className="grid gap-4">
      {done ? (
        <p role="status" className="rounded-lg bg-good-bg px-4 py-3 font-medium text-good">
          {done}
        </p>
      ) : null}
      {err ? (
        <p role="alert" className="rounded-lg bg-bad-bg px-4 py-3 text-bad">
          {err}
        </p>
      ) : null}
      {(methods.geo || methods.face) && needConsent ? (
        <label className="flex items-start gap-2 rounded-lg border border-line bg-soft p-3 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
          />
          <span>
            <b>Location notice.</b> A location or face punch records your latitude, longitude, GPS accuracy
            and the distance to the nearest office, only at the moment you punch. Your location is never
            tracked at other times. Precise coordinates are deleted after the retention period; the office and
            distance are kept. <Link href="/privacy">Privacy notice</Link>
          </span>
        </label>
      ) : null}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(250px,1fr))] gap-3.5">
        {methods.face ? (
          <div className={card}>
            <div>
              <h2>Face ID</h2>
              <p className="mt-1 text-sm text-muted">
                Your face is matched with your enrolled template on this device; your location is taken in the
                same step.
              </p>
            </div>
            {faceEnrolled ? (
              <button className="btn btn-lg" disabled={busy} onClick={faceFlow}>
                {verb} with Face ID
              </button>
            ) : (
              <Link className="btn btn-ghost" href="/profile">
                Enrol your face first
              </Link>
            )}
          </div>
        ) : null}
        {methods.geo ? (
          <div className={card}>
            <div>
              <h2>Location</h2>
              <p className="mt-1 text-sm text-muted">
                Uses your phone’s GPS. The server checks the distance to your office.
              </p>
            </div>
            <button className="btn btn-lg" disabled={busy} onClick={geoFlow}>
              {verb} with location
            </button>
          </div>
        ) : null}
        {methods.kiosk ? (
          <div className={card}>
            <div>
              <h2>Office code</h2>
              <p className="mt-1 text-sm text-muted">
                Enter the 6-digit code on the reception screen. It changes every 30 seconds.
              </p>
            </div>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                kioskFlow();
              }}
            >
              <input
                aria-label="Office code"
                inputMode="numeric"
                pattern="\d{6}"
                maxLength={6}
                placeholder="000000"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                className="font-mono !text-lg tracking-[0.2em]"
                required
              />
              <button className="btn" disabled={busy || code.length !== 6} type="submit">
                {verb}
              </button>
            </form>
          </div>
        ) : null}
        {methods.web ? (
          <div className={card}>
            <div>
              <h2>Quick web punch</h2>
              <p className="mt-1 text-sm text-muted">
                No location or camera. Your manager sees that it was a web punch.
              </p>
            </div>
            <button className="btn btn-ghost btn-lg" disabled={busy} onClick={webFlow}>
              {verb} on the web
            </button>
          </div>
        ) : null}
      </div>
      <div
        className={
          active === 'FACE' ? 'grid gap-3 rounded-xl border-2 border-brand bg-surface p-4' : 'hidden'
        }
      >
        <div className="aspect-[4/3] max-w-[420px] overflow-hidden rounded-lg bg-[#0c1512]">
          <video ref={video} playsInline muted className="size-full -scale-x-100 object-cover" />
        </div>
      </div>
      {step ? (
        <p aria-live="polite" className="flex items-center gap-2 text-muted">
          <span className="inline-block size-4 animate-spin rounded-full border-2 border-soft border-t-brand" />
          {step}
        </p>
      ) : null}
    </div>
  );
}
