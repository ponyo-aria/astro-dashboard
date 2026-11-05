import { describe, it, expect } from 'vitest'
import {
  recentRain,
  minNightTemperature,
  dewPointRisk,
  nightWindInfo,
  representativeWindDirection850,
  directionLabel,
  surroundingLowCloudMax,
  cloudCellColor,
} from '../src/logic/detailStats.js'

function makeHourly(times, values) {
  return {
    time: times,
    precipitation: values.precipitation,
    temperature_2m: values.temperature_2m,
    dew_point_2m: values.dew_point_2m,
    wind_speed_10m: values.wind_speed_10m,
    wind_gusts_10m: values.wind_gusts_10m,
    wind_direction_850hPa: values.wind_direction_850hPa,
    cloud_cover_low: values.cloud_cover_low,
  }
}

describe('recentRain（直前の雨）', () => {
  // 暗くなる時刻 18:00、明るくなる時刻 翌05:00（日本時間）
  const info = {
    duskEnd: new Date('2026-11-04T09:00:00Z'),
    dawnStart: new Date('2026-11-04T20:00:00Z'),
  }
  // 雨の量は「その時刻までの1時間に降った量」
  const rainAt = (pairs) =>
    makeHourly(
      pairs.map(([t]) => t),
      { precipitation: pairs.map(([, mm]) => mm) }
    )

  it('暗くなる前24時間の合計と、止んでからの時間を求める（24時間より前の雨は数えない）', () => {
    const r = recentRain(
      rainAt([
        ['2026-11-03T10:00', 50], // 24時間より前
        ['2026-11-04T09:00', 2],
        ['2026-11-04T14:00', 1.5], // 最後の雨（13〜14時）
        ['2026-11-04T17:00', 0],
      ]),
      info
    )
    expect(r.totalMm).toBeCloseTo(3.5, 5)
    expect(r.hoursSinceRain).toBe(4) // 14時に止んで、暗くなる18時まで4時間
    expect(r.rainingAtDark).toBe(false)
    expect(r.nightMm).toBe(0)
  })

  it('暗くなる時刻を含む1時間に降っていれば「暗くなる時も雨」、暗い時間の雨は夜間として別に数える', () => {
    const r = recentRain(
      rainAt([
        ['2026-11-04T18:30', 0.4], // 17:30〜18:30（暗くなる18時をまたぐ）
        ['2026-11-04T22:00', 1.2], // 夜間
      ]),
      info
    )
    expect(r.rainingAtDark).toBe(true)
    expect(r.nightMm).toBeCloseTo(1.2, 5)
  })

  it('24時間降っていなければ、止んでからの時間は null', () => {
    const r = recentRain(rainAt([['2026-11-04T12:00', 0]]), info)
    expect(r.totalMm).toBe(0)
    expect(r.hoursSinceRain).toBeNull()
  })
})

describe('minNightTemperature', () => {
  it('夜間（sunset〜sunrise）の最低気温を求める', () => {
    const sunset = new Date('2026-11-04T09:00:00Z') // 18:00 JST
    const sunrise = new Date('2026-11-04T21:00:00Z') // 翌06:00 JST
    const hourly = makeHourly(
      ['2026-11-04T17:00', '2026-11-04T18:00', '2026-11-05T02:00', '2026-11-05T07:00'],
      { temperature_2m: [10, 5, -2, 8] }
    )
    expect(minNightTemperature(hourly, sunset, sunrise)).toBe(-2)
  })
})

describe('dewPointRisk', () => {
  const sunset = new Date('2026-11-04T09:00:00Z')
  const sunrise = new Date('2026-11-04T21:00:00Z')

  it('気温と露点の差が2℃以下なら「高」', () => {
    const hourly = makeHourly(['2026-11-04T18:00'], {
      temperature_2m: [5],
      dew_point_2m: [3.5],
    })
    expect(dewPointRisk(hourly, sunset, sunrise).level).toBe('high')
  })

  it('気温と露点の差が4℃以下なら「注意」', () => {
    const hourly = makeHourly(['2026-11-04T18:00'], {
      temperature_2m: [5],
      dew_point_2m: [1.5],
    })
    expect(dewPointRisk(hourly, sunset, sunrise).level).toBe('caution')
  })

  it('気温と露点の差が4℃を超えると「低」', () => {
    const hourly = makeHourly(['2026-11-04T18:00'], {
      temperature_2m: [10],
      dew_point_2m: [0],
    })
    expect(dewPointRisk(hourly, sunset, sunrise).level).toBe('low')
  })
})

