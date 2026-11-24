'use server';
import { z } from 'zod';
import { requireUserOrThrow } from '../current-user';
import { act, formObject, type ActionState } from '../action';
import { UserError } from '../errors';
import {
  addHoliday,
  postAnnouncement,
  removeHoliday,
  setSheetId,
  updateAnnouncement,
  updatePunchSettings,
  updateShift,
  upsertOffice,
} from '../services/company';
import { upsertLeaveType } from '../services/leave';
import { registerKiosk, revokeKiosk } from '../services/kiosk';
import { syncToSheets } from '../services/sheets';
import { isISODate } from '@/lib/dates';

export async function addHolidayAction(_: ActionState, fd: FormData) {
  return act(async () => {
    const v = z
      .object({
        date: z.string().refine(isISODate, 'Enter a valid date.'),
        name: z.string().trim().min(2, 'Name the holiday.').max(80),
        officeId: z.string().optional(),
      })
      .parse(formObject(fd));
    await addHoliday(await requireUserOrThrow(), {
      date: v.date,
      name: v.name,
      officeId: v.officeId || null,
    });
    return 'Holiday added.';
  });
}

export async function removeHolidayAction(_: ActionState, fd: FormData) {
  return act(async () => {
    await removeHoliday(await requireUserOrThrow(), z.string().parse(fd.get('id')));
    return 'Holiday removed.';
  });
}

export async function postAnnouncementAction(_: ActionState, fd: FormData) {
  return act(async () => {
    const v = z
      .object({
        title: z.string().trim().min(3, 'Add a title.').max(120),
        body: z.string().trim().min(3, 'Add a message.').max(4000),
      })
      .parse(formObject(fd));
    await postAnnouncement(await requireUserOrThrow(), { ...v, pinned: fd.get('pinned') === 'on' });
    return 'Announcement posted.';
  });
}

export async function announcementAction(_: ActionState, fd: FormData) {
  return act(async () => {
    const op = String(fd.get('op'));
    await updateAnnouncement(
      await requireUserOrThrow(),
      z.string().parse(fd.get('id')),
      op === 'remove' ? { remove: true } : { pinned: op === 'pin' },
    );
    return 'Updated.';
  });
}

export async function officeAction(_: ActionState, fd: FormData) {
  return act(async () => {
    const v = z
      .object({
        id: z.string().optional(),
        code: z
          .string()
          .trim()
          .toUpperCase()
          .regex(/^[A-Z0-9-]{2,10}$/, 'Code: 2–10 letters or digits.'),
        name: z.string().trim().min(2, 'Name the office.').max(80),
        lat: z.coerce.number().min(-90).max(90),
        lng: z.coerce.number().min(-180).max(180),
        radiusM: z.coerce.number().int().min(50, 'Radius at least 50 m.').max(5000),
      })
      .parse(formObject(fd));
    await upsertOffice(await requireUserOrThrow(), {
      ...v,
      id: v.id || undefined,
      faceEnabled: fd.get('faceEnabled') === 'on',
      geoEnabled: fd.get('geoEnabled') === 'on',
    });
    return 'Office saved.';
  });
}

export async function shiftAction(_: ActionState, fd: FormData) {
  return act(async () => {
    const v = z
      .object({
        start: z.string(),
        end: z.string(),
        lateAfter: z.string(),
        shortDayHours: z.coerce.number().min(1).max(12),
      })
      .parse(formObject(fd));
    await updateShift(await requireUserOrThrow(), v);
    return 'Shift saved. New punches use these rules.';
  });
}

export async function punchSettingsAction(_: ActionState, fd: FormData) {
  return act(async () => {
    const threshold = z.coerce.number().min(0.2).max(0.8).parse(fd.get('faceThreshold'));
    const coordsDays = z.coerce.number().int().min(7).max(3650).parse(fd.get('coordsDays'));
    await updatePunchSettings(
      await requireUserOrThrow(),
      {
        web: fd.get('web') === 'on',
        geo: fd.get('geo') === 'on',
        face: fd.get('face') === 'on',
        kiosk: fd.get('kiosk') === 'on',
        faceThreshold: threshold,
      },
      coordsDays,
    );
    return 'Punch rules saved.';
  });
}

export async function leaveTypeAction(_: ActionState, fd: FormData) {
  return act(async () => {
    const v = z
      .object({
        code: z
          .string()
          .trim()
          .toUpperCase()
          .regex(/^[A-Z]{2,4}$/, 'Code: 2–4 letters.'),
        name: z.string().trim().min(3).max(40),
        annualDays: z.coerce.number().int().min(0).max(60),
        carryForward: z.coerce.number().int().min(0).max(60),
      })
      .parse(formObject(fd));
    await upsertLeaveType(await requireUserOrThrow(), { ...v, active: fd.get('active') !== 'off' });
    return 'Leave type saved.';
  });
}

export async function registerKioskAction(_: ActionState, fd: FormData) {
  return act(async () => {
    const v = z
      .object({
        officeId: z.string().min(1, 'Choose an office.'),
        name: z.string().trim().min(2, 'Name the device.').max(60),
      })
      .parse(formObject(fd));
    const { device, token } = await registerKiosk(await requireUserOrThrow(), v.officeId, v.name);
    return {
      message: 'Kiosk registered. Copy the link now; it is shown only once.',
      data: { url: `/kiosk/${device.id}?k=${token}` },
    };
  });
}

export async function revokeKioskAction(_: ActionState, fd: FormData) {
  return act(async () => {
    await revokeKiosk(await requireUserOrThrow(), z.string().parse(fd.get('id')));
    return 'Kiosk revoked. Its codes stop working now.';
  });
}

export async function linkSheetAction(_: ActionState, fd: FormData) {
  return act(async () => {
    const raw = String(fd.get('sheet') ?? '').trim();
    const m = raw.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
    const id = m ? m[1]! : raw;
    if (!/^[a-zA-Z0-9_-]{25,}$/.test(id)) throw new UserError('Paste the sheet link or its ID.');
    await setSheetId(await requireUserOrThrow(), id);
    return 'Sheet linked.';
  });
}

export async function syncNowAction(_: ActionState) {
  return act(async () => {
    const results = await syncToSheets(await requireUserOrThrow());
    const failed = results.filter((r) => !r.ok);
    return {
      message: failed.length ? `${failed.length} tab(s) failed.` : `All ${results.length} tabs synced.`,
      data: { results },
    };
  });
}
