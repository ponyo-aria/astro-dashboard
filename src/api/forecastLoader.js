// 予報（MSM・ECMWF）と、各モデルの更新情報をまとめて取ってきて、端末に保存する。
// ホーム画面とモデル比較画面の「更新」ボタンで共通に使う。

import { fetchForecast, fetchModelUpdateInfo } from './forecast.js'
import { saveForecastCache } from '../storage/forecastCache.js'

/**
 * @returns {Promise<object>} 取得した予報データ（取得に失敗したときは例外を投げる）。
 *   端末に保存できなかったときは notSaved: true が付く
 */
export async function fetchAndSaveForecast(locations) {
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
  const [gsm, aifs, gsmMeta, aifsMeta, ecmwfWind] = (await referenceTasks).map((r) =>
    r.status === 'fulfilled' ? r.value : undefined
  )
  const cache = {
    fetchedAt: Date.now(),
    results: { msm: msmResults, ecmwf: ecmwfResults, gsm, aifs, ecmwfWind },
    modelMeta: { msm: msmMeta, ecmwf: ecmwfMeta, gsm: gsmMeta, aifs: aifsMeta },
  }
  // 保存できなかったときも、取得した予報はそのまま使う（画面に「保存できなかった」と出す）
  if (!saveForecastCache(cache)) cache.notSaved = true
  return cache
}

// 端末が圏外かどうか（ブラウザが「オフライン」と判断しているとき true）
export function isOffline() {
  return typeof navigator !== 'undefined' && navigator.onLine === false
}
