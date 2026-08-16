/* 发条农庄 - Service Worker
   策略：导航请求缓存优先（离线/弱网秒开，后台静默换新），静态资源 stale-while-revalidate，
   /api/ 一律直连不缓存；离线时导航回退到 offline.html。
   更新：新版本安装后不自动接管，等待页面弹窗确认（SKIP_WAITING）再激活刷新。 */
'use strict';

const CACHE = 'pastoral-create-v2';
const SHELL = ['./', './offline.html'];
const OFFLINE = './offline.html';
const API_PREFIX = '/api/';

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(SHELL)).catch(() => {})   // 缓存失败不阻塞安装
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// 页面点击「立即更新」后通知本 SW 跳过等待、接管页面
self.addEventListener('message', e => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  // 云存档 API 永不缓存
  if (url.pathname.indexOf(API_PREFIX) === 0) return;

  // 导航：缓存优先（忽略 query 参数匹配），命中立即返回；后台拉新并更新缓存；
  // 缓存未命中走网络；网络失败回退离线页
  if (req.mode === 'navigate') {
    e.respondWith(
      caches.match(req.url, { ignoreSearch: true }).then(hit => {
        const refresh = fetch(req).then(res => {
          if (res && res.ok){
            const copy = res.clone();
            caches.open(CACHE).then(c => c.put(req.url, copy)).catch(() => {});
          }
          return res;
        }).catch(() => null);
        if (hit) return hit;
        return refresh.then(res => res ||
          caches.match('./', { ignoreSearch: true }).then(root => root || caches.match(OFFLINE)));
      })
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
