// トップ画面の「全地点×時間」の表で使う計算をまとめる。
// 画面の部品とは切り離して、自動テストできるようにしている。

import { config } from '../config.js'
import { isForecastCoveringNight } from './judgment.js'
import { findForecastForLocation } from './nightJudgment.js'

const HOUR_MS = 60 * 60 * 1000
const JST_OFFSET_MS = 9 * HOUR_MS

// 判定の良い順（7夜のタブに「その夜いちばん良い判定」を出すために使う）
const STATUS_RANK = ['go', 'split', 'reference_go', 'no_go', 'reference_no_go', 'no_dark_time', 'no_data']

// 狭い場所（タブ・表の左端）に出す短い判定表示
export const STATUS_SHORT = {
  go: '◎',
  split: '△',
  no_go: '×',
  reference_go: '○',
  reference_no_go: '×',
  no_dark_time: '―',
  no_data: '―',
}

// 記号の下に添える小さな説明（無いものは空）
export const STATUS_CAPTION = {
  reference_go: '参考',
  reference_no_go: '参考',
  no_dark_time: '月明かり',
  no_data: 'データなし',
}

/** その時刻を含む「1時間の区切り」の始まり（例：18:14 → 18:00）。日本時間は1時間単位でずれているのでUTCで切り捨ててよい。 */
function floorToHour(date) {
  return new Date(Math.floor(date.getTime() / HOUR_MS) * HOUR_MS)
}

/**
 * 表に並べる時刻（1時間ごとの区切りの始まり）の一覧を作る。
 * 天文薄明の終了〜開始を含む時間に、前後 paddingHours 時間ずつ足した範囲。
 */
export function matrixSlots(info, paddingHours = config.matrixPaddingHours) {
  const start = info.duskEnd ?? info.sunset
  const end = info.dawnStart ?? info.sunrise
  if (!start || !end) return []

  const first = floorToHour(new Date(start)).getTime() - paddingHours * HOUR_MS
  const last = floorToHour(new Date(end)).getTime() + paddingHours * HOUR_MS
  const slots = []
  for (let t = first; t <= last; t += HOUR_MS) {
    slots.push(new Date(t))
  }
  return slots
}

/**
 * 1時間の区切りの空の状態。その1時間のまん中の時刻で判断する。
 * 'dark'＝暗い時間／'moon'＝天文薄明は終わっているが月が出ている／'twilight'＝薄明（または昼）
 */
export function skyStateOf(slotStart, info) {
  const mid = new Date(slotStart.getTime() + HOUR_MS / 2)
  const inDark = info.darkIntervals.some((i) => mid >= i.start && mid < i.end)
  if (inDark) return 'dark'
  if (info.duskEnd && info.dawnStart && mid >= info.duskEnd && mid < info.dawnStart) return 'moon'
  return 'twilight'
}

/** Open-Meteo の時刻の書き方（日本時間、例："2026-11-08T18:00"）にそろえる */
export function toForecastTimeKey(date) {
  return new Date(date.getTime() + JST_OFFSET_MS).toISOString().slice(0, 13) + ':00'
}

/** その1時間の低層・中層・高層の雲量。データが無ければ null。 */
export function cloudAt(hourly, slotStart) {
  if (!hourly?.time) return null
  const index = hourly.time.indexOf(toForecastTimeKey(slotStart))
  if (index < 0) return null
  const low = hourly.cloud_cover_low?.[index]
  const mid = hourly.cloud_cover_mid?.[index]
  const high = hourly.cloud_cover_high?.[index]
  if (low == null || mid == null || high == null) return null
  return {
    low,
    mid,
    high,
    max: Math.max(low, mid, high),
    isClear: Math.max(low, mid, high) <= config.cloudCoverClearMax,
  }
}

/**
 * その1時間の地上（10m）の風速（m/s）。データが無ければ null。
 * Open-Meteo からは km/h で届くので、m/s に直す。
 */
export function windAt(hourly, slotStart) {
  if (!hourly?.time) return null
  const index = hourly.time.indexOf(toForecastTimeKey(slotStart))
  const kmh = index < 0 ? null : hourly.wind_speed_10m?.[index]
  return kmh == null ? null : kmh / 3.6
}

/**
 * 表の雲に使う予報を選ぶ。その夜の終わりまでMSMが届いていればMSM、届いていなければECMWF。
 * （撮影可能時間の表示と同じ考え方）
 */
export function pickMatrixForecast(cache, locationId, info) {
  const msm = findForecastForLocation(cache, 'msm', locationId)?.center?.hourly
  if (msm && isForecastCoveringNight(msm, info.dawnStart)) return { model: 'msm', hourly: msm }
  const ecmwf = findForecastForLocation(cache, 'ecmwf', locationId)?.center?.hourly
  if (ecmwf) return { model: 'ecmwf', hourly: ecmwf }
  return null
}

/** いくつかの判定の中から、いちばん良いものを選ぶ（1つも無ければ 'no_data'）。 */
export function bestStatus(statuses) {
  if (statuses.length === 0) return 'no_data'
  return statuses.reduce((best, s) =>
    STATUS_RANK.indexOf(s) < STATUS_RANK.indexOf(best) ? s : best
  )
}
