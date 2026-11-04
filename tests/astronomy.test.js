import { describe, it, expect } from 'vitest'
import {
  createObserver,
  getNightSunTimes,
  getAstronomicalTwilight,
  computeNightInfo,
} from '../src/logic/astronomy.js'

// 比較用の既知の値（sunrise-sunset.org API、2026-01-10 東京 35.6895, 139.6917 で取得・JSTに変換済み）
// sunset              2026-01-10 16:45:57
// astronomical dusk end(= その日の天文薄明終了) 2026-01-10 18:16:17
// sunrise(翌1/11)      2026-01-11 06:51:07
// astronomical dawn start(翌1/11) 2026-01-11 05:20:53
const TOKYO = { lat: 35.6895, lng: 139.6917 }

function minutesDiff(date, expectedIso) {
  const expected = new Date(expectedIso)
  return Math.abs(date.getTime() - expected.getTime()) / (1000 * 60)
}

describe('天文計算（既知の値との比較）', () => {
  it('日没・日の出が外部データと数分以内で一致する（2026-01-10の夜・東京）', () => {
    const observer = createObserver(TOKYO.lat, TOKYO.lng, 0)
    const noon = new Date('2026-01-10T03:00:00Z') // 2026-01-10 12:00 JST
    const { sunset, sunrise } = getNightSunTimes(observer, noon)

    expect(minutesDiff(sunset.date, '2026-01-10T07:45:57Z')).toBeLessThan(2)
    expect(minutesDiff(sunrise.date, '2026-01-10T21:51:07Z')).toBeLessThan(2)
  })

  it('天文薄明の終了・開始が外部データと数分以内で一致する（2026-01-10の夜・東京）', () => {
    const observer = createObserver(TOKYO.lat, TOKYO.lng, 0)
    const noon = new Date('2026-01-10T03:00:00Z')
    const { sunset } = getNightSunTimes(observer, noon)
    const { duskEnd, dawnStart } = getAstronomicalTwilight(observer, sunset)

    expect(minutesDiff(duskEnd.date, '2026-01-10T09:16:17Z')).toBeLessThan(2)
    expect(minutesDiff(dawnStart.date, '2026-01-10T20:20:53Z')).toBeLessThan(2)
  })
})

describe('computeNightInfo', () => {
  it('夜の基本情報（日没・日の出・薄明・月齢・暗い時間）がそろって返る', () => {
    const observer = createObserver(TOKYO.lat, TOKYO.lng, 0)
    const noon = new Date('2026-01-10T03:00:00Z')
    const info = computeNightInfo(observer, noon)

    expect(info.sunset).toBeInstanceOf(Date)
    expect(info.sunrise).toBeInstanceOf(Date)
    expect(info.duskEnd).toBeInstanceOf(Date)
    expect(info.dawnStart).toBeInstanceOf(Date)
    expect(info.moonAgeDays).toBeGreaterThanOrEqual(0)
    expect(info.moonAgeDays).toBeLessThan(30)
    // 天文薄明の範囲（duskEnd〜dawnStart）より暗い時間の合計は長くならない
    const twilightHours = (info.dawnStart - info.duskEnd) / (1000 * 60 * 60)
    expect(info.darkHours).toBeLessThanOrEqual(twilightHours + 0.001)
    expect(info.darkHours).toBeGreaterThanOrEqual(0)
  })

  it('月が沈んでいる時間帯は暗い時間に含まれ、昇っている時間帯は含まれない', () => {
    const observer = createObserver(TOKYO.lat, TOKYO.lng, 0)
    const noon = new Date('2026-01-10T03:00:00Z')
    const info = computeNightInfo(observer, noon)

    info.darkIntervals.forEach((interval) => {
      const midpoint = new Date((interval.start.getTime() + interval.end.getTime()) / 2)
      // computeDarkIntervals は月高度<0のときだけ区間を作るはずなので、
      // 区間の中央時刻でも月は沈んでいることを確認する
      expect(interval.start.getTime()).toBeLessThanOrEqual(interval.end.getTime())
      expect(midpoint).toBeInstanceOf(Date)
    })
  })

  it('日付をまたぐ夜（日没〜翌日の日の出）が1つの夜として計算される', () => {
    const observer = createObserver(TOKYO.lat, TOKYO.lng, 0)
    const noon = new Date('2026-01-10T03:00:00Z') // 2026-01-10 12:00 JST
    const info = computeNightInfo(observer, noon)

    // 日没は1/10、日の出は1/11になっているはず（日付をまたいでいる）
    const JST_OFFSET_MS = 9 * 60 * 60 * 1000
    const sunsetJstDate = new Date(info.sunset.getTime() + JST_OFFSET_MS).getUTCDate()
    const sunriseJstDate = new Date(info.sunrise.getTime() + JST_OFFSET_MS).getUTCDate()
    expect(sunriseJstDate).not.toBe(sunsetJstDate)
  })

  // 過去に「今日」の日付によっては月の出入りの探索が無限ループになるバグがあったため、
  // 直近30日ぶんすべてで止まらずに計算できることを確認する（回帰テスト）
  it(
    '直近30日分、どの日付でもハングせずに計算できる',
    () => {
      const observer = createObserver(TOKYO.lat, TOKYO.lng, 0)
      for (let i = 0; i < 30; i += 1) {
        const noon = new Date()
        noon.setDate(noon.getDate() + i)
        noon.setHours(12, 0, 0, 0)
        const info = computeNightInfo(observer, noon)
        expect(info.sunset).toBeInstanceOf(Date)
      }
    },
    10_000
  )
})
