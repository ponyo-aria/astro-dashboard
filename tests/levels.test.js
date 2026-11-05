import { describe, it, expect } from 'vitest'
import { worstLevel, windLevel, gustLevel, dewLevel, lowCloudLevel, rainLevel } from '../src/logic/levels.js'

describe('注意の段階（問題なし→注意→警戒）', () => {
  it('平均の風速：5m/s以上で注意、8m/s以上で警戒', () => {
    expect(windLevel(4.9)).toBe('ok')
    expect(windLevel(5)).toBe('caution')
    expect(windLevel(8)).toBe('danger')
    expect(windLevel(null)).toBe('ok')
  })

  it('最大瞬間風速：10m/s以上で注意、15m/s以上で警戒', () => {
    expect(gustLevel(9.9)).toBe('ok')
    expect(gustLevel(10)).toBe('caution')
    expect(gustLevel(15)).toBe('danger')
  })

  it('結露（気温と露点の差）：4℃以下で注意、2℃以下で警戒', () => {
    expect(dewLevel(4.1)).toBe('ok')
    expect(dewLevel(4)).toBe('caution')
    expect(dewLevel(2)).toBe('danger')
  })

  it('周辺の低層雲：5%を超えたら注意、30%を超えたら警戒', () => {
    expect(lowCloudLevel(5)).toBe('ok')
    expect(lowCloudLevel(6)).toBe('caution')
    expect(lowCloudLevel(30)).toBe('caution')
    expect(lowCloudLevel(31)).toBe('danger')
  })

  it('いくつかの段階のうち、いちばん厳しいものを選ぶ', () => {
    expect(worstLevel('ok', 'caution')).toBe('caution')
    expect(worstLevel('caution', 'danger', 'ok')).toBe('danger')
    expect(worstLevel()).toBe('ok')
  })

  it('直前の雨：暗くなる前12時間に1mm以上か24時間で10mm以上で注意、暗くなる時も雨・夜間0.5mm以上で警戒', () => {
    const base = { totalMm: 0, recentMm: 0, hoursSinceRain: null, rainingAtDark: false, nightMm: 0 }
    expect(rainLevel(base)).toBe('ok')
    expect(rainLevel({ ...base, totalMm: 5, recentMm: 0.5 })).toBe('ok') // 12時間より前の少しの雨だけ
    expect(rainLevel({ ...base, totalMm: 10, recentMm: 0 })).toBe('caution') // 24時間で10mm以上の大雨
    expect(rainLevel({ ...base, recentMm: 1 })).toBe('caution')
    expect(rainLevel({ ...base, rainingAtDark: true })).toBe('danger')
    expect(rainLevel({ ...base, nightMm: 0.5 })).toBe('danger')
    expect(rainLevel(null)).toBe('ok')
  })
})
