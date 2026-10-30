import { createHash } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { CoreError } from "./errors";
import { db } from "./admin";

/** Document ID for a token: a hash, so the same device always maps to the same doc. */
export function tokenId(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function requireToken(data: unknown): string {
  const token = data !== null && typeof data === "object" ? (data as { token?: unknown }).token : undefined;
  if (typeof token !== "string" || token.length === 0 || token.length > 4096) {
    throw new CoreError("invalid-argument", "token must be an FCM registration token.");
  }
  return token;
}

/**
 * Saves a device's FCM token for this user. A token belongs to one browser, so if
 * another account registered it earlier (someone else signed in on this device),
 * that registration is removed: reminders must not go to the wrong person.
 */
export async function registerPushTokenFor(uid: string, token: string, userAgent: string | undefined) {
  const id = tokenId(token);
  const elsewhere = await db().collectionGroup("pushTokens").where("token", "==", token).get();
  const batch = db().batch();
  for (const doc of elsewhere.docs) {
    if (doc.ref.parent.parent?.id !== uid) batch.delete(doc.ref);
  }
  batch.set(
    db().collection("users").doc(uid).collection("pushTokens").doc(id),
    {
      token,
      userAgent: (userAgent ?? "").slice(0, 300),
      createdAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  await batch.commit();
  return { registered: true };
}

export async function removePushTokenFor(uid: string, token: string) {
  const ref = db().collection("users").doc(uid).collection("pushTokens").doc(tokenId(token));
  const existed = (await ref.get()).exists;
  await ref.delete();
  return { removed: existed };
}
