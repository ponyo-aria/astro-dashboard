import { describe, it, expect } from 'vitest'
import { computeNightJudgment } from '../src/logic/nightJudgment.js'

const location = { id: 'a', name: 'テスト地点', lat: 35.4, lng: 138.6, elevation: 900 }
// 11/8の夜（新月に近く、ほぼ一晩じゅう暗い）
const nightDate = new Date('2026-11-08T12:00:00+09:00')

// 11/8 12時から hours 時間ぶん、雲量を一定にした1時間ごとのデータ
function hourly(lowCloud, hours = 24) {
  const time = []
  for (let i = 0; i < hours; i += 1) {
    const d = new Date(Date.parse('2026-11-08T12:00:00+09:00') + i * 3600e3 + 9 * 3600e3)
    time.push(d.toISOString().slice(0, 13) + ':00')
  }
  const fill = (v) => Array(hours).fill(v)
  return { time, cloud_cover_low: fill(lowCloud), cloud_cover_mid: fill(0), cloud_cover_high: fill(0) }
}

function group(centerLow, surroundingLow, hours) {
  const point = (low) => ({ hourly: hourly(low, hours) })
  return {
    locationId: 'a',
    center: point(centerLow),
    north: point(surroundingLow),
    east: point(surroundingLow),
    south: point(surroundingLow),
    west: point(surroundingLow),
  }
}

describe('低層雲リスク（⚠）に使う予報', () => {
  it('MSMがその夜の終わりまで届いていれば、MSMの周辺4点で判断する（ECMWFが多くても⚠なし）', () => {
    const cache = {
      results: {
        msm: [group(0, 10, 24)], // MSM：周辺の低層雲 10%
        ecmwf: [group(0, 90, 24)], // ECMWF：周辺の低層雲 90%
      },
    }
    const { judgment } = computeNightJudgment(location, nightDate, cache)
    expect(judgment.status).toBe('go')
    expect(judgment.lowCloudRisk).toBe(false)
  })

  it('MSMの周辺4点で30%を超えていれば⚠あり', () => {
    const cache = { results: { msm: [group(0, 40, 24)], ecmwf: [group(0, 0, 24)] } }
    expect(computeNightJudgment(location, nightDate, cache).judgment.lowCloudRisk).toBe(true)
  })

  it('MSMが夜の途中で切れている夜（5〜7夜目）は、ECMWFの周辺4点で判断する', () => {
    const cache = {
      results: {
        msm: [group(0, 10, 10)], // 11/8 22時ごろで切れている
        ecmwf: [group(0, 90, 24)],
      },
    }
    expect(computeNightJudgment(location, nightDate, cache).judgment.lowCloudRisk).toBe(true)
  })
})
