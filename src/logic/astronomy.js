// 天文計算（夜の範囲、天文薄明、月の出入り、月齢、「暗い時間」）。
// 天文計算そのものは astronomy-engine ライブラリに任せる。

import * as Astronomy from 'astronomy-engine'

const ASTRONOMICAL_TWILIGHT_ALTITUDE = -18 // 天文薄明の太陽高度（度）
const SYNODIC_MONTH_DAYS = 29.530588853 // 朔望月（新月から新月までの平均日数）

/** 緯度・経度・標高から観測地点を作る。標高は任意（省略時は0m）。 */
export function createObserver(lat, lng, elevationMeters = 0) {
  return new Astronomy.Observer(lat, lng, elevationMeters)
}

function toAstroTime(date) {
  return date instanceof Astronomy.AstroTime ? date : Astronomy.MakeTime(date)
}

/** 指定した時刻での天体の高度（度）を求める。 */
function getAltitude(body, observer, date) {
  const time = toAstroTime(date)
  const equator = Astronomy.Equator(body, time, observer, true, true)
  const horizon = Astronomy.Horizon(time, observer, equator.ra, equator.dec, 'normal')
  return horizon.altitude
}

export function getSunAltitude(observer, date) {
  return getAltitude(Astronomy.Body.Sun, observer, date)
}

export function getMoonAltitude(observer, date) {
  return getAltitude(Astronomy.Body.Moon, observer, date)
}

/**
 * 「D日の夜」の日没（D日）と日の出（D+1日）を求める。
 * nightDate には D日の正午ごろのDateを渡す（日付の境界があいまいにならないようにするため）。
 */
export function getNightSunTimes(observer, nightDate) {
  const noon = toAstroTime(nightDate)
  const sunset = Astronomy.SearchRiseSet(Astronomy.Body.Sun, observer, -1, noon, 2)
  if (!sunset) {
    return { sunset: null, sunrise: null }
  }
  const sunrise = Astronomy.SearchRiseSet(Astronomy.Body.Sun, observer, 1, sunset, 2)
  return { sunset, sunrise }
}

/** 天文薄明の終わり（日没後、完全に暗くなる時刻）と始まり（日の出前、暗さが終わる時刻）を求める。 */
export function getAstronomicalTwilight(observer, sunset) {
  if (!sunset) {
    return { duskEnd: null, dawnStart: null }
  }
  const duskEnd = Astronomy.SearchAltitude(
    Astronomy.Body.Sun,
    observer,
    -1,
    sunset,
    1,
    ASTRONOMICAL_TWILIGHT_ALTITUDE
  )
  if (!duskEnd) {
    return { duskEnd: null, dawnStart: null }
  }
  const dawnStart = Astronomy.SearchAltitude(
    Astronomy.Body.Sun,
    observer,
    1,
    duskEnd,
    1,
    ASTRONOMICAL_TWILIGHT_ALTITUDE
  )
  return { duskEnd, dawnStart }
}

/**
 * 夜間（sunsetからsunriseまで）に起きる月の出・月の入りを、起きた順にすべて求める。
 * 月が出っぱなし・沈みっぱなしの夜は空配列になることもある。
 */
export function getMoonRiseSetEventsInRange(observer, rangeStart, rangeEnd) {
  if (!rangeStart || !rangeEnd) {
    return []
  }
  const events = []
  let cursor = rangeStart
  // 月の出・月の入りのどちらが先に起きるか分からないので、両方試して早い方を採用する
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const rise = Astronomy.SearchRiseSet(Astronomy.Body.Moon, observer, 1, cursor, 2)
    const set = Astronomy.SearchRiseSet(Astronomy.Body.Moon, observer, -1, cursor, 2)

    const candidates = [
      rise && rise.date <= rangeEnd.date ? { type: 'rise', time: rise } : null,
      set && set.date <= rangeEnd.date ? { type: 'set', time: set } : null,
    ].filter(Boolean)

    if (candidates.length === 0) {
      break
    }
    candidates.sort((a, b) => a.time.date - b.time.date)
    const next = candidates[0]
    events.push(next)
    // 同じ瞬間を検索の起点にすると、同じイベントを再び検出して無限ループになることがあるため、
    // 探索の起点を少しだけ先に進める
    cursor = Astronomy.MakeTime(new Date(next.time.date.getTime() + 60 * 1000))
  }
  return events
}

/** 指定時刻の月齢（日）を求める（簡易計算：太陽との離角から算出）。 */
export function getMoonAgeDays(date) {
  const time = toAstroTime(date)
  const elongationDegrees = Astronomy.MoonPhase(time)
  return (elongationDegrees / 360) * SYNODIC_MONTH_DAYS
}

/**
 * 天文薄明の範囲（duskEnd〜dawnStart）を5分刻みでサンプリングし、
 * 「太陽高度-18°以下 かつ 月高度0°未満」が連続している区間（＝暗い時間）を求める。
 */
export function computeDarkIntervals(observer, duskEnd, dawnStart, stepMinutes = 5) {
  if (!duskEnd || !dawnStart) {
    return []
  }

  const stepMs = stepMinutes * 60 * 1000
  const startMs = duskEnd.date.getTime()
  const endMs = dawnStart.date.getTime()

  const intervals = []
  let currentStart = null

  for (let t = startMs; t <= endMs; t += stepMs) {
    const date = new Date(t)
    const isDark = getMoonAltitude(observer, date) < 0
    if (isDark && currentStart === null) {
      currentStart = date
    } else if (!isDark && currentStart !== null) {
      intervals.push({ start: currentStart, end: date })
      currentStart = null
    }
  }
  if (currentStart !== null) {
    intervals.push({ start: currentStart, end: new Date(endMs) })
  }
  return intervals
}

function sumIntervalHours(intervals) {
  const totalMs = intervals.reduce((sum, i) => sum + (i.end.getTime() - i.start.getTime()), 0)
  return totalMs / (1000 * 60 * 60)
}

/**
 * 「D日の夜」について、日没・日の出・天文薄明・月の出入り・月齢・暗い時間をまとめて求める。
 * nightDate には D日の正午ごろのDateを渡す。
 */
export function computeNightInfo(observer, nightDate) {
  const { sunset, sunrise } = getNightSunTimes(observer, nightDate)
  const { duskEnd, dawnStart } = getAstronomicalTwilight(observer, sunset)
  const moonEvents = getMoonRiseSetEventsInRange(observer, sunset, sunrise)
  const moonAgeDays = getMoonAgeDays(sunset ?? nightDate)
  const darkIntervals = computeDarkIntervals(observer, duskEnd, dawnStart)
  const darkHours = sumIntervalHours(darkIntervals)

  return {
    sunset: sunset?.date ?? null,
    sunrise: sunrise?.date ?? null,
    duskEnd: duskEnd?.date ?? null,
    dawnStart: dawnStart?.date ?? null,
    moonEvents: moonEvents.map((e) => ({ type: e.type, time: e.time.date })),
    moonAgeDays,
    darkIntervals: darkIntervals.map((i) => ({ start: i.start, end: i.end })),
    darkHours,
  }
}
