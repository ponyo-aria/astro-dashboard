// 予報（MSM・ECMWF）と、各モデルの更新情報をまとめて取ってきて、端末に保存する。
// ホーム画面とモデル比較画面の「更新」ボタンで共通に使う。

import { fetchForecast, fetchModelUpdateInfo } from './forecast.js'
import { saveForecastCache } from '../storage/forecastCache.js'

/**
 * onMainReady(cache)：判定に使う MSM・ECMWF が届いた時点で呼ばれる（参考モデルはまだ入っていない）。
 *   画面はここで先に描き直し、参考モデルの到着を待たずに予報を見られるようにする
 * @returns {Promise<object>} 参考モデルまで入った予報データ（MSM・ECMWFの取得に失敗したときは例外を投げる。
 *   時間切れのときは FetchTimeoutError）。端末に保存できなかったときは notSaved: true が付く
 */
export async function fetchAndSaveForecast(locations, { onMainReady } = {}) {
  // 判定に使うモデル（MSM・ECMWF）と、参考モデル（GSM・AIFS）を同時に取りに行く。
  // 参考モデルは取れなくても困らないので、失敗しても全体は失敗にしない（その列が「―」になるだけ）
  // （ECMWF 9km版の風＝詳細画面の最大瞬間風速用も、同じく取れなくても困らない扱い）
  const referenceTasks = Promise.allSettled([
    fetchForecast('gsm', locations),
    fetchForecast('aifs', locations),
    fetchModelUpdateInfo('gsm'),
    fetchModelUpdateInfo('aifs'),
    fetchForecast('ecmwfWind', locations),
  ])
  const [msmResults, ecmwfResults, msmMeta, ecmwfMeta] = await Promise.all([
    fetchForecast('msm', locations),
    fetchForecast('ecmwf', locations),
    fetchModelUpdateInfo('msm'),
    fetchModelUpdateInfo('ecmwf'),
  ])

  // MSM・ECMWFが届いた時点で、いったん保存して画面に渡す
  const mainCache = {
    fetchedAt: Date.now(),
    results: { msm: msmResults, ecmwf: ecmwfResults },
    modelMeta: { msm: msmMeta, ecmwf: ecmwfMeta },
  }
  if (!saveForecastCache(mainCache)) mainCache.notSaved = true
  onMainReady?.(mainCache)

  // 参考モデルが届いたら（または時間切れ・失敗したら）足して保存し直す
  const [gsm, aifs, gsmMeta, aifsMeta, ecmwfWind] = (await referenceTasks).map((r) =>
    r.status === 'fulfilled' ? r.value : undefined
  )
  const cache = {
    fetchedAt: mainCache.fetchedAt,
    results: { ...mainCache.results, gsm, aifs, ecmwfWind },
    modelMeta: { ...mainCache.modelMeta, gsm: gsmMeta, aifs: aifsMeta },
  }
  // 保存できなかったときも、取得した予報はそのまま使う（画面に「保存できなかった」と出す）
  if (!saveForecastCache(cache)) cache.notSaved = true
  return cache
}

// 端末が圏外かどうか（ブラウザが「オフライン」と判断しているとき true）
export function isOffline() {
  return typeof navigator !== 'undefined' && navigator.onLine === false
}
