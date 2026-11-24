// Copies the three face-api models used by the app into public/models.
import { cpSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const src = join(process.cwd(), 'node_modules', '@vladmandic', 'face-api', 'model');
const dest = join(process.cwd(), 'public', 'models');
const wanted = ['tiny_face_detector_model', 'face_landmark_68_tiny_model', 'face_recognition_model'];

if (!existsSync(src)) {
  console.log('[face-models] @vladmandic/face-api not installed yet, skipping');
  process.exit(0);
}
mkdirSync(dest, { recursive: true });
for (const f of readdirSync(src)) {
  if (wanted.some((w) => f.startsWith(w))) cpSync(join(src, f), join(dest, f));
}
console.log('[face-models] copied to public/models');
