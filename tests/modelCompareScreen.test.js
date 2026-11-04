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
    cloud_cover_low: Array(n).fill(10),
    cloud_cover_mid: Array(n).fill(10),
    cloud_cover_high: Array(n).fill(10),
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

beforeEach(() => {
  localStorage.clear()
  vi.unstubAllGlobals()
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      json: async () => ({
        last_run_initialisation_time: 1793782800,
        last_run_availability_time: 1793795499,
        update_interval_seconds: 10800,
      }),
    }))
  )
})

describe('モデル比較画面', () => {
  it('地点ごとに、夜×モデルの判定が表で並ぶ', async () => {
    saveForecastCache(makeCache())
    const container = document.createElement('div')

    await renderModelCompareScreen(container, locations)

    const tables = container.querySelectorAll('.compare-table')
    expect(tables).toHaveLength(2)
    tables.forEach((table) => {
      expect(table.querySelectorAll('tbody tr')).toHaveLength(7)
    })
    expect(container.textContent).toContain('最終更新')
    expect(container.textContent).toContain('次は')
  })

  it('予報データが無いときは案内文が出る', async () => {
    const container = document.createElement('div')
    await renderModelCompareScreen(container, locations)
    expect(container.textContent).toContain('更新')
  })

  it('地点が1つもないときは案内文が出る', async () => {
    const container = document.createElement('div')
    await renderModelCompareScreen(container, [])
    expect(container.textContent).toContain('登録されていません')
  })
})
