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
  it('MSM・ECMWF・GSM・AIFSの予報と更新時刻、瞬間風速用のECMWF 9km版をまとめて保存する', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url) => ({
        ok: true,
        json: async () => (String(url).includes('meta.json') ? meta : Array(5).fill(point)),
      }))
    )
    const cache = await fetchAndSaveForecast(locations)
    expect(Object.keys(cache.results)).toEqual(['msm', 'ecmwf', 'gsm', 'aifs', 'ecmwfWind'])
    expect(cache.results.ecmwfWind[0]).toHaveProperty('center')
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

describe('MSM・ECMWFを先に画面へ渡す', () => {
  it('参考モデルがまだ届いていなくても、MSM・ECMWFが届いた時点で onMainReady が呼ばれ、保存もされる', async () => {
    // 参考モデル（GSM・AIFS・瞬間風速用ECMWF 9km版）だけ、合図するまで返事を止めておく
    let releaseReference
    const referenceGate = new Promise((resolve) => {
      releaseReference = resolve
    })
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url) => {
        const u = String(url)
        if (u.includes('jma_gsm') || u.includes('ecmwf_aifs025_single') || u.includes('models=ecmwf_ifs&')) {
          await referenceGate
        }
        return { ok: true, json: async () => (u.includes('meta.json') ? meta : Array(5).fill(point)) }
      })
    )

    const onMainReady = vi.fn()
    const done = fetchAndSaveForecast(locations, { onMainReady })
    await vi.waitFor(() => expect(onMainReady).toHaveBeenCalledTimes(1))

    const mainCache = onMainReady.mock.calls[0][0]
    expect(mainCache.results.msm).toHaveLength(1)
    expect(mainCache.results.ecmwf).toHaveLength(1)
    expect(mainCache.results.gsm).toBeUndefined()
    // 参考モデルを待っている間に閉じても、MSM・ECMWFは端末に残っている
    expect(loadForecastCache().results.msm).toHaveLength(1)

    releaseReference()
    const cache = await done
    expect(cache.results.gsm).toHaveLength(1)
    expect(cache.results.ecmwfWind).toHaveLength(1)
    expect(cache.fetchedAt).toBe(mainCache.fetchedAt)
    expect(loadForecastCache().results.aifs).toHaveLength(1)
  })

  it('MSM・ECMWFの取得に失敗したときは、onMainReady は呼ばれない', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch')
      })
    )
    const onMainReady = vi.fn()
    await expect(fetchAndSaveForecast(locations, { onMainReady })).rejects.toThrow()
    expect(onMainReady).not.toHaveBeenCalled()
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
