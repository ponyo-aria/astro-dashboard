// 取得した予報データを端末内に保存する（圏外でも最後の予報を表示するため）。
// 前回取得から10分以内なら再取得しない、という判定にも使う。

const CACHE_KEY = 'astro-dashboard.forecastCache.v1'
export const CACHE_FRESH_MS = 10 * 60 * 1000 // 10分

/**
 * 保存されている予報キャッシュを読み込む。
 * 形：{ fetchedAt: number(ミリ秒), results: { msm: [...], ecmwf: [...] } }
 */
export function loadForecastCache() {
  const raw = localStorage.getItem(CACHE_KEY)
  if (!raw) {
    return null
  }
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

/**
 * 予報を端末に保存する。保存場所がいっぱいなどで保存できなかったときは false を返す
 * （取得した予報はそのまま画面に出せるので、例外にはしない）。
 */
export function saveForecastCache(cache) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache))
    return true
  } catch {
    return false
  }
}

/** 前回取得から10分以内（＝まだ新しい）かどうか。 */
export function isCacheFresh(cache, now = Date.now()) {
  if (!cache) {
    return false
  }
  return now - cache.fetchedAt < CACHE_FRESH_MS
}
