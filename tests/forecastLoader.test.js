import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fetchAndSaveForecast } from '../src/api/forecastLoader.js'
import { loadForecastCache } from '../src/storage/forecastCache.js'

const locations = [{ id: 'a', lat: 35.4, lng: 138.6 }]
const point = { hourly: { time: ['2026-11-05T00:00'], cloud_cover_low: [0] } }
const meta = { last_run_initialisation_time: 1793782800, last_run_availability_time: 1793795499, update_interval_seconds: 10800 }

beforeEach(() => {
  localStorage.clear()
  vi.unstubAllGlobals()
})

describe('予報の取得と保存', () => {
  it('MSM・ECMWF・GSM・AIFSの予報と更新時刻をまとめて保存する', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url) => ({
        ok: true,
        json: async () => (String(url).includes('meta.json') ? meta : Array(5).fill(point)),
      }))
    )
    const cache = await fetchAndSaveForecast(locations)
    expect(Object.keys(cache.results)).toEqual(['msm', 'ecmwf', 'gsm', 'aifs'])
    expect(cache.results.gsm[0]).toHaveProperty('center')
    expect(cache.modelMeta.aifs.updateIntervalSeconds).toBe(10800)
    expect(loadForecastCache().results.aifs).toHaveLength(1)
  })

  it('参考モデル（GSM・AIFS）の取得に失敗しても、MSM・ECMWFは保存される', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url) => {
        const u = String(url)
        if (u.includes('jma_gsm') || u.includes('ecmwf_aifs025_single')) throw new TypeError('Failed to fetch')
        return { ok: true, json: async () => (u.includes('meta.json') ? meta : Array(5).fill(point)) }
      })
    )
    const cache = await fetchAndSaveForecast(locations)
    expect(cache.results.msm).toHaveLength(1)
    expect(cache.results.gsm).toBeUndefined()
    expect(cache.modelMeta.aifs).toBeUndefined()
  })

  it('MSM・ECMWFの取得に失敗したときは、全体を失敗にする（画面は保存済みの予報を出す）', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch')
      })
    )
    await expect(fetchAndSaveForecast(locations)).rejects.toThrow()
    expect(loadForecastCache()).toBeNull()
  })
})

describe('端末に保存できなかったとき', () => {
  it('保存に失敗しても、取得した予報は使える（保存できなかった印が付く）', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url) => ({
        ok: true,
        json: async () => (String(url).includes('meta.json') ? meta : Array(5).fill(point)),
      }))
    )
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('いっぱい', 'QuotaExceededError')
    })
    const cache = await fetchAndSaveForecast(locations)
    setItem.mockRestore()
    expect(cache.results.msm).toHaveLength(1)
    expect(cache.notSaved).toBe(true)
  })
})
