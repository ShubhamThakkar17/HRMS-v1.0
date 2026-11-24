import 'server-only';
import { z } from 'zod';
import { db, type Tx } from './db';
import { DEFAULT_FACE_THRESHOLD } from '@/lib/face';

export const PunchSettings = z.object({
  web: z.boolean(),
  geo: z.boolean(),
  face: z.boolean(),
  kiosk: z.boolean(),
  faceThreshold: z.number().min(0.2).max(0.8),
});
export type PunchSettings = z.infer<typeof PunchSettings>;

export const RetentionSettings = z.object({ coordsDays: z.number().int().min(7).max(3650) });
export const CompanySettings = z.object({ name: z.string().min(1) });
export const SheetsSettings = z.object({
  sheetId: z.string().default(''),
  lastSyncAt: z.string().default(''),
  lastSyncBy: z.string().default(''),
  lastResults: z
    .array(z.object({ tab: z.string(), ok: z.boolean(), rows: z.number(), error: z.string().optional() }))
    .default([]),
});

const DEFAULTS = {
  punch: { web: true, geo: true, face: true, kiosk: true, faceThreshold: DEFAULT_FACE_THRESHOLD },
  retention: { coordsDays: 90 },
  company: { name: 'Silver Touch' },
  sheets: { sheetId: process.env.GOOGLE_SHEET_ID ?? '', lastSyncAt: '', lastSyncBy: '', lastResults: [] },
};
const SCHEMAS = {
  punch: PunchSettings,
  retention: RetentionSettings,
  company: CompanySettings,
  sheets: SheetsSettings,
};
type Key = keyof typeof DEFAULTS;
type Value<K extends Key> = z.infer<(typeof SCHEMAS)[K]>;

export async function getSetting<K extends Key>(key: K, tx: Tx = db): Promise<Value<K>> {
  const row = await tx.setting.findUnique({ where: { key } });
  const parsed = SCHEMAS[key].safeParse({ ...DEFAULTS[key], ...((row?.value as object) ?? {}) });
  return (parsed.success ? parsed.data : DEFAULTS[key]) as Value<K>;
}

export async function setSetting<K extends Key>(key: K, value: Value<K>, tx: Tx = db): Promise<void> {
  const v = SCHEMAS[key].parse(value);
  await tx.setting.upsert({ where: { key }, create: { key, value: v }, update: { value: v } });
}

export async function getShift(tx: Tx = db) {
  const s = await tx.shift.findFirst({ where: { isDefault: true } });
  return (
    s ?? {
      id: '',
      name: 'General',
      start: '09:30',
      end: '18:30',
      lateAfter: '09:40',
      shortDayHours: 4.5,
      isDefault: true,
    }
  );
}
