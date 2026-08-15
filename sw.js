const CACHE = "fivetodo-v18-bravo-dismiss-fix";
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./firebase-config.js",
  "./manifest.webmanifest",
  "./icons/leon-anouk-at-work-180-v4.png",
  "./icons/leon-anouk-at-work-192-v4.png",
  "./icons/leon-anouk-at-work-512-v4.png"
];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS))); self.skipWaiting(); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))); self.clients.claim(); });
self.addEventListener("fetch", e => { if(e.request.method !== "GET") return; e.respondWith(fetch(e.request).catch(() => caches.match(e.request))); });
