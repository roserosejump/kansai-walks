// 策略：
//  1. 同網域檔案（頁面、CSS、data/*.json）→ network-first，但最多等 3 秒。
//     日本的訊號不穩時，與其讓畫面一直轉圈，不如先拿上次成功的快取；網路回來的結果仍會偷偷更新快取。
//  2. 字型（fonts.googleapis.com / fonts.gstatic.com）→ stale-while-revalidate，存在獨立的字型快取。
//     字型檔不會變，先用快取最快；離線時才不會跑版。
// 想強制所有人更新（例如大幅改了資料結構），把 CACHE_NAME 的版本號 +1 即可。
// CACHE_NAME 要跟 index.html 裡的 SW_CACHE_NAME 保持一致
const CACHE_NAME = 'kansai-walks-v4';
const FONT_CACHE = 'kansai-fonts-v1';
const NETWORK_TIMEOUT_MS = 3000;
// 只放固定不太會變的外殼；data/*.json 由 index.html 的 loadData() 直接寫入快取
// （第一次造訪時 Service Worker 還沒接管頁面，這些請求不會經過 fetch 事件，所以要頁面自己存）
const APP_SHELL = ['index.html', 'style.css', 'manifest.json', 'icons/icon-192.png', 'icons/apple-touch-icon.png', 'images/hero.jpg'];
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  const keep = [CACHE_NAME, FONT_CACHE];
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => !keep.includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// 離線又沒有該檔的快取時：頁面導航退回 index.html，其他請求就讓它失敗
function offlineFallback(request) {
  return caches.match(request).then((cached) =>
    cached || (request.mode === 'navigate' ? caches.match('index.html') : Response.error())
  );
}

function networkFirstWithTimeout(request) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (res) => { if (!settled) { settled = true; resolve(res); } };

    // 超過時間還沒回應 → 先給快取（若有）；fetch 繼續跑，回來後只更新快取
    const timer = setTimeout(() => {
      caches.match(request).then((cached) => { if (cached) done(cached); });
    }, NETWORK_TIMEOUT_MS);

    fetch(request)
      .then((res) => {
        clearTimeout(timer);
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        done(res);
      })
      .catch(() => {
        clearTimeout(timer);
        offlineFallback(request).then(done);
      });
  });
}

function staleWhileRevalidate(request) {
  return caches.open(FONT_CACHE).then((cache) =>
    cache.match(request).then((cached) => {
      const refresh = fetch(request)
        .then((res) => {
          // opaque（no-cors 的跨網域回應）看不到 status，但仍然可以存來離線使用
          if (res.ok || res.type === 'opaque') cache.put(request, res.clone());
          return res;
        })
        .catch(() => cached || Response.error());
      return cached || refresh;
    })
  );
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  if (FONT_HOSTS.includes(url.hostname)) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }
  // 其他跨網域（天氣／匯率 API）不快取，離線時交給 index.html 裡既有的 try/catch 顯示參考值
  if (url.origin !== self.location.origin) return;

  event.respondWith(networkFirstWithTimeout(request));
});
