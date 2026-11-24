'use server';
import { requireUserOrThrow } from '../current-user';
import { act, type ActionState } from '../action';
import { withdrawFace } from '../services/face';

export async function withdrawFaceAction(_: ActionState) {
  return act(async () => {
    await withdrawFace(await requireUserOrThrow());
    return 'Consent withdrawn and your face template deleted.';
  });
}
