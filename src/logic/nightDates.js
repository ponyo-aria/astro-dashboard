// 「どの夜を表示するか」を決める。
// 夜は「D日の日没〜D+1日の日の出」なので、0時を過ぎても日の出まではまだ前日の夜が続いている。
// そこで、いまが日の出より前なら前日の夜、日の出以降なら当日の夜を「今夜」として扱う。
// （ホーム・比較・詳細の画面がみな同じ夜の一覧を使うよう、決め方をここ1か所にまとめている）

import { createObserver, getNightSunTimes } from './astronomy.js'

const TIME_ZONE = 'Asia/Tokyo'
const DAY_MS = 24 * 60 * 60 * 1000

/** その時刻の日付（日本時間）の正午を返す。「D日の夜」を探すときの起点に使う */
export function noonOf(date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
  return new Date(`${parts}T12:00:00+09:00`)
}

/**
 * いま表示する夜（「今夜」）の日付を、その日の正午として返す。
 * location：日の出の時刻を決める地点（基準地点）。無いときは日付だけで決める（当日の夜）
 * now：現在時刻（テストで差し替えられるように引数にしている）
 */
export function currentNightDate(location, now = new Date()) {
  const todayNoon = noonOf(now)
  if (!location) return todayNoon

  // 「前日の夜」の日の出＝今朝の日の出。それより前なら、まだ前日の夜が続いている
  const yesterdayNoon = new Date(todayNoon.getTime() - DAY_MS)
  const observer = createObserver(location.lat, location.lng, location.elevation ?? 0)
  const { sunrise } = getNightSunTimes(observer, yesterdayNoon)
  if (sunrise && now.getTime() < sunrise.date.getTime()) {
    return yesterdayNoon
  }
  return todayNoon
}

/** 「今夜」から count 夜ぶんの日付（各夜の正午）の一覧 */
export function upcomingNightDates(location, count, now = new Date()) {
  const first = currentNightDate(location, now)
  // 日本時間には夏時間が無いので、24時間ずつ足せば次の日の正午になる
  return Array.from({ length: count }, (_, i) => new Date(first.getTime() + i * DAY_MS))
}
