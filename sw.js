const CACHE = "fivetodo-v3-leon-icon";
const ASSETS = [
  "./icons/leon-512-v3.png",
  "./icons/leon-192-v3.png",
  "./icons/leon-apple-180-v3.png",
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./firebase-config.js",
  "./manifest.webmanifest",
  "./icons/apple-touch-icon.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  if(event.request.method !== "GET") return;
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request))
  );
});
self.addEventListener("push", event => {
  let payload = {};

  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }

  const notification = payload.notification || {};
  const data = payload.data || {};

  const title = notification.title || data.title || "FiveTodo";
  const body =
    notification.body ||
    data.body ||
    "In FiveTodo gibt es eine neue Änderung.";

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "./icons/leon-192-v3.png",
      badge: "./icons/leon-192-v3.png",
      data: {
        url: data.url || self.registration.scope
      }
    })
  );
});

self.addEventListener("notificationclick", event => {
  event.notification.close();

  const url =
    event.notification.data?.url ||
    self.registration.scope;

  event.waitUntil(
    clients.openWindow(url)
  );
});
