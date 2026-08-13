/* 发条农庄 - Service Worker
   策略：导航请求网络优先（在线永远拿最新），静态资源 stale-while-revalidate，
   /api/ 一律直连不缓存；离线时导航回退到 offline.html。 */
'use strict';

const CACHE = 'pastoral-create-v1';
const SHELL = ['./', './offline.html'];
const OFFLINE = './offline.html';
const API_PREFIX = '/api/';

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  // 云存档 API 永不缓存
  if (url.pathname.indexOf(API_PREFIX) === 0) return;

  // 导航：网络优先，失败回退缓存壳，再失败回退离线页
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req.url, copy)).catch(() => {});
        return res;
      }).catch(() =>
        caches.match(req.url).then(hit => hit || caches.match('./').then(root => root || caches.match(OFFLINE)))
      )
    );
    return;
  }

  // 静态资源：stale-while-revalidate（版本参数可正常换新）
  e.respondWith(
    caches.match(req).then(hit => {
      const refresh = fetch(req).then(res => {
        if (res && res.ok){
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req.url, copy)).catch(() => {});
        }
        return res;
      }).catch(() => null);
      return hit || refresh;
    })
  );
});
