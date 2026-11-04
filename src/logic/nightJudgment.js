// トップ画面・モデル比較画面で共通して使う、「地点・夜ごとの総合判定」のまとめ役。

import { createObserver, computeNightInfo } from './astronomy.js'
import { judgeNight, checkLowCloudRisk } from './judgment.js'

export const NIGHT_COUNT = 7

export const STATUS_LABELS = {
  go: '◎ 可',
  split: '△ 割れ',
  no_go: '× 不可',
  reference_go: '参考：可',
  reference_no_go: '参考：不可',
  no_dark_time: '暗い時間なし',
  no_data: 'データなし',
}

// 判定を一目で見分けられるよう、状態ごとに色分けするためのCSSクラス
export const STATUS_CLASSES = {
  go: 'judgment-go',
  split: 'judgment-split',
  no_go: 'judgment-no-go',
  reference_go: 'judgment-reference-go',
  reference_no_go: 'judgment-reference-no-go',
  no_dark_time: 'judgment-neutral',
  no_data: 'judgment-neutral',
}

export function findForecastForLocation(cache, modelKey, locationId) {
  return cache?.results?.[modelKey]?.find((r) => r.locationId === locationId)
}

/** 1地点・1夜ぶんの、天文情報＋総合判定をまとめて求める。 */
export function computeNightJudgment(location, nightDate, cache) {
  const observer = createObserver(location.lat, location.lng, location.elevation ?? 0)
  const info = computeNightInfo(observer, nightDate)

  const msmForecast = findForecastForLocation(cache, 'msm', location.id)
  const ecmwfForecast = findForecastForLocation(cache, 'ecmwf', location.id)

  if (!msmForecast && !ecmwfForecast) {
    return { info, judgment: { status: 'no_data', lowCloudRisk: false } }
  }

  const lowCloudRisk = ecmwfForecast
    ? checkLowCloudRisk(
        [ecmwfForecast.north, ecmwfForecast.east, ecmwfForecast.south, ecmwfForecast.west].map(
          (p) => p?.hourly
        ),
        info.darkIntervals
      )
    : false

  const judgment = judgeNight({
    nightInfo: info,
    msmHourly: msmForecast?.center?.hourly,
    ecmwfHourly: ecmwfForecast?.center?.hourly,
    lowCloudRisk,
  })

  return { info, judgment }
}
