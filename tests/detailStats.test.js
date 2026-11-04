import { describe, it, expect } from 'vitest'
import {
  sumPrecipitation,
  minNightTemperature,
  dewPointRisk,
  nightWindInfo,
  representativeWindDirection850,
  directionLabel,
  surroundingLowCloudSummary,
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

describe('sumPrecipitation', () => {
  it('前日〜当日ぶんの降水量だけを合計する（翌日・2日前は含めない）', () => {
    const nightDateNoon = new Date('2026-11-04T03:00:00Z') // 2026-11-04 12:00 JST
    const hourly = makeHourly(
      ['2026-11-02T23:00', '2026-11-03T06:00', '2026-11-04T20:00', '2026-11-05T02:00'],
      { precipitation: [100, 2, 3, 100] }
    )
    expect(sumPrecipitation(hourly, nightDateNoon)).toBe(5)
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
  it('km/hをm/sに変換してしきい値（5m/s）判定する', () => {
    const sunset = new Date('2026-11-04T09:00:00Z')
    const sunrise = new Date('2026-11-04T21:00:00Z')
    // 18 km/h = 5 m/s ちょうど
    const hourly = makeHourly(['2026-11-04T18:00'], {
      wind_speed_10m: [18],
      wind_gusts_10m: [10],
    })
    const result = nightWindInfo(hourly, sunset, sunrise)
    expect(result.maxWindSpeedMs).toBeCloseTo(5, 5)
    expect(result.caution).toBe(true)
  })

  it('風速が弱ければ注意なし', () => {
    const sunset = new Date('2026-11-04T09:00:00Z')
    const sunrise = new Date('2026-11-04T21:00:00Z')
    const hourly = makeHourly(['2026-11-04T18:00'], {
      wind_speed_10m: [7.2], // 2 m/s
      wind_gusts_10m: [10.8], // 3 m/s
    })
    const result = nightWindInfo(hourly, sunset, sunrise)
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

describe('surroundingLowCloudSummary', () => {
  it('周辺4方角それぞれの夜間平均低層雲量を求める', () => {
    const sunset = new Date('2026-11-04T09:00:00Z')
    const sunrise = new Date('2026-11-04T21:00:00Z')
    const makePoint = (vals) => ({
      hourly: makeHourly(['2026-11-04T18:00', '2026-11-05T00:00'], { cloud_cover_low: vals }),
    })
    const surroundingPoints = {
      north: makePoint([10, 20]),
      east: makePoint([0, 0]),
      south: makePoint([50, 50]),
      west: makePoint([30, 10]),
    }
    const result = surroundingLowCloudSummary(surroundingPoints, sunset, sunrise)
    expect(result).toEqual([
      { direction: '北', averageLowCloud: 15 },
      { direction: '東', averageLowCloud: 0 },
      { direction: '南', averageLowCloud: 50 },
      { direction: '西', averageLowCloud: 20 },
    ])
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
