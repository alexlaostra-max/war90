// Сборка: index.html (обычная страница со ссылками на файлы), dist/artifact.html (всё в одном файле),
// manifest.webmanifest и sw.js (установка на телефон и игра без сети)
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const rd = f => fs.readFileSync(path.join(__dirname, f), 'utf8');
const JS = ['data', 'events', 'geo', 'engine', 'art', 'net', 'music', 'sfx', 'ui'];
const FONTS = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=PT+Mono&family=PT+Sans:wght@400;700&family=Russo+One&display=swap">';
const PWA = '<link rel="manifest" href="manifest.webmanifest">\n<meta name="theme-color" content="#15121a">\n<link rel="icon" href="icons/icon-192.png">\n<link rel="apple-touch-icon" href="icons/apple-180.png">\n<meta name="apple-mobile-web-app-capable" content="yes">\n<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">\n<meta name="apple-mobile-web-app-title" content="Передел">';
// Telegram Mini App: скрипт Телеграма грузится, только если игру открыли из Телеграма
const TG = '<script>if (/tgWebApp/.test(location.hash + location.search)) document.write(\'<script src="https://telegram.org/js/telegram-web-app.js"><\\/script>\');</script>';
const SW_REG = '<script>if (\'serviceWorker\' in navigator && location.protocol === \'https:\') navigator.serviceWorker.register(\'sw.js\');</script>';
const body = rd('src/body.html');

fs.writeFileSync(path.join(__dirname, 'index.html'),
  '<!doctype html>\n<html lang="ru">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n<title>Передел</title>\n' + PWA + '\n' + TG + '\n' + FONTS +
  '\n<link rel="stylesheet" href="css/style.css">\n<style>body{margin:0}[hidden]{display:none!important}</style>\n</head>\n<body>\n' + body +
  JS.map(f => '<script src="js/' + f + '.js"></script>').join('\n') + '\n' + SW_REG + '\n</body>\n</html>\n');

fs.writeFileSync(path.join(__dirname, 'manifest.webmanifest'), JSON.stringify({
  name: 'Передел', short_name: 'Передел', description: 'Стратегия про Москву 1991–2007',
  lang: 'ru', start_url: './', scope: './', display: 'standalone', orientation: 'any',
  background_color: '#15121a', theme_color: '#15121a',
  icons: [
    { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
    { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
  ]
}, null, 1) + '\n');

// сервис-воркер: версия — хэш всех файлов игры, чтобы после обновления кэш сменился сам
const files = ['index.html', 'css/style.css', 'manifest.webmanifest'].concat(JS.map(f => 'js/' + f + '.js'),
  fs.readdirSync(path.join(__dirname, 'img')).filter(f => /\.jpg$/.test(f)).map(f => 'img/' + f),
  fs.readdirSync(path.join(__dirname, 'icons')).filter(f => /\.png$/.test(f)).map(f => 'icons/' + f));
const ver = crypto.createHash('sha1'); files.forEach(f => ver.update(fs.readFileSync(path.join(__dirname, f))));
fs.writeFileSync(path.join(__dirname, 'sw.js'), `/* Сервис-воркер «Передела»: собирается build.js. Игра работает без сети, обновления подтягиваются при следующем запуске. */
const CACHE = 'peredel-${ver.digest('hex').slice(0, 10)}';
const FILES = ${JSON.stringify(['./'].concat(files))};
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || u.pathname.includes('/api/')) return;
  // сначала сеть (свежая версия), без сети — из кэша
  e.respondWith(fetch(e.request).then(r => { if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); } return r; }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('./'))));
});
`);

fs.mkdirSync(path.join(__dirname, 'dist'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'dist/artifact.html'),
  '<title>Передел</title>\n<meta name="claude:viewport-fit-sides" content="cover">\n' + FONTS + '\n<style>\n' + rd('css/style.css') + '</style>\n' + body +
  '<script>\n' + JS.map(f => rd('js/' + f + '.js')).join('\n').replace(/img\/[\w.-]+\.jpg/g, f => 'data:image/jpeg;base64,' + fs.readFileSync(path.join(__dirname, f)).toString('base64')) + '</script>\n');
console.log('ok');
