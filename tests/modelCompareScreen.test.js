import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderModelCompareScreen } from '../src/screens/modelCompareScreen.js'
import { saveForecastCache } from '../src/storage/forecastCache.js'

const locations = [
  { id: 'a', name: '朝霧高原', lat: 35.4, lng: 138.6, elevation: 900 },
  { id: 'b', name: '八ヶ岳ふれあい公園', lat: 36.0, lng: 138.5, elevation: 1300 },
]

function makeHourly() {
  const time = Array.from({ length: 200 }, (_, i) => {
    const h = i % 24
    const d = 4 + Math.floor(i / 24)
    return `2026-11-${String(d).padStart(2, '0')}T${String(h).padStart(2, '0')}:00`
  })
  const n = time.length
  return {
    time,
    cloud_cover_low: Array(n).fill(0),
    cloud_cover_mid: Array(n).fill(0),
    cloud_cover_high: Array(n).fill(0),
  }
}

function makeCache() {
  const makeGroup = (locationId) => {
    const hourly = makeHourly()
    return {
      locationId,
      center: { hourly },
      north: { hourly },
      east: { hourly },
      south: { hourly },
      west: { hourly },
    }
  }
  return {
    fetchedAt: Date.now(),
    results: {
      msm: locations.map((l) => makeGroup(l.id)),
      ecmwf: locations.map((l) => makeGroup(l.id)),
    },
    modelMeta: {},
  }
}

const META = {
  msm: {
    initTime: '2026-11-05T03:00:00.000Z', // 12:00 JST の予報
    availableTime: '2026-11-05T06:30:00.000Z', // 15:30 JST に公開
    updateIntervalSeconds: 10800,
  },
  ecmwf: {
    initTime: '2026-11-05T00:00:00.000Z',
    availableTime: '2026-11-05T08:00:00.000Z',
    updateIntervalSeconds: 21600,
  },
}

