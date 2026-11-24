'use client';
// Runs face-api entirely on this device: TinyFaceDetector, 68-point tiny landmarks and the recognition net.
// Only the 128-number descriptor ever leaves the device; no image is sent or stored.
import type * as FaceApi from '@vladmandic/face-api';
import { yawFromLandmarks } from '@/lib/face';

let api: typeof FaceApi | null = null;
let loading: Promise<typeof FaceApi> | null = null;

export function loadFaceApi(onStatus?: (s: string) => void): Promise<typeof FaceApi> {
  if (api) return Promise.resolve(api);
  loading ??= (async () => {
    onStatus?.('Loading the face model (about 7 MB, first time only)…');
    const fa = await import('@vladmandic/face-api');
    // The bundled TensorFlow.js types are partial; these calls exist at runtime.
    const tf = fa.tf as unknown as {
      setBackend(b: string): Promise<boolean>;
      getBackend(): string;
      ready(): Promise<void>;
    };
    try {
      await tf.setBackend('webgl');
    } catch {
      /* fall back below */
    }
    if (tf.getBackend() !== 'webgl') await tf.setBackend('cpu');
    await tf.ready();
    await Promise.all([
      fa.nets.tinyFaceDetector.loadFromUri('/models'),
      fa.nets.faceLandmark68TinyNet.loadFromUri('/models'),
      fa.nets.faceRecognitionNet.loadFromUri('/models'),
    ]);
    api = fa;
    onStatus?.('');
    return fa;
  })().catch((e) => {
    loading = null;
    throw e;
  });
  return loading;
}

export type Analysis =
  { ok: false; reason: string } | { ok: true; descriptor: number[]; yaw: number | null; score: number };

/** Detect exactly one face and compute its descriptor. */
export async function analyse(input: HTMLVideoElement | HTMLCanvasElement): Promise<Analysis> {
  const fa = await loadFaceApi();
  const list = await fa
    .detectAllFaces(input, new fa.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.45 }))
    .withFaceLandmarks(true)
    .withFaceDescriptors();
  if (!list.length)
    return { ok: false, reason: 'No face found. Face the camera in good light and try again.' };
  if (list.length > 1)
    return { ok: false, reason: 'More than one face found. Only the person punching should be in view.' };
  const d = list[0]!;
  return {
    ok: true,
    descriptor: Array.from(d.descriptor, (v) => +v.toFixed(5)),
    yaw: yawFromLandmarks(d.landmarks.positions),
    score: d.detection.score,
  };
}

/** Fast head-turn estimate for the liveness step. */
export async function yawOf(input: HTMLVideoElement): Promise<number | null> {
  const fa = await loadFaceApi();
  const r = await fa
    .detectSingleFace(input, new fa.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.4 }))
    .withFaceLandmarks(true);
  return r ? yawFromLandmarks(r.landmarks.positions) : null;
}

export async function openCamera(video: HTMLVideoElement): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia)
    throw new Error('This browser cannot open the camera. Use HTTPS and a recent browser.');
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
    audio: false,
  });
  video.srcObject = stream;
  await video.play();
  return stream;
}

export function stopCamera(stream: MediaStream | null) {
  stream?.getTracks().forEach((t) => t.stop());
}

export function cameraError(e: unknown): string {
  const name = e instanceof DOMException ? e.name : '';
  if (name === 'NotAllowedError')
    return 'Camera permission was refused. Allow the camera for this site in your browser settings.';
  if (name === 'NotFoundError') return 'No camera was found on this device.';
  if (name === 'NotReadableError') return 'The camera is in use by another app.';
  return e instanceof Error ? e.message : 'The camera could not be opened.';
}
