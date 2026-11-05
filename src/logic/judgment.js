// 5.3 判定ロジック：撮影可能時間・撮影可・総合判定・低層雲リスク。
// しきい値はすべて src/config.js に集約する。

import { config } from '../config.js'

// Open-Meteoの時刻文字列（timezone=Asia/Tokyo指定時、例："2026-11-04T00:00"）をDateに変換する
function parseLocalTime(timeString) {
  return new Date(`${timeString}:00+09:00`)
}

function isHourClear(hourly, index) {
  return (
    hourly.cloud_cover_low[index] <= config.cloudCoverClearMax &&
    hourly.cloud_cover_mid[index] <= config.cloudCoverClearMax &&
    hourly.cloud_cover_high[index] <= config.cloudCoverClearMax
  )
}

function isTimeInDarkIntervals(time, darkIntervals) {
  return darkIntervals.some((interval) => time >= interval.start && time < interval.end)
}

/**
 * 1時間ごとの予報データが、夜の暗い時間帯の終わり（dawnStart）まで届いているか確認する。
 * 届いていなければ（MSMの予報範囲外など）falseを返す＝そのモデルのデータは「参考」扱いにする。
 */
export function isForecastCoveringNight(hourly, dawnStart) {
  if (!hourly || !hourly.time || hourly.time.length === 0 || !dawnStart) {
    return false
  }
  const lastTime = parseLocalTime(hourly.time[hourly.time.length - 1])
  return lastTime >= dawnStart
}

/**
 * 暗い時間帯のうち、晴れ（全層が config.cloudCoverClearMax 以下）が連続している最長時間（撮影可能時間）を求める。
 * 1時間ごとのデータなので、その1時間の中央時刻が暗い時間帯に入っているかで判定する。
 */
export function computeClearDarkHours(hourly, darkIntervals) {
  let maxRun = 0
  let currentRun = 0

  hourly.time.forEach((timeString, i) => {
    const hourStart = parseLocalTime(timeString)
    const midpoint = new Date(hourStart.getTime() + 30 * 60 * 1000)
    const isDark = isTimeInDarkIntervals(midpoint, darkIntervals)
    const isClear = isHourClear(hourly, i)

    if (isDark && isClear) {
      currentRun += 1
      maxRun = Math.max(maxRun, currentRun)
    } else {
      currentRun = 0
    }
  })

  return maxRun
}

/** 1モデルぶんの、その夜の判定（撮影可能時間・撮影可かどうか）を求める。 */
export function judgeModelForNight(hourly, dawnStart, darkIntervals) {
  if (!isForecastCoveringNight(hourly, dawnStart)) {
    return { available: false }
  }
  const clearHours = computeClearDarkHours(hourly, darkIntervals)
  return { available: true, clearHours, isGo: clearHours >= config.minClearHours }
}

/**
 * 周辺4地点（北東南西）のいずれかで、暗い時間帯に低層雲が30%を超えていれば「低層雲リスクあり」。
 * @param {object[]} surroundingHourlyList 周辺4地点ぶんの hourly データの配列
 */
export function checkLowCloudRisk(surroundingHourlyList, darkIntervals) {
  return surroundingHourlyList.some((hourly) => {
    if (!hourly || !hourly.time) return false
    return hourly.time.some((timeString, i) => {
      const hourStart = parseLocalTime(timeString)
      const midpoint = new Date(hourStart.getTime() + 30 * 60 * 1000)
      return (
        isTimeInDarkIntervals(midpoint, darkIntervals) &&
        hourly.cloud_cover_low[i] > config.lowCloudRiskThreshold
      )
    })
  })
}

/**
 * その夜の総合判定を求める。
 * status: 'no_dark_time' | 'go'(◎) | 'split'(△) | 'no_go'(×) | 'reference_go' | 'reference_no_go' | 'no_data'
 */
export function judgeNight({ nightInfo, msmHourly, ecmwfHourly, lowCloudRisk = false }) {
  if (nightInfo.darkHours < config.minClearHours) {
    return { status: 'no_dark_time', lowCloudRisk }
  }

  const msm = msmHourly
    ? judgeModelForNight(msmHourly, nightInfo.dawnStart, nightInfo.darkIntervals)
    : { available: false }
  const ecmwf = ecmwfHourly
    ? judgeModelForNight(ecmwfHourly, nightInfo.dawnStart, nightInfo.darkIntervals)
    : { available: false }

  if (msm.available) {
    if (!ecmwf.available) {
      return { status: msm.isGo ? 'go' : 'no_go', msm, ecmwf, lowCloudRisk }
    }
    if (msm.isGo && ecmwf.isGo) {
      return { status: 'go', msm, ecmwf, lowCloudRisk }
    }
    if (!msm.isGo && !ecmwf.isGo) {
      return { status: 'no_go', msm, ecmwf, lowCloudRisk }
    }
    return { status: 'split', msm, ecmwf, lowCloudRisk }
  }

  // MSMの予報範囲外（5〜7夜目）：ECMWFのみで「参考」判定
  if (ecmwf.available) {
    return { status: ecmwf.isGo ? 'reference_go' : 'reference_no_go', ecmwf, lowCloudRisk }
  }

  return { status: 'no_data', lowCloudRisk }
}
