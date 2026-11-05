// Service Worker（アプリ本体を端末に保存して、圏外でも起動できるようにする仕組み）。
//
// このファイルはそのままでは使わず、`npm run build` のときに
// 下の2つの「__〜__」の部分が実際の値に置き換えられて dist/sw.js になる
// （置き換えるのは scripts/serviceWorkerPlugin.js）。
//
// 予報データ（Open-Meteo）はここでは保存しない。
// 予報はアプリ側（localStorage）で保存したものを使う。

/* global self, caches, fetch */

// 保存するファイルの一覧（index.html・JS・CSS・アイコンなど）
const PRECACHE_FILES = ["apple-touch-icon-180x180.png","assets/index-DdliLQHD.css","assets/index-lQulD_N6.js","favicon.ico","icon.svg","index.html","manifest.webmanifest","maskable-icon-512x512.png","pwa-192x192.png","pwa-512x512.png","pwa-64x64.png"]
// 中身が変わるたびに変わる番号。新しい版を公開すると、保存場所ごと入れ替わる
const CACHE_NAME = 'astro-dashboard-' + "73d489eda834"

// インストール時：アプリ本体のファイルをまとめて保存する
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_FILES))
      // 新しい版は待たずにすぐ使い始める（次に開いたときに新しい版になる）
      .then(() => self.skipWaiting())
  )
})

// 有効化時：古い版で保存したファイルを削除する
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter((name) => name.startsWith('astro-dashboard-') && name !== CACHE_NAME)
            .map((name) => caches.delete(name))
        )
      )
      .then(() => self.clients.claim())
  )
})

// 通信が発生したとき：保存済みのアプリ本体があればそれを返す（圏外でも起動できる）
self.addEventListener('fetch', (event) => {
  const request = event.request
  const url = new URL(request.url)

  // 予報データなど、他のサイトへの通信には手を出さない
  if (request.method !== 'GET' || url.origin !== self.location.origin) {
    return
  }

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME)
      // 画面そのもの（URLを開いたとき）は、保存済みの index.html を返す
      if (request.mode === 'navigate') {
        const page = await cache.match('index.html')
        if (page) return page
      }
      const cached = await cache.match(request, { ignoreSearch: true })
      return cached ?? fetch(request)
    })()
  )
})
