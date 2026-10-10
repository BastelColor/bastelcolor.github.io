/**
 * サイトの service worker（ホーム画面に追加したときなどに、アプリのように開けるようにする）。
 * 公開するとき（npm run build のあと）に scripts/write-sw.mjs が、この中の VERSION と PRECACHE を
 * 埋めて dist/client/sw.js に書き出す。ブラウザでの登録は components/service-worker.tsx。
 *
 * - トップのページと、それを表示するのに要るもの（PRECACHE）は、最初に開いたときにまとめて取っておく。
 *   一度開けば、電波がなくてもトップは表示できる
 * - ページ（HTML）は、いつもネットから取る（新しく公開したものがすぐ見える）。
 *   つながらないときだけ、取っておいたもの → それも無ければトップを出す
 * - 名前に中身の印（ハッシュ）が入ったプログラム・CSS（/_next/static/）は、中身が変わらないので、取っておいたものを使う
 * - 画像・フォント・3D モデルは、取っておいたものをすぐ出し、裏でネットから取り直しておく
 * - ほかのサイト（YouTube・アクセス数など）へのやりとりには、手を出さない
 */

const VERSION = 'dev';
const PRECACHE = [];

const SHELL = `yzmo-shell-${VERSION}`;
const RUNTIME = 'yzmo-runtime';
const MODELS = 'yzmo-models';
/** 取っておく数の上限（古いものから捨てる）。3D モデルは大きいので少なめに */
const RUNTIME_LIMIT = 300;
const MODELS_LIMIT = 6;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter((name) => name.startsWith('yzmo-shell-') && name !== SHELL)
            .map((name) => caches.delete(name)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request));
    return;
  }
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(cacheFirst(request));
    return;
  }
  if (url.pathname.startsWith('/models/')) {
    event.respondWith(staleWhileRevalidate(request, MODELS, MODELS_LIMIT));
    return;
  }
  if (
    /\.(?:webp|png|jpe?g|gif|svg|ico|woff2|vrma?|bin)$/.test(url.pathname) ||
    url.pathname.startsWith('/fonts/')
  ) {
    event.respondWith(staleWhileRevalidate(request, RUNTIME, RUNTIME_LIMIT));
    return;
  }
  // そのほか（ページの中身のデータ .txt など）は、ネットを先に
  event.respondWith(networkFirst(request));
});

/** ネットから取り、取れたら取っておく。つながらなければ、取っておいたもの */
async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) await put(RUNTIME, request, response.clone(), RUNTIME_LIMIT);
    return response;
  } catch (error) {
    const cached = await caches.match(request, { ignoreSearch: true });
    if (cached) return cached;
    if (request.mode === 'navigate') {
      const home = await caches.match('/');
      if (home) return home;
    }
    throw error;
  }
}

/** 取っておいたものがあればそれを、なければネットから取って取っておく */
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) await put(RUNTIME, request, response.clone(), RUNTIME_LIMIT);
  return response;
}

/** 取っておいたものをすぐ返し、裏でネットから取り直しておく */
async function staleWhileRevalidate(request, cacheName, limit) {
  const cached = await caches.match(request);
  const fresh = fetch(request).then(async (response) => {
    if (response.ok) await put(cacheName, request, response.clone(), limit);
    return response;
  });
  if (cached) {
    fresh.catch(() => {});
    return cached;
  }
  return fresh;
}

/** 取っておく。上限を超えたら、古いものから捨てる */
async function put(cacheName, request, response, limit) {
  // 一部だけ届いたもの（動画の途中など）は取っておかない
  if (response.status !== 200) return;
  const cache = await caches.open(cacheName);
  await cache.put(request, response);
  const keys = await cache.keys();
  for (const key of keys.slice(0, Math.max(0, keys.length - limit))) {
    await cache.delete(key);
  }
}
