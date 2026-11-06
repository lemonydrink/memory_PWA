// Authentication now requires the server. Remove all old app-shell caches.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => {
 event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('redsheet-')).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// No fetch handler: no cached documents or credentials can bypass server checks.
