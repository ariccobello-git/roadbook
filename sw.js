/* Roadbook · service worker: l'app si apre anche senza rete (rete prima, copia salvata come riserva) */
var CACHE = 'roadbook-v34';
var FILES = ['./', 'index.html', 'style.css', 'logic.js', 'ui.js', 'i18n.js', 'api.js', 'common.js', 'xls.js', 'places.js', 'views-run.js', 'views-people.js', 'views-admin.js', 'views-weather.js', 'wxscene.js', 'views-meteo.js', 'views-sos.js', 'sos.js', 'push.js', 'extras.js', 'vendor/qrcode.js', 'vendor/jsqr.js', 'vendor/jspdf.umd.min.js', 'views-pay.js', 'review.js', 'live.js', 'views-report.js', 'app.js', 'manifest.webmanifest', 'icon-180.png', 'icon-192.png', 'icon-512.png'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(FILES); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(fetch(req).then(function (res) {
    if (res && res.ok) { var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(req, copy); }); }
    return res;
  }).catch(function () { return caches.match(req).then(function (r) { return r || caches.match('index.html'); }); }));
});

/* notifiche push per le emergenze (arrivano anche ad app chiusa) */
self.addEventListener('push', function (e) {
  var d = {}; try { d = e.data ? e.data.json() : {}; } catch (x) {}
  e.waitUntil(self.registration.showNotification(d.title || 'Roadbook', {
    body: d.body || '', tag: d.tag || 'sos', renotify: true, requireInteraction: true, icon: 'icon-180.png', badge: 'icon-180.png',
    vibrate: [300, 150, 300, 150, 300], data: { url: d.url || './' }
  }));
});
self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (cs) {
    for (var i = 0; i < cs.length; i++) { if ('focus' in cs[i]) return cs[i].focus(); }
    return self.clients.openWindow((e.notification.data && e.notification.data.url) || './');
  }));
});
