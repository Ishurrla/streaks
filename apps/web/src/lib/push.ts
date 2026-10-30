"use client";

import { deleteToken, getMessaging, getToken, isSupported, onMessage } from "firebase/messaging";
import { callApi } from "./api";
import { pushApp, realPushAvailable, vapidKey, webConfig } from "./firebase";

// The token this browser registered, so it can be removed on log out or switch-off.
const STORAGE_KEY = "streaks-push-token";

// Its own scope, so the worker never controls (or caches) the app's pages.
const SW_SCOPE = "/firebase-cloud-messaging-push-scope";

export type PushSupport = "supported" | "unsupported" | "blocked";

/** Whether this browser can show web push, and whether the user has blocked it. */
export async function pushSupport(): Promise<PushSupport> {
  if (typeof window === "undefined" || !("Notification" in window) || !("serviceWorker" in navigator)) {
    return "unsupported";
  }
  if (realPushAvailable && !(await isSupported().catch(() => false))) return "unsupported";
  return Notification.permission === "denied" ? "blocked" : "supported";
}

export function deviceToken(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function rememberToken(token: string | null) {
  try {
    if (token) localStorage.setItem(STORAGE_KEY, token);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Without storage we just cannot remove this device's token on log out.
  }
}

/** Registers the messaging worker, passing the public config in its URL. */
async function registerWorker(): Promise<ServiceWorkerRegistration> {
  const query = new URLSearchParams({
    apiKey: webConfig.apiKey ?? "",
    projectId: webConfig.projectId ?? "",
    messagingSenderId: webConfig.messagingSenderId ?? "",
    appId: webConfig.appId ?? "",
  });
  return navigator.serviceWorker.register(`/firebase-messaging-sw.js?${query}`, { scope: SW_SCOPE });
}

export class PushBlockedError extends Error {}

/**
 * Asks for notification permission and registers this device for reminders. Must be
 * called straight from a click: the permission prompt is requested before any other
 * await, because browsers only allow it in response to a user gesture.
 */
export async function enablePushOnThisDevice(): Promise<void> {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new PushBlockedError(permission);

  let token: string;
  if (realPushAvailable) {
    const registration = await registerWorker();
    token = await getToken(getMessaging(pushApp), { vapidKey, serviceWorkerRegistration: registration });
  } else {
    // Emulator mode: FCM is not emulated, so register a stand-in token. The emulated
    // reminders job logs what it would send instead of sending.
    token = deviceToken() ?? `emulator-${crypto.randomUUID()}`;
  }
  await callApi("register-push-token", { token });
  rememberToken(token);
  if (process.env.NODE_ENV === "development") console.info("[push] registered token", token);
}

/** Removes this device's token, if it registered one. Never throws. */
export async function disablePushOnThisDevice(): Promise<void> {
  const token = deviceToken();
  if (!token) return;
  try {
    await callApi("remove-push-token", { token });
    if (realPushAvailable) await deleteToken(getMessaging(pushApp));
  } catch {
    // The server drops tokens FCM reports as dead, so a leftover is cleaned up later.
  } finally {
    rememberToken(null);
  }
}

/** Calls `show` for messages that arrive while the app is open and in front. */
export async function listenForForegroundMessages(show: (body: string) => void): Promise<() => void> {
  if (!realPushAvailable || !(await isSupported().catch(() => false))) return () => {};
  if (Notification.permission !== "granted") return () => {};
  return onMessage(getMessaging(pushApp), (payload) => {
    const body = payload.notification?.body;
    if (body) show(body);
  });
}
