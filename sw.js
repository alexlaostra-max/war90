/* Сервис-воркер «Передела»: собирается build.js. Игра работает без сети, обновления подтягиваются при следующем запуске. */
const CACHE = 'peredel-102a189027';
const FILES = ["./","index.html","css/style.css","manifest.webmanifest","js/data.js","js/events.js","js/geo.js","js/engine.js","js/art.js","js/net.js","js/music.js","js/sfx.js","js/ui.js","img/arm-aks.jpg","img/arm-obrez.jpg","img/arm-pm.jpg","img/arm-rpg.jpg","img/arm-svd.jpg","img/car-audi.jpg","img/car-bmw.jpg","img/car-cayenne.jpg","img/car-e65.jpg","img/car-escalade.jpg","img/car-gelik.jpg","img/car-jeep.jpg","img/car-lc100.jpg","img/car-merc.jpg","img/car-nine.jpg","img/car-rr.jpg","img/car-uaz.jpg","img/car-w220.jpg","img/car-x5.jpg","img/vest.jpg","icons/apple-180.png","icons/icon-192.png","icons/icon-512.png","icons/maskable-512.png"];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || u.pathname.includes('/api/')) return;
  // сначала сеть (свежая версия), без сети — из кэша
  e.respondWith(fetch(e.request).then(r => { if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); } return r; }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('./'))));
});
