/* Firebase Cloud Messaging service worker for Streaks reminders.
 *
 * Files in public/ are served as-is and cannot read environment variables, so the page
 * passes the (public, non-secret) Firebase web config in this script's query string
 * when it registers the worker. See src/lib/push.ts.
 *
 * Background messages carry a `notification` payload, which the Firebase SDK shows
 * automatically; clicking it opens the link the server set (APP_URL/today).
 */
/* global importScripts, firebase */
importScripts("https://www.gstatic.com/firebasejs/13.1.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/13.1.0/firebase-messaging-compat.js");

const params = new URL(self.location.href).searchParams;
const config = {
  apiKey: params.get("apiKey"),
  projectId: params.get("projectId"),
  messagingSenderId: params.get("messagingSenderId"),
  appId: params.get("appId"),
};

if (config.apiKey && config.projectId && config.messagingSenderId && config.appId) {
  firebase.initializeApp(config);
  firebase.messaging();
}

// Fallback for notifications without a link: focus an open Streaks tab or open Today.
self.addEventListener("notificationclick", (event) => {
  if (event.notification.data && event.notification.data.FCM_MSG) return; // handled by the SDK
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const open = clients.find((c) => new URL(c.url).origin === self.location.origin);
      return open ? open.focus() : self.clients.openWindow("/today");
    }),
  );
});
