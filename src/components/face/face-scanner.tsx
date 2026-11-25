'use client';
import { useEffect, useRef, useState } from 'react';
import { ArrowLeftRight, Camera, Loader2, RotateCcw, X } from 'lucide-react';
import { framingAdvice, headTurnLiveness, MAX_SAMPLES, samplesConsistent } from '@/lib/face';
import { analyse, cameraError, loadFaceApi, openCamera, scan, stopCamera } from './face-client';

type Result = { descriptor: number[] } | { samples: number[][] };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Camera with an oval guide. Captures automatically:
 *  - punch: good framing → head turn to either side and back (liveness) → frontal capture.
 *  - enrol: good framing → three samples with small pose changes → consistency check.
 */
export function FaceScanner({
  mode,
  onDone,
  onCancel,
  onError,
}: {
  mode: 'punch' | 'enrol';
  onDone: (r: Result) => void;
  onCancel: () => void;
  onError?: (message: string) => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const alive = useRef(true);
  const [loadPct, setLoadPct] = useState(0);
  const [hint, setHint] = useState('Starting camera…');
  const [good, setGood] = useState(false);
  const [progress, setProgress] = useState(0);
  const [turnPrompt, setTurnPrompt] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [run, setRun] = useState(0);

  useEffect(() => {
    alive.current = true;
    let cancelled = false;
    const stillHere = () => alive.current && !cancelled;

    async function waitForFraming(okFrames = 3): Promise<boolean> {
      let ok = 0;
      const until = Date.now() + 25_000;
      while (stillHere() && Date.now() < until) {
        const s = await scan(video.current!);
        const advice = framingAdvice({
          faces: s.faces,
          box: s.box,
          brightness: s.brightness,
          score: s.score,
        });
        setGood(!advice);
        if (advice) {
          setHint(advice);
          ok = 0;
        } else if (++ok >= okFrames) return true;
        await sleep(90);
      }
      return false;
    }

    async function punchFlow() {
      setHint('Fit your face inside the oval');
      if (!(await waitForFraming()))
        throw new Error('We could not see your face clearly. Try again in better light.');
      setHint('Now turn your head slightly to one side, then back');
      setTurnPrompt(true);
      const yaws: number[] = [];
      const until = Date.now() + 12_000;
      let live = headTurnLiveness(yaws);
      while (stillHere() && Date.now() < until && !live.passed) {
        const s = await scan(video.current!);
        if (s.faces === 1 && s.yaw !== null) yaws.push(s.yaw);
        live = headTurnLiveness(yaws);
        setProgress(live.turned ? 0.75 : Math.min(0.6, yaws.length / 8));
        if (live.turned) setHint('Good, now look back at the camera');
        await sleep(60);
      }
      setTurnPrompt(false);
      if (!live.passed)
        throw new Error('We did not see your head turn. Turn a little more, then look back at the camera.');
      setHint('Hold still…');
      for (let i = 0; i < 6 && stillHere(); i++) {
        const a = await analyse(video.current!);
        if (a.ok && (a.yaw === null || live.baseline === null || Math.abs(a.yaw - live.baseline) < 0.12)) {
          setProgress(1);
          return { descriptor: a.descriptor };
        }
        await sleep(150);
      }
      throw new Error('Look straight at the camera and try again.');
    }

    async function enrolFlow() {
      const prompts = [
        'Look straight at the camera',
        'Turn very slightly to one side',
        'Now slightly to the other side',
      ];
      for (let attempt = 0; attempt < 2; attempt++) {
        const samples: number[][] = [];
        for (let i = 0; i < MAX_SAMPLES && stillHere(); i++) {
          setHint(prompts[i]!);
          if (i > 0) await sleep(900);
          if (!(await waitForFraming(2)))
            throw new Error('We could not see your face clearly. Try again in better light.');
          let a = await analyse(video.current!);
          for (let k = 0; !a.ok && k < 4; k++) a = await analyse(video.current!);
          if (!a.ok) throw new Error(a.reason);
          samples.push(a.descriptor);
          setProgress(samples.length / MAX_SAMPLES);
        }
        if (samplesConsistent(samples)) return { samples };
        setProgress(0);
        setHint('Those did not match each other. Hold still, one more time…');
        await sleep(1200);
      }
      throw new Error(
        'The samples did not match each other. Use good, even light and keep only your face in view.',
      );
    }

    (async () => {
      try {
        setFailed(null);
        setProgress(0);
        const [, s] = await Promise.all([
          loadFaceApi((p, label) => {
            setLoadPct(p);
            if (label) setHint(label + '…');
          }),
          openCamera(video.current!),
        ]);
        stream.current = s;
        if (!stillHere()) return;
        const r = mode === 'punch' ? await punchFlow() : await enrolFlow();
        if (stillHere()) {
          stopCamera(stream.current);
          onDone(r);
        }
      } catch (e) {
        if (!stillHere()) return;
        const msg =
          e instanceof DOMException
            ? cameraError(e)
            : e instanceof Error
              ? e.message
              : 'Something went wrong.';
        setFailed(msg);
        onError?.(msg);
        stopCamera(stream.current);
      }
    })();
    return () => {
      cancelled = true;
      alive.current = false;
      stopCamera(stream.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run, mode]);

  const loading = loadPct > 0 && loadPct < 100;
  return (
    <div className="anim-rise grid gap-3">
      <div className="relative mx-auto aspect-[3/4] w-full max-w-[340px] overflow-hidden rounded-[28px] bg-[#0b1512] shadow-[var(--shadow-lg)]">
        <video
          ref={video}
          playsInline
          muted
          autoPlay
          className="absolute inset-0 size-full -scale-x-100 object-cover"
        />
        {/* Mask with an oval window */}
        <svg viewBox="0 0 300 400" className="absolute inset-0 size-full" aria-hidden>
          <defs>
            <mask id="oval">
              <rect width="300" height="400" fill="white" />
              <ellipse cx="150" cy="185" rx="104" ry="138" fill="black" />
            </mask>
          </defs>
          <rect width="300" height="400" fill="rgb(8 20 16 / 0.62)" mask="url(#oval)" />
          <ellipse
            cx="150"
            cy="185"
            rx="104"
            ry="138"
            fill="none"
            stroke={good ? 'var(--brand-glow)' : 'rgb(255 255 255 / 0.55)'}
            strokeWidth="3"
            className="transition-[stroke] duration-300"
          />
          <ellipse
            cx="150"
            cy="185"
            rx="112"
            ry="146"
            fill="none"
            stroke="var(--brand-glow)"
            strokeWidth="6"
            strokeLinecap="round"
            pathLength={100}
            strokeDasharray={`${progress * 100} 100`}
            transform="rotate(-90 150 185)"
            className="transition-[stroke-dasharray] duration-500"
          />
        </svg>
        {turnPrompt ? (
          <div className="absolute inset-x-0 top-6 grid place-items-center">
            <span className="grid size-12 place-items-center rounded-full bg-white/15 text-white backdrop-blur">
              <ArrowLeftRight className="size-6 animate-[sweep_1.6s_ease-in-out_infinite]" />
            </span>
          </div>
        ) : null}
        {loading ? (
          <div className="absolute inset-x-6 top-6 grid gap-1.5 text-center text-xs text-white/85">
            <div className="h-1.5 overflow-hidden rounded-full bg-white/20">
              <div
                className="h-full rounded-full bg-brand-glow transition-[width] duration-500"
                style={{ width: `${loadPct}%` }}
              />
            </div>
            First time only: getting the face engine ready
          </div>
        ) : null}
        <div className="absolute inset-x-4 bottom-4 flex justify-center">
          <span
            aria-live="polite"
            className={`chip max-w-full justify-center !px-3.5 !py-2 text-center text-[13px] backdrop-blur ${failed ? 'bg-bad/90 text-white' : good ? 'bg-brand/90 text-white' : 'bg-black/55 text-white'}`}
          >
            {failed ? null : loading || hint.endsWith('…') ? (
              <Loader2 className="spin size-3.5" />
            ) : (
              <Camera className="size-3.5" />
            )}
            {failed ?? hint}
          </span>
        </div>
      </div>
      <div className="flex justify-center gap-2">
        {failed ? (
          <button type="button" className="btn" onClick={() => setRun((r) => r + 1)}>
            <RotateCcw className="size-4" /> Try again
          </button>
        ) : null}
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          <X className="size-4" /> Cancel
        </button>
      </div>
    </div>
  );
}
