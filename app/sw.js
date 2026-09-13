/* ===== Service Worker：PWA 离线支持 =====
   缓存分两桶：
     · SHELL：站点自身（HTML / CSS / JS / manifest / 图标），install 时预缓存；
       静态资源都带 ?v=N 版本号 → 命中即返回（cache-first），改版后 URL 变化自然走新缓存。
     · RUNTIME：运行时「文本类」数据（课程包 JSON / 课文 content / LRC 字幕 / data/*.json），
       stale-while-revalidate：先回缓存，后台静默更新；跨域音频不入此桶（体积大，
       由 js/data/cache.js 存 IndexedDB，播放走本地 blob:）。
   导航请求（打开页面）：network-first，失败回退缓存的 index.html → 离线也能打开。
   ⚠ 改了 app/ 下的静态资源后，把 VERSION 与 PRECACHE 里的 ?v= 一起 +1（旧缓存会在 activate 清掉）。 */

var VERSION = 'langstu-v38';
var SHELL = VERSION + '-shell';
var RUNTIME = VERSION + '-rt';
var RT_MAX = 400;   /* 运行时文本桶上限（条），超出按插入顺序淘汰 */

var PRECACHE = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './css/app.css?v=38',
  './css/v12.css?v=38',
  './css/textbook.css?v=38',
  './css/split.css?v=38',
  './css/library.css?v=38',
  './js/data/store.js?v=38',
  './js/data/registry.js?v=38',
  './js/data/cache.js?v=38',
  './js/zip.js?v=38',
  './js/data/prompt.js?v=38',
  './js/app.js?v=38',
  './js/library.js?v=38',
  './js/pwa.js?v=38'
];

/* ---------- 生命周期 ---------- */
self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(SHELL).then(function (c) {
      /* 逐条 add 且单条失败不中断（某资源 404 不应拖垮整个 SW） */
      return Promise.all(PRECACHE.map(function (u) {
        /* cache:'reload' 绕过 HTTP 缓存，确保拿到最新文件 */
        return c.add(new Request(u, { cache: 'reload' })).catch(function (err) {
          console.warn('[sw] precache 失败（忽略）：', u, err);
        });
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        if (k !== SHELL && k !== RUNTIME) return caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('message', function (e) {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});

/* ---------- 策略 ---------- */
function sameOrigin(url) { return url.origin === self.location.origin; }

function isTextUrl(url) {
  return /\.(json|lrc|txt|srt|vtt)(\?|$)/i.test(url.pathname);
}

/* 命中任意缓存直接返回（预缓存桶里的版本化资源天然 cache-first） */
function anyMatch(req) {
  return caches.match(req, { ignoreSearch: false });
}

function staleWhileRevalidate(req) {
  return caches.open(RUNTIME).then(function (c) {
    return c.match(req).then(function (hit) {
      var net = fetch(req).then(function (res) {
        /* 不透明响应无法校验内容，不缓存 */
        if (res && res.ok && res.type !== 'opaque') {
          var copy = res.clone();
          c.put(req, copy).then(function () { trimRuntime(c); }).catch(function () { });
        }
        return res;
      }).catch(function (err) {
        if (hit) return hit;          /* 断网且有旧缓存 → 用旧的 */
        throw err;
      });
      return hit || net;
    });
  });
}

function trimRuntime(c) {
  c.keys().then(function (keys) {
    if (keys.length <= RT_MAX) return;
    return Promise.all(keys.slice(0, keys.length - RT_MAX).map(function (k) { return c.delete(k); }));
  }).catch(function () { });
}

/* 导航：网络优先，失败回退缓存的 index.html（离线打开入口） */
function navigate(req) {
  return fetch(req).then(function (res) {
    if (res && res.ok) {
      var copy = res.clone();
      caches.open(SHELL).then(function (c) { c.put('./index.html', copy).catch(function () { }); }).catch(function () { });
    }
    return res;
  }).catch(function () {
    return caches.match('./index.html').then(function (hit) {
      return hit || new Response('<h1>离线</h1><p>首次使用需要联网加载一次页面。</p>',
        { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    });
  });
}

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;

  var url;
  try { url = new URL(req.url); } catch (err) { return; }
  if (!/^https?:$/.test(url.protocol)) return;

  /* 音频拖动 / 流式请求带 Range：放行给浏览器，避免破坏 seek */
  if (req.headers.has('range')) return;

  /* 页面导航：网络优先，离线回缓存 */
  if (req.mode === 'navigate') { e.respondWith(navigate(req)); return; }

  if (sameOrigin(url)) {
    /* 预缓存的静态资源命中即返回；未命中（如 data/*.json）走 SWR 并写入运行时桶 */
    e.respondWith(
      anyMatch(req).then(function (hit) {
        return hit || staleWhileRevalidate(req);
      })
    );
    return;
  }

  /* 跨域：只拦「文本类」数据（课程包 / 课文 / 字幕），音频视频直接放行 */
  if (isTextUrl(url)) {
    e.respondWith(
      staleWhileRevalidate(req).catch(function () { return fetch(req); })
    );
  }
});
