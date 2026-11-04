import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderForecastScreen } from '../src/screens/forecastScreen.js'

const locations = [{ id: 'a', name: 'テスト地点', lat: 35.4, lng: 138.6, elevation: 900 }]

beforeEach(() => {
  localStorage.clear()
  vi.unstubAllGlobals()
})

describe('予報データ確認画面', () => {
  it('通信に成功すると、最終取得時刻と雲量の表が表示される', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url) => {
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
        return {
          ok: true,
          json: async () =>
            Array.from({ length: 5 }, () => ({
              hourly: { time: ['2026-11-04T00:00'], cloud_cover_low: [10], cloud_cover_mid: [20], cloud_cover_high: [30] },
            })),
        }
      })
    )

    const container = document.createElement('div')
    await renderForecastScreen(container, locations)

    expect(container.textContent).toContain('最終取得')
    expect(container.textContent).toContain('低層10%')
  })

  it('通信に失敗しても画面は真っ白にならず、エラーメッセージが出る（機内モード相当）', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch')
      })
    )

    const container = document.createElement('div')
    await renderForecastScreen(container, locations)

    expect(container.textContent).toContain('取得できませんでした')
    expect(container.innerHTML.trim()).not.toBe('')
  })
})
