'use client';
// Runs face-api entirely on this device: TinyFaceDetector, 68-point tiny landmarks and the recognition net.
// Only the 128-number descriptor ever leaves the device; no image is sent or stored.
import type * as FaceApi from '@vladmandic/face-api';
import { yawFromLandmarks } from '@/lib/face';

let api: typeof FaceApi | null = null;
let loading: Promise<typeof FaceApi> | null = null;

const NETS = [
  { file: 'tiny_face_detector_model', label: 'face detector' },
  { file: 'face_landmark_68_tiny_model', label: 'landmarks' },
  { file: 'face_recognition_model', label: 'recognition model' },
] as const;

export const MODEL_URLS = NETS.flatMap((n) => [
  `/models/${n.file}-weights_manifest.json`,
  `/models/${n.file}.bin`,
]);

/** Fetch the model files at low priority so a later face punch starts fast (served from cache afterwards). */
export function warmFaceModels() {
  if (typeof window === 'undefined') return;
  const go = () => MODEL_URLS.forEach((u) => fetch(u, { priority: 'low' } as RequestInit).catch(() => {}));
  if ('requestIdleCallback' in window)
    (window as Window & { requestIdleCallback: (cb: () => void) => void }).requestIdleCallback(go);
  else setTimeout(go, 1500);
}

export function loadFaceApi(onProgress?: (pct: number, label: string) => void): Promise<typeof FaceApi> {
  if (api) return Promise.resolve(api);
  loading ??= (async () => {
    onProgress?.(5, 'Starting face engine');
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
    const nets = [fa.nets.tinyFaceDetector, fa.nets.faceLandmark68TinyNet, fa.nets.faceRecognitionNet];
    for (let i = 0; i < nets.length; i++) {
      onProgress?.(15 + i * 28, `Loading ${NETS[i]!.label}`);
      await nets[i]!.loadFromUri('/models');
    }
    onProgress?.(100, '');
    api = fa;
    return fa;
  })().catch((e) => {
    loading = null;
    throw e;
  });
  return loading;
}

let lumCanvas: HTMLCanvasElement | null = null;
/** Average luminance (0–255) of the frame, from a tiny downscaled copy. */
export function brightnessOf(video: HTMLVideoElement): number {
  lumCanvas ??= document.createElement('canvas');
  lumCanvas.width = 32;
  lumCanvas.height = 24;
  const ctx = lumCanvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return 128;
  ctx.drawImage(video, 0, 0, 32, 24);
  const d = ctx.getImageData(0, 0, 32, 24).data;
  let sum = 0;
  for (let i = 0; i < d.length; i += 4) sum += 0.299 * d[i]! + 0.587 * d[i + 1]! + 0.114 * d[i + 2]!;
  return sum / (d.length / 4);
}

export interface Scan {
  faces: number;
  box?: { x: number; y: number; width: number; height: number };
  score?: number;
  yaw: number | null;
  brightness: number;
}

/** Fast pass for live guidance: how many faces, where, how turned, how bright. */
export async function scan(video: HTMLVideoElement): Promise<Scan> {
  const fa = await loadFaceApi();
  const brightness = brightnessOf(video);
  const list = await fa
    .detectAllFaces(video, new fa.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.4 }))
    .withFaceLandmarks(true);
  const vw = video.videoWidth || 640;
  const vh = video.videoHeight || 480;
  if (list.length !== 1) return { faces: list.length, yaw: null, brightness };
  const d = list[0]!;
  const b = d.detection.box;
  return {
    faces: 1,
    box: { x: b.x / vw, y: b.y / vh, width: b.width / vw, height: b.height / vh },
    score: d.detection.score,
    yaw: yawFromLandmarks(d.landmarks.positions),
    brightness,
  };
}

export type Analysis =
  { ok: false; reason: string } | { ok: true; descriptor: number[]; yaw: number | null; score: number };

/** Detect exactly one face and compute its 128-number descriptor. */
export async function analyse(input: HTMLVideoElement | HTMLCanvasElement): Promise<Analysis> {
  const fa = await loadFaceApi();
  const list = await fa
    .detectAllFaces(input, new fa.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.45 }))
    .withFaceLandmarks(true)
    .withFaceDescriptors();
  if (!list.length) return { ok: false, reason: 'No face found. Face the camera in good light.' };
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

export async function openCamera(video: HTMLVideoElement): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia)
    throw new Error('This browser cannot open the camera. Use HTTPS and a recent browser.');
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
    audio: false,
  });
  video.setAttribute('playsinline', 'true');
  video.muted = true;
  video.srcObject = stream;
  await video.play();
  // iOS sometimes reports 0x0 until the first frame arrives.
  for (let i = 0; i < 40 && !video.videoWidth; i++) await new Promise((r) => setTimeout(r, 50));
  return stream;
}

export function stopCamera(stream: MediaStream | null) {
  stream?.getTracks().forEach((t) => t.stop());
}

export function cameraError(e: unknown): string {
  const name = e instanceof DOMException ? e.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError')
    return 'Camera permission was refused. Allow the camera for this site (browser address bar → site settings), then try again.';
  if (name === 'NotFoundError' || name === 'OverconstrainedError')
    return 'No front camera was found on this device.';
  if (name === 'NotReadableError' || name === 'AbortError')
    return 'The camera is busy in another app. Close it and try again.';
  return e instanceof Error ? e.message : 'The camera could not be opened.';
}
