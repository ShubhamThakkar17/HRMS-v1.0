'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  CheckCircle2,
  Fingerprint,
  Globe,
  KeyRound,
  Loader2,
  MapPin,
  RotateCcw,
  ScanFace,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import { FaceScanner } from '@/components/face/face-scanner';
import { warmFaceModels } from '@/components/face/face-client';

type Method = 'FACE' | 'GEO' | 'KIOSK' | 'WEB';
type Reading = { lat: number; lng: number; accuracyM: number };
type Phase = 'idle' | 'consent' | 'face' | 'locating' | 'code' | 'sending' | 'done' | 'error';

const METHOD_META: Record<Method, { label: string; Icon: typeof Fingerprint; hint: string }> = {
  FACE: { label: 'Face ID', Icon: ScanFace, hint: 'Camera and location' },
  GEO: { label: 'Location', Icon: MapPin, hint: 'GPS only' },
  KIOSK: { label: 'Office code', Icon: KeyRound, hint: 'Code on the office screen' },
  WEB: { label: 'Web', Icon: Globe, hint: 'No location or camera' },
};

/** Keep listening to GPS for a few seconds and return the best fix (good enough ≤ 60 m ends early). */
function getLocation(onUpdate: (acc: number) => void, maxMs = 12_000): Promise<Reading> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('This browser cannot share its location.'));
    let best: Reading | null = null;
    const finish = () => {
      navigator.geolocation.clearWatch(id);
      clearTimeout(timer);
      if (best) resolve(best);
      else
        reject(
          new Error(
            'Getting your location took too long. Turn on location (GPS) and try again near a window.',
          ),
        );
    };
    const id = navigator.geolocation.watchPosition(
      (p) => {
        const r = {
          lat: +p.coords.latitude.toFixed(6),
          lng: +p.coords.longitude.toFixed(6),
          accuracyM: Math.round(p.coords.accuracy),
        };
        if (!best || r.accuracyM < best.accuracyM) best = r;
        onUpdate(best.accuracyM);
        if (best.accuracyM <= 60) finish();
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          navigator.geolocation.clearWatch(id);
          clearTimeout(timer);
          reject(
            new Error(
              'Location permission was refused. Allow location for this site in your browser settings, or use the office code.',
            ),
          );
        }
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: maxMs },
    );
    const timer = setTimeout(finish, maxMs);
  });
}

