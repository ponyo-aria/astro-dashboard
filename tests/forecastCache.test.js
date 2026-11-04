import { describe, it, expect, beforeEach } from 'vitest'
import {
  loadForecastCache,
  saveForecastCache,
  isCacheFresh,
  CACHE_FRESH_MS,
} from '../src/storage/forecastCache.js'

beforeEach(() => {
  localStorage.clear()
})

describe('forecastCache', () => {
  it('保存していないときは null が返る', () => {
    expect(loadForecastCache()).toBeNull()
  })

  it('保存した内容をそのまま読み込める', () => {
    const cache = { fetchedAt: Date.now(), results: { msm: [], ecmwf: [] } }
    saveForecastCache(cache)
    expect(loadForecastCache()).toEqual(cache)
  })

  it('10分以内なら新しいと判定される', () => {
    const cache = { fetchedAt: Date.now() - 5 * 60 * 1000 }
    expect(isCacheFresh(cache)).toBe(true)
  })

  it('10分を過ぎていると新しくないと判定される', () => {
    const cache = { fetchedAt: Date.now() - 11 * 60 * 1000 }
    expect(isCacheFresh(cache)).toBe(false)
  })

  it('キャッシュが無い場合は新しくない扱いになる', () => {
    expect(isCacheFresh(null)).toBe(false)
  })

  it('CACHE_FRESH_MSは10分と一致する', () => {
    expect(CACHE_FRESH_MS).toBe(10 * 60 * 1000)
  })
})
