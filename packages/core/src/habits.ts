import { db } from "./admin";
import { habitRef } from "./checkins";

/**
 * Deletes a habit and everything under it (checkIns, freezeUses). Firestore does not
 * cascade, so `recursiveDelete` walks the subcollections. Deleting a habit that is
 * already gone is not an error.
 */
export async function deleteHabitFor(uid: string, habitId: string): Promise<{ deleted: boolean }> {
  const ref = habitRef(uid, habitId);
  const snap = await ref.get();
  await db().recursiveDelete(ref);
  return { deleted: snap.exists };
}
