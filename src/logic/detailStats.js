// 地点詳細画面で使う数値情報（降水量合計・最低気温・結露リスク・風）の計算。

import { config } from '../config.js'

// Open-Meteoの時刻文字列（timezone=Asia/Tokyo指定時）をDateに変換する
function parseLocalTime(timeString) {
  return new Date(`${timeString}:00+09:00`)
}

function localDateString(date) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' }).format(date)
}

/**
 * 「前日〜当日」の降水量合計を求める（地面のぬかるみ判断用）。
 * nightDateNoonはD日（夜の始まる日）の正午ごろのDate。
 */
export function sumPrecipitation(hourly, nightDateNoon) {
  const todayStr = localDateString(nightDateNoon)
  const yesterdayStr = localDateString(new Date(nightDateNoon.getTime() - 24 * 60 * 60 * 1000))

  let sum = 0
  hourly.time.forEach((t, i) => {
    const dateStr = t.slice(0, 10)
    if (dateStr === todayStr || dateStr === yesterdayStr) {
      sum += hourly.precipitation[i] ?? 0
    }
  })
  return sum
}

/** 夜間（sunset〜sunrise）の最低気温を求める。該当データが無ければnull。 */
export function minNightTemperature(hourly, sunset, sunrise) {
  let min = null
  hourly.time.forEach((t, i) => {
    const time = parseLocalTime(t)
    if (time >= sunset && time <= sunrise) {
      const temp = hourly.temperature_2m[i]
      if (temp != null && (min === null || temp < min)) {
        min = temp
      }
    }
  })
  return min
}

/**
 * 夜間（sunset〜sunrise）の、気温と露点の差が最も小さい（＝結露リスクが最も高い）値を求める。
 * @returns {{ minDiff: number, level: 'high'|'caution'|'low' } | null}
 */
export function dewPointRisk(hourly, sunset, sunrise) {
  let minDiff = null
  hourly.time.forEach((t, i) => {
    const time = parseLocalTime(t)
    if (time >= sunset && time <= sunrise) {
      const temp = hourly.temperature_2m[i]
      const dew = hourly.dew_point_2m[i]
      if (temp != null && dew != null) {
        const diff = temp - dew
        if (minDiff === null || diff < minDiff) {
          minDiff = diff
        }
      }
    }
  })
  if (minDiff === null) {
    return null
  }
  let level
  if (minDiff <= config.dewPointRiskHighMax) {
    level = 'high'
  } else if (minDiff <= config.dewPointRiskCautionMax) {
    level = 'caution'
  } else {
    level = 'low'
  }
  return { minDiff, level }
}

// 夜間（sunset〜sunrise）の、指定した項目の最大値（Open-Meteoからはkm/hで届くので、m/sに直す）
function nightMaxMs(hourly, key, sunset, sunrise) {
  let max = null
  hourly?.time?.forEach((t, i) => {
    const time = parseLocalTime(t)
    if (time >= sunset && time <= sunrise) {
      const v = hourly[key]?.[i]
      if (v != null && (max === null || v > max)) max = v
    }
  })
  return max === null ? null : max / 3.6
}

/**
 * 夜間（sunset〜sunrise）の最大風速・最大瞬間風速を求める。
 * meanHourly：平均の風速に使う予報（MSM。届かない夜はECMWF）
 * gustHourly：最大瞬間風速に使う予報（MSMは瞬間風速を出さないので、ECMWFの9km版）
 * 平均が config.windCautionThreshold 以上、または瞬間が config.gustCautionThreshold 以上で「注意」。
 * @returns {{ maxWindSpeedMs: number|null, maxWindGustMs: number|null, caution: boolean }}
 */
export function nightWindInfo(meanHourly, gustHourly, sunset, sunrise) {
  const maxWindSpeedMs = nightMaxMs(meanHourly, 'wind_speed_10m', sunset, sunrise)
  const maxWindGustMs = nightMaxMs(gustHourly, 'wind_gusts_10m', sunset, sunrise)
  const caution =
    (maxWindSpeedMs !== null && maxWindSpeedMs >= config.windCautionThreshold) ||
    (maxWindGustMs !== null && maxWindGustMs >= config.gustCautionThreshold)
  return { maxWindSpeedMs, maxWindGustMs, caution }
}

/**
 * 夜の中央あたりの時刻における、850hPaの風向き（度、北=0・東=90）を求める。
 * 雲が流れてくる方向の矢印表示に使う（参考情報）。
 */
export function representativeWindDirection850(hourly, sunset, sunrise) {
  if (!sunset || !sunrise) return null
  const midpoint = new Date((sunset.getTime() + sunrise.getTime()) / 2)

  let closestIndex = null
  let closestDiff = Infinity
  hourly.time.forEach((t, i) => {
    const time = parseLocalTime(t)
    const diff = Math.abs(time.getTime() - midpoint.getTime())
    if (diff < closestDiff) {
      closestDiff = diff
      closestIndex = i
    }
  })
  if (closestIndex === null) return null
  return hourly.wind_direction_850hPa?.[closestIndex] ?? null
}

const DIRECTION_LABELS = ['北', '北東', '東', '南東', '南', '南西', '西', '北西']

/** 方位角（度）を「北」「北東」などの日本語ラベルに変換する。 */
export function directionLabel(degrees) {
  if (degrees == null) return null
  const index = Math.round(degrees / 45) % 8
  return DIRECTION_LABELS[index]
}

/**
 * 雲量（%）をグレースケールの色に変換する。
 * 夜空の感覚に合わせて、晴れ（0%）＝黒、曇り（100%）＝白にする。
 */
export function cloudCellColor(percent) {
  const clamped = Math.max(0, Math.min(100, percent ?? 0))
  const v = Math.round((clamped / 100) * 255)
  return `rgb(${v}, ${v}, ${v})`
}

/**
 * 周辺4地点（北東南西）それぞれの、暗い時間のうちいちばん低層雲が多かった時間の値（%）を求める。
 * ホームの⚠（暗い時間のどこか1時間でも30%を超えたら）と同じ考え方にそろえるため、平均ではなく最大値にする。
 * 暗い時間が無い夜（月明かり）は、天文薄明の終了〜開始（それも無ければ日没〜日の出）の範囲で見る。
 * @returns {{ direction: string, maxLowCloud: number|null }[]}
 */
export function surroundingLowCloudMax(surroundingPoints, info) {
  const ranges =
    info.darkIntervals?.length > 0
      ? info.darkIntervals
      : [{ start: info.duskEnd ?? info.sunset, end: info.dawnStart ?? info.sunrise }]
  const labels = { north: '北', east: '東', south: '南', west: '西' }
  return Object.entries(labels).map(([key, label]) => {
    const hourly = surroundingPoints?.[key]?.hourly
    let max = null
    hourly?.time?.forEach((t, i) => {
      // その1時間のまん中の時刻が範囲に入っているか（撮影可能時間の数え方と同じ）
      const mid = new Date(parseLocalTime(t).getTime() + 30 * 60 * 1000)
      const inRange = ranges.some((r) => r.start && r.end && mid >= r.start && mid < r.end)
      const v = hourly.cloud_cover_low?.[i]
      if (inRange && v != null && (max === null || v > max)) max = v
    })
    return { direction: label, maxLowCloud: max }
  })
}