// 予報の取得（2地点×5点）と更新情報の取得に答える、通信の代わり
function stubFetch() {
  const fetchMock = vi.fn(async (url) => {
    if (String(url).includes('static/meta.json')) {
      return {
        ok: true,
        json: async () => ({
          last_run_initialisation_time: 1793782800,
          last_run_availability_time: 1793795499,
          update_interval_seconds: 10800,
        }),
      }
    }
    return { ok: true, json: async () => Array.from({ length: 10 }, () => ({ hourly: makeHourly() })) }
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

beforeEach(() => {
  localStorage.clear()
  vi.unstubAllGlobals()
})

describe('モデル比較画面', () => {
  it('モデルの説明・更新時刻と、地点ごとに7夜×モデルの表が並ぶ', () => {
    const cache = makeCache()
    // MSMは実際と同じく数日先までしか無い（それより先の夜は「範囲外」）
    cache.results.msm.forEach((g) => {
      const h = g.center.hourly
      g.center.hourly = Object.fromEntries(Object.entries(h).map(([k, v]) => [k, v.slice(0, 72)]))
    })
    saveForecastCache({ ...cache, modelMeta: META })
    const container = document.createElement('div')
    renderModelCompareScreen(container, locations)

    expect(container.textContent).toContain('気象庁・約5km四方')
    // 12:00の予報（15:30公開）→ 次は 18:30 ごろ
    expect(container.textContent).toContain('12:00の予報・15:30に公開')
    // 次の予報の状態は実際の今の時刻で変わるので、3つの状態のどれかが出ていればよい
    // （状態の決め方そのものは tests/modelUpdate.test.js で確かめている）
    expect(container.textContent).toMatch(/次の予報は 18:30(ごろ|予定・公開待ち)|新しい予報あり/)

    const tables = container.querySelectorAll('.compare-table')
    expect(tables).toHaveLength(2)
    tables.forEach((table) => {
      expect(table.querySelectorAll('tbody tr')).toHaveLength(7)
    })
    // 快晴データの夜は「可」（緑）で、時間と横棒が出る
    const goCell = container.querySelector('.compare-cell.is-go')
    expect(goCell.querySelector('.compare-hours').textContent).toMatch(/^\d+h$/)
    expect(goCell.querySelector('.compare-bar i').style.width).toMatch(/%$/)
    // MSMの範囲外の夜は「範囲外」
    expect(container.querySelector('.compare-cell.is-out:not(.is-reference)').textContent).toBe('範囲外')
    // 参考モデル（GSM・AIFS）の予報が無い（古い保存データなど）ときは「―」
    expect(container.querySelector('.compare-cell.is-reference').textContent).toBe('―')
  })

  it('2つのモデルで判定が割れた夜は、行に印が付く', () => {
    const cache = makeCache()
    // ECMWFだけ一晩中曇り → MSMは可・ECMWFは不可で「割れ」
    cache.results.ecmwf.forEach((g) => {
      g.center.hourly = { ...g.center.hourly, cloud_cover_low: g.center.hourly.cloud_cover_low.map(() => 90) }
    })
    saveForecastCache(cache)
    const container = document.createElement('div')
    renderModelCompareScreen(container, locations)
    expect(container.querySelectorAll('tr.is-split').length).toBeGreaterThan(0)
    expect(container.querySelector('tr.is-split .compare-symbol').textContent).toBe('△')
  })

  it('更新ボタンで予報を取り直し、ホームにも知らせる', async () => {
    saveForecastCache({ ...makeCache(), fetchedAt: 0, modelMeta: META })
    const fetchMock = stubFetch()
    const onUpdated = vi.fn()
    const container = document.createElement('div')
    renderModelCompareScreen(container, locations, { onUpdated })

    container.querySelector('[aria-label="更新"]').click()
    await vi.waitFor(() => expect(onUpdated).toHaveBeenCalled())
    // 予報（MSM・ECMWF・参考のGSM・AIFS・瞬間風速用のECMWF 9km）と更新情報（4モデル）＝9回の通信
    expect(fetchMock).toHaveBeenCalledTimes(9)
    expect(container.querySelector('.top-status').textContent).not.toContain('1/1')
    expect(container.querySelectorAll('.compare-table')).toHaveLength(2)
  })

  it('圏外で更新ボタンを押すと、保存済みの予報のまま「取得できませんでした」と出る', () => {
    saveForecastCache({ ...makeCache(), modelMeta: META })
    vi.stubGlobal('navigator', { onLine: false })
    const container = document.createElement('div')
    renderModelCompareScreen(container, locations)

    container.querySelector('[aria-label="更新"]').click()
    expect(container.textContent).toContain('取得できませんでした。保存済みの予報を表示しています')
    expect(container.querySelector('.badge-offline')).not.toBeNull()
    expect(container.querySelectorAll('.compare-table')).toHaveLength(2)
  })

  it('予報データが無いときは案内文が出る', () => {
    const container = document.createElement('div')
    renderModelCompareScreen(container, locations)
    expect(container.textContent).toContain('更新ボタンを押してください')
  })

  it('地点が1つもないときは案内文が出る', () => {
    const container = document.createElement('div')
    renderModelCompareScreen(container, [])
    expect(container.textContent).toContain('登録されていません')
  })

  it('行を押すと詳細を開く。MSM・ECMWFのマスを押したときは、そのモデルで開く', () => {
    saveForecastCache({ ...makeCache(), modelMeta: META })
    const onOpenDetail = vi.fn()
    const container = document.createElement('div')
    renderModelCompareScreen(container, locations, { onOpenDetail })

    const firstRow = container.querySelector('.compare-table tbody tr')
    firstRow.querySelector('[data-model="ecmwf"]').click()
    expect(onOpenDetail).toHaveBeenLastCalledWith(
      locations[0],
      expect.any(Date),
      expect.objectContaining({ model: 'ecmwf', nightDates: expect.any(Array) })
    )
    firstRow.querySelector('[data-model="msm"]').click()
    expect(onOpenDetail.mock.lastCall[2].model).toBe('msm')
    // 日付のところを押したときは、モデルは自動
    firstRow.querySelector('.compare-date').click()
    expect(onOpenDetail.mock.lastCall[2].model).toBeNull()
    expect(onOpenDetail.mock.lastCall[2].nightDates).toHaveLength(7)
  })

  it('参考モデル（GSM・AIFS）の列が並ぶが、判定（◎△×）はMSM・ECMWFだけで決まる', () => {
    const cache = makeCache()
    // GSM・AIFSは一晩中曇り（判定に使っていれば「×」や「△」になるはず）
    const cloudy = { ...makeHourly(), cloud_cover_low: makeHourly().cloud_cover_low.map(() => 100) }
    cache.results.gsm = locations.map((l) => ({ locationId: l.id, center: { hourly: cloudy } }))
    cache.results.aifs = locations.map((l) => ({ locationId: l.id, center: { hourly: cloudy } }))
    saveForecastCache(cache)
    const container = document.createElement('div')
    renderModelCompareScreen(container, locations)

    const headers = [...container.querySelectorAll('.compare-table thead .model-chip')].map((e) => e.textContent)
    expect(headers.slice(0, 4)).toEqual(['MSM', 'ECMWF', 'GSM', 'AIFS'])
    const firstRow = container.querySelector('.compare-table tbody tr')
    expect(firstRow.querySelectorAll('.compare-cell')).toHaveLength(4)
    expect(firstRow.querySelectorAll('.compare-cell.is-reference.is-no-go')).toHaveLength(2)
    // MSM・ECMWFは快晴なので判定は◎のまま
    expect(firstRow.querySelector('.compare-symbol').textContent).toBe('◎')
    // 参考モデルのマスを押すと、そのモデルで詳細を開ける
    expect(firstRow.querySelector('[data-model="aifs"]')).not.toBeNull()
  })

  it('4つのモデルの列は同じ幅に固定されている（横棒の長さで見比べられるように）', () => {
    saveForecastCache(makeCache())
    const container = document.createElement('div')
    renderModelCompareScreen(container, locations)
    const table = container.querySelector('.compare-table')
    const cols = [...table.querySelectorAll('colgroup col')].map((c) => c.className)
    expect(cols).toEqual(['col-date', 'col-model', 'col-model', 'col-model', 'col-model', 'col-judge'])
  })
})
