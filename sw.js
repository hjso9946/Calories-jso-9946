/* 卡路里 PWA Service Worker */
const CACHE = 'calorie-v4';
const ASSETS = [
  './',
  'index.html',
  'weight.html',
  'spin.html',
  'app.js',
  'manifest.json',
  'icon-192.png',
  'icon-512.png',
  'icon-96.png',
  'apple-touch-icon.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // 云端同步 / 数据始终走网络
  if (url.hostname.includes('githubusercontent') || url.hostname.includes('api.github.com')) return;
  if (e.request.method !== 'GET') return;

  // 页面/脚本：网络优先（保证更新能生效），断网才用缓存
  e.respondWith(
    fetch(e.request).then((res) => {
      if (res && res.ok && url.origin === self.location.origin) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
      }
      return res;
    }).catch(() => caches.match(e.request))
  );
});
