import { describe, it, expect } from 'vitest'
import {
  computeClearDarkHours,
  judgeNight,
  checkLowCloudRisk,
} from '../src/logic/judgment.js'

// テスト用：2026-11-04 18:00 〜 2026-11-05 06:00 を「暗い時間帯」とする
const DARK_INTERVALS = [
  { start: new Date('2026-11-04T09:00:00Z'), end: new Date('2026-11-04T21:00:00Z') }, // JST 18:00〜翌06:00
]
const DAWN_START = new Date('2026-11-04T21:00:00Z') // JST 翌06:00

function makeHourly(startHourJst, cloudPattern) {
  // cloudPattern: [{low, mid, high}, ...] を startHourJst から1時間ずつ並べる
  const time = []
  const cloud_cover_low = []
  const cloud_cover_mid = []
  const cloud_cover_high = []

  cloudPattern.forEach((c, i) => {
    const hour = (startHourJst + i) % 24
    const dayOffset = Math.floor((startHourJst + i) / 24)
    const day = 4 + dayOffset
    time.push(`2026-11-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:00`)
    cloud_cover_low.push(c.low)
    cloud_cover_mid.push(c.mid)
    cloud_cover_high.push(c.high)
  })

  return { time, cloud_cover_low, cloud_cover_mid, cloud_cover_high }
}

const CLEAR = { low: 10, mid: 10, high: 10 }
const CLOUDY = { low: 80, mid: 80, high: 80 }

describe('computeClearDarkHours（撮影可能時間）', () => {
  it('全層20%以下が4時間続く → 4時間（撮影可）', () => {
    const hourly = makeHourly(18, [CLEAR, CLEAR, CLEAR, CLEAR])
    const hours = computeClearDarkHours(hourly, DARK_INTERVALS)
    expect(hours).toBe(4)
  })

  it('晴れ2時間＋曇り1時間＋晴れ2時間 → 連続最長2時間（不可）', () => {
    const hourly = makeHourly(18, [CLEAR, CLEAR, CLOUDY, CLEAR, CLEAR])
    const hours = computeClearDarkHours(hourly, DARK_INTERVALS)
    expect(hours).toBe(2)
  })

  it('中層雲だけ40% → 晴れではない（0時間）', () => {
    const hourly = makeHourly(18, [{ low: 10, mid: 40, high: 10 }])
    const hours = computeClearDarkHours(hourly, DARK_INTERVALS)
    expect(hours).toBe(0)
  })

  it('日付をまたぐ夜（23時〜翌3時が晴れ）→ 正しく1つの夜として連続時間が数えられる', () => {
    // 18,19,20,21,22時は曇り、23,0,1,2,3時が晴れ（日付をまたぐ）、4,5時は曇り
    const hourly = makeHourly(18, [
      CLOUDY,
      CLOUDY,
      CLOUDY,
      CLOUDY,
      CLOUDY,
      CLEAR,
      CLEAR,
      CLEAR,
      CLEAR,
      CLEAR,
      CLOUDY,
      CLOUDY,
    ])
    const hours = computeClearDarkHours(hourly, DARK_INTERVALS)
    expect(hours).toBe(5)
  })
})

describe('judgeNight（総合判定）', () => {
  const baseNightInfo = {
    darkHours: 12,
    dawnStart: DAWN_START,
    darkIntervals: DARK_INTERVALS,
  }

  it('暗い時間が2時間しかない夜 → 雲がなくても「暗い時間なし」扱いで不可', () => {
    const hourly = makeHourly(18, Array(13).fill(CLEAR))
    const result = judgeNight({
      nightInfo: { ...baseNightInfo, darkHours: 2 },
      msmHourly: hourly,
      ecmwfHourly: hourly,
    })
    expect(result.status).toBe('no_dark_time')
  })

  it('MSM・ECMWFとも撮影可 → ◎可（go）', () => {
    const hourly = makeHourly(18, Array(13).fill(CLEAR))
    const result = judgeNight({ nightInfo: baseNightInfo, msmHourly: hourly, ecmwfHourly: hourly })
    expect(result.status).toBe('go')
  })

  it('MSM・ECMWFとも撮影不可 → ×不可（no_go）', () => {
    const hourly = makeHourly(18, Array(13).fill(CLOUDY))
    const result = judgeNight({ nightInfo: baseNightInfo, msmHourly: hourly, ecmwfHourly: hourly })
    expect(result.status).toBe('no_go')
  })

  it('MSMとECMWFで判定が食い違う → △割れ（split）', () => {
    const clearHourly = makeHourly(18, Array(13).fill(CLEAR))
    const cloudyHourly = makeHourly(18, Array(13).fill(CLOUDY))
    const result = judgeNight({
      nightInfo: baseNightInfo,
      msmHourly: clearHourly,
      ecmwfHourly: cloudyHourly,
    })
    expect(result.status).toBe('split')
  })

  it('MSMのデータが途中で切れている夜（dawnStartまで届かない） → 「参考」扱い', () => {
    // MSMのデータが0〜2時間ぶんしかない（dawnStartの06:00まで届かない）
    const shortMsmHourly = makeHourly(18, [CLEAR, CLEAR])
    const fullEcmwfHourly = makeHourly(18, Array(13).fill(CLEAR))
    const result = judgeNight({
      nightInfo: baseNightInfo,
      msmHourly: shortMsmHourly,
      ecmwfHourly: fullEcmwfHourly,
    })
    expect(result.status).toBe('reference_go')
  })
})

describe('checkLowCloudRisk', () => {
  it('周辺点のどこかで暗い時間帯に低層雲が30%を超えていればリスクあり', () => {
    const safeHourly = makeHourly(18, [{ low: 10, mid: 0, high: 0 }])
    const riskyHourly = makeHourly(18, [{ low: 50, mid: 0, high: 0 }])
    const result = checkLowCloudRisk([safeHourly, safeHourly, riskyHourly, safeHourly], DARK_INTERVALS)
    expect(result).toBe(true)
  })

  it('どの周辺点も30%以下ならリスクなし', () => {
    const safeHourly = makeHourly(18, [{ low: 10, mid: 0, high: 0 }])
    const result = checkLowCloudRisk([safeHourly, safeHourly, safeHourly, safeHourly], DARK_INTERVALS)
    expect(result).toBe(false)
  })
})