describe('nightWindInfo', () => {
  const sunset = new Date('2026-11-04T09:00:00Z')
  const sunrise = new Date('2026-11-04T21:00:00Z')
  // 平均の風速の予報（MSMなど）と、瞬間風速の予報（ECMWF 9km）を別々に渡す。値は km/h
  const mean = (kmh) => makeHourly(['2026-11-04T18:00'], { wind_speed_10m: [kmh] })
  const gust = (kmh) => makeHourly(['2026-11-04T18:00'], { wind_gusts_10m: [kmh] })

  it('km/hをm/sに直し、平均は1つ目の予報、瞬間は2つ目の予報から取る', () => {
    const result = nightWindInfo(mean(18), gust(27), sunset, sunrise)
    expect(result.maxWindSpeedMs).toBeCloseTo(5, 5) // 18km/h = 5m/s
    expect(result.maxWindGustMs).toBeCloseTo(7.5, 5) // 27km/h = 7.5m/s
  })

  it('平均の風速が5m/s以上なら注意', () => {
    expect(nightWindInfo(mean(18), gust(18), sunset, sunrise).caution).toBe(true)
  })

  it('瞬間風速は10m/s以上で注意（平均が弱くても）。9.9m/sなら注意なし', () => {
    expect(nightWindInfo(mean(7.2), gust(36), sunset, sunrise).caution).toBe(true) // 瞬間10m/s
    expect(nightWindInfo(mean(7.2), gust(35.64), sunset, sunrise).caution).toBe(false) // 瞬間9.9m/s
  })

  it('穏やかな夜（平均2m/s・瞬間8m/s）は注意なし。前は瞬間も5m/sで判定していたので注意になっていた', () => {
    expect(nightWindInfo(mean(7.2), gust(28.8), sunset, sunrise).caution).toBe(false)
  })

  it('瞬間風速の予報が無くても、平均だけで判定できる', () => {
    const result = nightWindInfo(mean(7.2), undefined, sunset, sunrise)
    expect(result.maxWindGustMs).toBeNull()
    expect(result.caution).toBe(false)
  })
})

describe('representativeWindDirection850 / directionLabel', () => {
  it('夜の中央に最も近い時刻の850hPa風向きを返す', () => {
    const sunset = new Date('2026-11-04T09:00:00Z') // 18:00 JST
    const sunrise = new Date('2026-11-04T21:00:00Z') // 翌06:00 JST（中央は翌00:00ごろ）
    const hourly = makeHourly(['2026-11-04T18:00', '2026-11-05T00:00', '2026-11-05T06:00'], {
      wind_direction_850hPa: [90, 270, 180],
    })
    expect(representativeWindDirection850(hourly, sunset, sunrise)).toBe(270)
  })

  it('方位角を日本語ラベルに変換する', () => {
    expect(directionLabel(0)).toBe('北')
    expect(directionLabel(90)).toBe('東')
    expect(directionLabel(180)).toBe('南')
    expect(directionLabel(270)).toBe('西')
  })
})

describe('surroundingLowCloudMax', () => {
  // 暗い時間：18:00〜翌02:00（日本時間）
  const info = {
    darkIntervals: [{ start: new Date('2026-11-04T09:00:00Z'), end: new Date('2026-11-04T17:00:00Z') }],
  }
  const makePoint = (vals) => ({
    hourly: makeHourly(['2026-11-04T18:00', '2026-11-04T23:00', '2026-11-05T04:00'], { cloud_cover_low: vals }),
  })

  it('周辺4方角それぞれの、暗い時間のうち一番多い低層雲量を求める（暗い時間の外は数えない）', () => {
    const result = surroundingLowCloudMax(
      { north: makePoint([10, 20, 90]), east: makePoint([0, 0, 0]), south: makePoint([50, 5, 0]), west: makePoint([30, 10, 0]) },
      info
    )
    expect(result).toEqual([
      { direction: '北', maxLowCloud: 20 }, // 4時の90%は暗い時間の外
      { direction: '東', maxLowCloud: 0 },
      { direction: '南', maxLowCloud: 50 },
      { direction: '西', maxLowCloud: 30 },
    ])
  })

  it('周辺の予報が無いときは null', () => {
    expect(surroundingLowCloudMax(undefined, info).every((d) => d.maxLowCloud === null)).toBe(true)
  })
})

describe('cloudCellColor', () => {
  it('グレースケール（赤緑青が同じ値）になる', () => {
    const [r, g, b] = cloudCellColor(40).match(/\d+/g).map(Number)
    expect(r).toBe(g)
    expect(g).toBe(b)
  })

  it('晴れ（0%）は黒に近い', () => {
    const [r] = cloudCellColor(0).match(/\d+/g).map(Number)
    expect(r).toBe(0)
  })

  it('曇り（100%）は白に近い', () => {
    const [r] = cloudCellColor(100).match(/\d+/g).map(Number)
    expect(r).toBe(255)
  })

  it('雲量が多いほど明るい色になる', () => {
    const [v20] = cloudCellColor(20).match(/\d+/g).map(Number)
    const [v80] = cloudCellColor(80).match(/\d+/g).map(Number)
    expect(v80).toBeGreaterThan(v20)
  })
})
