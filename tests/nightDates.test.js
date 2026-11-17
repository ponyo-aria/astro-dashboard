import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { currentNightDate, upcomingNightDates, noonOf } from '../src/logic/nightDates.js'
import { createObserver, getNightSunTimes } from '../src/logic/astronomy.js'
import { getNightSelection } from '../src/screens/topScreen.js'

const NOBEYAMA = { id: 'b', name: '八ヶ岳ふれあい公園', lat: 36.0, lng: 138.5, elevation: 1300 }

// 「11/17の夜」と「11/18の夜」の日付（各日の正午・日本時間）
const NIGHT_1117 = new Date('2026-11-17T12:00:00+09:00')
const NIGHT_1118 = new Date('2026-11-18T12:00:00+09:00')

// 11/18 朝の日の出（＝「11/17の夜」の終わり）を、アプリと同じ計算で求めておく
function sunriseOn1118() {
  const observer = createObserver(NOBEYAMA.lat, NOBEYAMA.lng, NOBEYAMA.elevation)
  return getNightSunTimes(observer, NIGHT_1117).sunrise.date
}

const MINUTE = 60 * 1000

describe('表示する夜の決め方（日の出より前なら前日の夜、日の出以降なら当日の夜）', () => {
  it('日の出の時刻が朝6時台になっている（テストの前提の確認）', () => {
    const sunrise = sunriseOn1118()
    const hourJst = (sunrise.getUTCHours() + 9) % 24
    expect(hourJst).toBe(6)
  })

  it('23時は、その日の夜', () => {
    const now = new Date('2026-11-17T23:00:00+09:00')
    expect(currentNightDate(NOBEYAMA, now)).toEqual(NIGHT_1117)
  })

  it('0時は、まだ前日の夜', () => {
    const now = new Date('2026-11-18T00:00:00+09:00')
    expect(currentNightDate(NOBEYAMA, now)).toEqual(NIGHT_1117)
  })

  it('3時は、まだ前日の夜', () => {
    const now = new Date('2026-11-18T03:00:00+09:00')
    expect(currentNightDate(NOBEYAMA, now)).toEqual(NIGHT_1117)
  })

  it('日の出の直前（1分前）は、まだ前日の夜', () => {
    const now = new Date(sunriseOn1118().getTime() - MINUTE)
    expect(currentNightDate(NOBEYAMA, now)).toEqual(NIGHT_1117)
  })

  it('日の出の直後（1分後）は、その日の夜', () => {
    const now = new Date(sunriseOn1118().getTime() + MINUTE)
    expect(currentNightDate(NOBEYAMA, now)).toEqual(NIGHT_1118)
  })

  it('昼（12時）は、その日の夜', () => {
    const now = new Date('2026-11-18T12:00:00+09:00')
    expect(currentNightDate(NOBEYAMA, now)).toEqual(NIGHT_1118)
  })

  it('地点が無いときは、日付だけで決める（その日の夜）', () => {
    const now = new Date('2026-11-18T03:00:00+09:00')
    expect(currentNightDate(null, now)).toEqual(NIGHT_1118)
  })

  it('3時に7夜ぶんを並べると、前日の夜から1日ずつ続く', () => {
    const now = new Date('2026-11-18T03:00:00+09:00')
    const dates = upcomingNightDates(NOBEYAMA, 7, now)
    expect(dates).toHaveLength(7)
    expect(dates[0]).toEqual(NIGHT_1117)
    expect(dates[6]).toEqual(new Date('2026-11-23T12:00:00+09:00'))
    dates.forEach((d) => expect(d).toEqual(noonOf(d))) // どれも正午（日本時間）
  })
})

describe('ホーム・詳細で使う夜の一覧', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.useFakeTimers({ toFake: ['Date'] })
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('3時に開くと、1つ目（今夜）は前日の夜になる', () => {
    vi.setSystemTime(new Date('2026-11-18T03:00:00+09:00'))
    const { nightDates } = getNightSelection([NOBEYAMA])
    expect(nightDates[0]).toEqual(NIGHT_1117)
  })

  it('日の出の後に開くと、1つ目（今夜）はその日の夜になる', () => {
    vi.setSystemTime(new Date(sunriseOn1118().getTime() + MINUTE))
    const { nightDates } = getNightSelection([NOBEYAMA])
    expect(nightDates[0]).toEqual(NIGHT_1118)
  })
})
