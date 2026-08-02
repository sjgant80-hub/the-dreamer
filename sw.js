// sw.js — minimal offline shell. the-dreamer dreams entirely on your machine; once loaded it works offline.
const CACHE = 'the-dreamer-v1';
const ASSETS = ['./', './index.html', './dreamer.mjs?v=1', './manifest.webmanifest'];   // ?v=1 must match the import in index.html
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request).then(res => { const c = res.clone(); caches.open(CACHE).then(k => k.put(e.request, c)); return res; }).catch(() => caches.match('./index.html'))));
});
