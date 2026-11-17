import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fetchForecast, fetchModelUpdateInfo, FetchTimeoutError } from '../src/api/forecast.js'
import { config } from '../src/config.js'

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
    expect(fetch.mock.calls[0][1].cache).toBe('no-cache')
    // 待ち時間の上限を過ぎたら打ち切れるよう、打ち切りの合図（signal）を渡している
    expect(fetch.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal)
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

  it('瞬間風速用のECMWF 9km版は、中心の1点だけ・風速と瞬間風速だけを取る', async () => {
    let requestedUrl = null
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url) => {
        requestedUrl = url
        return { ok: true, json: async () => makePointResponse(35.4, 138.6) }
      })
    )
    await fetchForecast('ecmwfWind', [{ id: 'a', lat: 35.4, lng: 138.6 }])
    const url = new URL(requestedUrl)
    expect(url.searchParams.get('models')).toBe('ecmwf_ifs')
    expect(url.searchParams.get('hourly')).toBe('wind_speed_10m,wind_gusts_10m')
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

describe('待ち時間の上限（時間切れ）', () => {
  // 返事がいつまでも来ない通信の代わり。打ち切りの合図が来たら失敗する（本物のブラウザと同じ動き）
  function stubHangingFetch() {
    const fetchMock = vi.fn(
      (url, { signal }) =>
        new Promise((_, reject) => {
          signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
        })
    )
    vi.stubGlobal('fetch', fetchMock)
    return fetchMock
  }

  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('MSMは上限（30秒）を過ぎたら時間切れになり、通信を打ち切る', async () => {
    const fetchMock = stubHangingFetch()
    const promise = fetchForecast('msm', [{ id: 'a', lat: 35, lng: 138 }])
    const result = promise.catch((e) => e)

    await vi.advanceTimersByTimeAsync((config.fetchTimeoutSeconds - 1) * 1000)
    // 上限の1秒前はまだ待っている
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(false)

    await vi.advanceTimersByTimeAsync(1000)
    const error = await result
    expect(error).toBeInstanceOf(FetchTimeoutError)
    expect(error.timedOut).toBe(true)
    expect(error.seconds).toBe(config.fetchTimeoutSeconds)
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true)
  })

  it('返事は来たが中身の受け取りが終わらないときも、時間切れになる', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: () => new Promise(() => {}) }))
    )
    const result = fetchModelUpdateInfo('msm').catch((e) => e)
    await vi.advanceTimersByTimeAsync(config.fetchTimeoutSeconds * 1000)
    expect(await result).toBeInstanceOf(FetchTimeoutError)
  })

  it('参考モデル（GSM）は上限が長く（60秒）、30秒ではまだ待っている', async () => {
    const fetchMock = stubHangingFetch()
    const result = fetchForecast('gsm', [{ id: 'a', lat: 35, lng: 138 }]).catch((e) => e)

    await vi.advanceTimersByTimeAsync(config.fetchTimeoutSeconds * 1000)
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(false)

    await vi.advanceTimersByTimeAsync(
      (config.referenceFetchTimeoutSeconds - config.fetchTimeoutSeconds) * 1000
    )
    const error = await result
    expect(error).toBeInstanceOf(FetchTimeoutError)
    expect(error.seconds).toBe(config.referenceFetchTimeoutSeconds)
  })

  it('上限より早く届いたときは、ふつうに結果を返す', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => [makePointResponse(35, 138)] }))
    )
    const result = await fetchForecast('gsm', [{ id: 'a', lat: 35, lng: 138 }])
    expect(result[0].center.latitude).toBe(35)
  })
})