export function PunchPanel({
  verb,
  methods,
  faceEnrolled,
  locationConsented,
  ruleLabel,
}: {
  verb: string;
  methods: Record<'face' | 'geo' | 'kiosk' | 'web', boolean>;
  faceEnrolled: boolean;
  locationConsented: boolean;
  ruleLabel: string;
}) {
  const router = useRouter();
  const available = (['FACE', 'GEO', 'KIOSK', 'WEB'] as Method[]).filter(
    (m) =>
      ({ FACE: methods.face && faceEnrolled, GEO: methods.geo, KIOSK: methods.kiosk, WEB: methods.web })[m],
  );
  const [method, setMethod] = useState<Method>(available[0] ?? 'WEB');
  const [phase, setPhase] = useState<Phase>('idle');
  // A ref, so a punch sent right after "Agree" carries the new value (state updates are async).
  const consentRef = useRef(locationConsented);
  const setConsent = (v: boolean) => {
    consentRef.current = v;
  };
  const [message, setMessage] = useState('');
  const [acc, setAcc] = useState<number | null>(null);
  const [code, setCode] = useState('');
  const locating = useRef<Promise<Reading> | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('punch-method') as Method | null;
      if (saved && available.includes(saved)) setMethod(saved);
    } catch {}
    if (methods.face && faceEnrolled) warmFaceModels();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const choose = (m: Method) => {
    setMethod(m);
    setPhase('idle');
    try {
      localStorage.setItem('punch-method', m);
    } catch {}
  };

  async function send(body: Record<string, unknown>) {
    setPhase('sending');
    const res = await fetch('/api/punch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, locationConsent: consentRef.current }),
    });
    const j = (await res.json()) as {
      error?: string;
      direction?: string;
      time?: string;
      flag?: string | null;
      distanceM?: number | null;
      officeId?: string | null;
      zoneName?: string | null;
    };
    if (!res.ok) throw new Error(j.error ?? 'The punch did not go through.');
    const where = j.officeId
      ? 'at the office'
      : j.zoneName
        ? `at ${j.zoneName}`
        : j.flag
          ? 'outside your work area (your manager will see it)'
          : body.method === 'WEB'
            ? 'from the web'
            : body.method === 'KIOSK'
              ? 'at the office'
              : 'remotely';
    setMessage(`${j.direction === 'IN' ? 'Checked in' : 'Checked out'} at ${j.time} ${where}.`);
    setPhase('done');
    try {
      navigator.vibrate?.(40);
    } catch {}
    setTimeout(() => router.refresh(), 1400);
  }

  const fail = (e: unknown) => {
    setMessage(e instanceof Error ? e.message : String(e));
    setPhase('error');
  };

  const needsLocation = method === 'FACE' || method === 'GEO';

  async function start(skipConsent = false) {
    setMessage('');
    setAcc(null);
    if (needsLocation && !consentRef.current && !skipConsent) return setPhase('consent');
    try {
      if (method === 'WEB') return await send({ method: 'WEB' });
      if (method === 'KIOSK') return setPhase('code');
      locating.current = getLocation(setAcc);
      locating.current.catch(() => {});
      if (method === 'FACE') return setPhase('face');
      setPhase('locating');
      await send({ method: 'GEO', location: await locating.current });
    } catch (e) {
      fail(e);
    }
  }

  async function afterFace(descriptor: number[]) {
    try {
      setPhase('locating');
      const location = await locating.current!;
      await send({ method: 'FACE', descriptor, location });
    } catch (e) {
      fail(e);
    }
  }

  const M = METHOD_META[method];
  const busy = phase === 'locating' || phase === 'sending';

  return (
    <div className="grid gap-5">
      {phase === 'face' ? (
        <div className="card">
          <FaceScanner
            mode="punch"
            onDone={(r) => 'descriptor' in r && afterFace(r.descriptor)}
            onCancel={() => setPhase('idle')}
          />
        </div>
      ) : (
        <div className="card relative grid justify-items-center gap-5 overflow-hidden !py-8">
          <div className="pointer-events-none absolute -top-32 left-1/2 size-80 -translate-x-1/2 rounded-full bg-brand-glow/15 blur-3xl" />

          {phase === 'done' ? (
            <div className="anim-pop grid justify-items-center gap-3 text-center">
              <span className="grid size-40 place-items-center rounded-full bg-good-bg text-good">
                <CheckCircle2 className="size-20" strokeWidth={1.6} />
              </span>
              <p role="status" className="max-w-sm text-lg font-semibold">
                {message}
              </p>
            </div>
          ) : phase === 'code' ? (
            <form
              className="anim-rise grid w-full max-w-xs justify-items-center gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                send({ method: 'KIOSK', code }).catch(fail);
              }}
            >
              <KeyRound className="size-10 text-brand" />
              <p className="text-center text-sm text-muted">
                Type the 6-digit code shown on the office screen. It changes every 30 seconds.
              </p>
              <input
                aria-label="Office code"
                inputMode="numeric"
                autoFocus
                pattern="\d{6}"
                maxLength={6}
                placeholder="000000"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                className="!py-4 text-center font-mono !text-3xl tracking-[0.35em]"
                required
              />
              <div className="flex gap-2">
                <button className="btn btn-lg" disabled={code.length !== 6} type="submit">
                  {verb}
                </button>
                <button className="btn btn-ghost btn-lg" type="button" onClick={() => setPhase('idle')}>
                  Back
                </button>
              </div>
            </form>
          ) : phase === 'consent' ? (
            <div className="anim-rise grid max-w-md gap-4 text-sm">
              <div className="flex items-center gap-2 font-semibold">
                <ShieldCheck className="size-5 text-brand" /> Location notice
              </div>
              <p className="text-muted">
                A location or face punch records your latitude, longitude, GPS accuracy and the distance to
                your work area, only at the moment you punch. Your location is never tracked at other times.
                Precise coordinates are deleted after the retention period.{' '}
                <Link href="/privacy">Privacy notice</Link>
              </p>
              <div className="flex gap-2">
                <button
                  className="btn"
                  onClick={() => {
                    setConsent(true);
                    start(true);
                  }}
                >
                  Agree and continue
                </button>
                <button className="btn btn-ghost" onClick={() => setPhase('idle')}>
                  Not now
                </button>
              </div>
            </div>
          ) : (
            <>
              <button
                type="button"
                onClick={() => start()}
                disabled={busy || !available.length}
                className="pulse-ring relative grid size-48 cursor-pointer place-items-center rounded-full bg-gradient-to-br from-brand to-brand-deep text-brand-glow shadow-[0_20px_50px_-12px_rgb(13_92_72/0.6)] transition-transform duration-200 select-none active:scale-95 disabled:cursor-wait md:size-52"
                aria-label={`${verb} with ${M.label}`}
              >
                <span className="grid justify-items-center gap-1.5 text-white">
                  {busy ? (
                    <Loader2 className="spin size-12" />
                  ) : (
                    <M.Icon className="size-12" strokeWidth={1.6} />
                  )}
                  <span className="text-lg font-semibold">
                    {busy ? (phase === 'sending' ? 'Saving…' : 'Locating…') : verb}
                  </span>
                  <span className="text-xs text-white/70">{M.label}</span>
                </span>
              </button>
              {phase === 'locating' ? (
                <p className="text-sm text-muted" aria-live="polite">
                  {acc === null
                    ? 'Getting your location…'
                    : `GPS accuracy ±${acc} m${acc > 60 ? ', improving…' : ''}`}
                </p>
              ) : null}
              {phase === 'error' ? (
                <div
                  role="alert"
                  className="anim-rise grid max-w-md justify-items-center gap-3 rounded-2xl bg-bad-bg px-4 py-3 text-center text-sm text-bad"
                >
                  <span className="flex items-center gap-2 font-semibold">
                    <XCircle className="size-4" /> That did not work
                  </span>
                  <span>{message}</span>
                  <button className="btn btn-sm !border-bad !bg-bad" onClick={() => start()}>
                    <RotateCcw className="size-3.5" /> Try again
                  </button>
                </div>
              ) : null}
            </>
          )}

          {phase !== 'done' ? (
            <div className="grid w-full gap-2">
              <div className="eyebrow text-center">Punch with</div>
              <div className="mx-auto grid w-full max-w-xl grid-cols-4 gap-2">
                {(['FACE', 'GEO', 'KIOSK', 'WEB'] as Method[]).map((m) => {
                  const meta = METHOD_META[m];
                  const enabled = available.includes(m);
                  const on = m === method;
                  const needsEnrol = m === 'FACE' && methods.face && !faceEnrolled;
                  return needsEnrol ? (
                    <Link
                      key={m}
                      href="/profile"
                      className="grid justify-items-center gap-1 rounded-2xl border border-dashed border-line p-2 text-center text-xs text-muted no-underline hover:border-brand sm:p-3"
                    >
                      <meta.Icon className="size-5" />
                      <span className="font-semibold text-ink">{meta.label}</span>
                      <span className="hidden sm:block">Set up first</span>
                    </Link>
                  ) : (
                    <button
                      key={m}
                      type="button"
                      disabled={!enabled || busy}
                      onClick={() => choose(m)}
                      aria-pressed={on}
                      className={`grid cursor-pointer justify-items-center gap-1 rounded-2xl border p-2 text-center text-xs transition-all sm:p-3 disabled:cursor-not-allowed disabled:opacity-40 ${on ? 'border-brand bg-brand-soft text-brand shadow-sm' : 'border-line bg-white text-muted hover:border-brand/40'}`}
                    >
                      <meta.Icon className="size-5" />
                      <span className="font-semibold text-ink">{meta.label}</span>
                      <span className="hidden sm:block">{enabled ? meta.hint : 'Turned off'}</span>
                    </button>
                  );
                })}
              </div>
              {needsLocation ? (
                <p className="text-center text-xs text-muted">Allowed area: {ruleLabel}</p>
              ) : null}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
