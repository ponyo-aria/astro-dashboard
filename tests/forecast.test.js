import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fetchForecast, fetchModelUpdateInfo } from '../src/api/forecast.js'

function makePointResponse(lat, lng) {
  return { latitude: lat, longitude: lng, hourly: { time: ['2026-11-04T00:00'], cloud_cover_low: [10] } }
}

beforeEach(() => {
  vi.unstubAllGlobals()
})

describe('fetchForecast', () => {
  it('地点ごとに中心＋周辺4点＝5点ぶんの座標をまとめて1回のリクエストで送る', async () => {
    const locations = [
      { id: 'a', lat: 35.4, lng: 138.6 },
      { id: 'b', lat: 36.0, lng: 138.5 },
    ]

    let requestedUrl = null
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url) => {
        requestedUrl = url
        // 2地点 × 5点 = 10点ぶんのダミー応答を返す
        const body = Array.from({ length: 10 }, (_, i) => makePointResponse(35 + i, 138 + i))
        return { ok: true, json: async () => body }
      })
    )

    const result = await fetchForecast('msm', locations)

    expect(result).toHaveLength(2)
    expect(result[0].locationId).toBe('a')
    expect(result[0]).toHaveProperty('center')
    expect(result[0]).toHaveProperty('north')
    expect(result[0]).toHaveProperty('east')
    expect(result[0]).toHaveProperty('south')
    expect(result[0]).toHaveProperty('west')

    const url = new URL(requestedUrl)
    // ブラウザが覚えている古い応答を使い回さない
    expect(fetch.mock.calls[0][1]).toEqual({ cache: 'no-cache' })
    expect(url.pathname).toBe('/v1/jma')
    expect(url.searchParams.get('models')).toBe('jma_msm')
    // 2地点×5点=10個ぶんの緯度が渡っていること
    expect(url.searchParams.get('latitude').split(',')).toHaveLength(10)
  })

  it('参考モデル（GSM・AIFS）は中心の1点だけ・雲量と風速だけを取る', async () => {
    const locations = [
      { id: 'a', lat: 35.4, lng: 138.6 },
      { id: 'b', lat: 36.0, lng: 138.5 },
    ]
    let requestedUrl = null
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url) => {
        requestedUrl = url
        return { ok: true, json: async () => [makePointResponse(35.4, 138.6), makePointResponse(36, 138.5)] }
      })
    )

    const result = await fetchForecast('aifs', locations)
    expect(result).toHaveLength(2)
    expect(result[1].locationId).toBe('b')
    expect(result[1]).toHaveProperty('center')
    expect(result[1]).not.toHaveProperty('north')

    const url = new URL(requestedUrl)
    expect(url.pathname).toBe('/v1/ecmwf')
    expect(url.searchParams.get('models')).toBe('ecmwf_aifs025_single')
    expect(url.searchParams.get('latitude').split(',')).toHaveLength(2)
    expect(url.searchParams.get('hourly')).toBe('cloud_cover_low,cloud_cover_mid,cloud_cover_high,wind_speed_10m')
  })

  it('1地点だけのとき（応答が配列でなく1つだけ）も取り出せる', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => makePointResponse(35.4, 138.6) }))
    )
    const result = await fetchForecast('gsm', [{ id: 'a', lat: 35.4, lng: 138.6 }])
    expect(result[0].center.hourly.cloud_cover_low).toEqual([10])
  })

  it('地点が0件なら通信せずに空配列を返す', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const result = await fetchForecast('msm', [])
    expect(result).toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('通信エラー時（機内モードなど）は例外を投げる', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch')
      })
    )

    await expect(fetchForecast('msm', [{ id: 'a', lat: 35, lng: 138 }])).rejects.toThrow()
  })

  it('HTTPエラー応答のときも例外を投げる', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 500 }))
    )

    await expect(fetchForecast('msm', [{ id: 'a', lat: 35, lng: 138 }])).rejects.toThrow()
  })
})

describe('fetchModelUpdateInfo', () => {
  it('最終更新時刻（初期時刻）を取得できる', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url) => {
        expect(String(url)).toBe('https://api.open-meteo.com/data/jma_msm/static/meta.json')
        return {
          ok: true,
          json: async () => ({
            last_run_initialisation_time: 1793782800,
            last_run_availability_time: 1793795499,
            update_interval_seconds: 10800,
          }),
        }
      })
    )

    const info = await fetchModelUpdateInfo('msm')
    expect(info.initTime).toEqual(new Date(1793782800 * 1000))
    expect(info.updateIntervalSeconds).toBe(10800)
  })
})
