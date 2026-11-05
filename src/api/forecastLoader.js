// 予報（MSM・ECMWF）と、各モデルの更新情報をまとめて取ってきて、端末に保存する。
// ホーム画面とモデル比較画面の「更新」ボタンで共通に使う。

import { fetchForecast, fetchModelUpdateInfo } from './forecast.js'
import { saveForecastCache } from '../storage/forecastCache.js'

/**
 * @returns {Promise<object>} 保存した予報データ（取得に失敗したときは例外を投げる）
 */
export async function fetchAndSaveForecast(locations) {
  // 判定に使うモデル（MSM・ECMWF）と、参考モデル（GSM・AIFS）を同時に取りに行く。
  // 参考モデルは取れなくても困らないので、失敗しても全体は失敗にしない（その列が「―」になるだけ）
  const referenceTasks = Promise.allSettled([
    fetchForecast('gsm', locations),
    fetchForecast('aifs', locations),
    fetchModelUpdateInfo('gsm'),
    fetchModelUpdateInfo('aifs'),
  ])
  const [msmResults, ecmwfResults, msmMeta, ecmwfMeta] = await Promise.all([
    fetchForecast('msm', locations),
    fetchForecast('ecmwf', locations),
    fetchModelUpdateInfo('msm'),
    fetchModelUpdateInfo('ecmwf'),
  ])
  const [gsm, aifs, gsmMeta, aifsMeta] = (await referenceTasks).map((r) =>
    r.status === 'fulfilled' ? r.value : undefined
  )
  const cache = {
    fetchedAt: Date.now(),
    results: { msm: msmResults, ecmwf: ecmwfResults, gsm, aifs },
    modelMeta: { msm: msmMeta, ecmwf: ecmwfMeta, gsm: gsmMeta, aifs: aifsMeta },
  }
  saveForecastCache(cache)
  return cache
}

// 端末が圏外かどうか（ブラウザが「オフライン」と判断しているとき true）
export function isOffline() {
  return typeof navigator !== 'undefined' && navigator.onLine === false
}
