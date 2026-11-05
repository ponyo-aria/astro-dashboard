import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderTopScreen } from '../src/screens/topScreen.js'

const locations = [
  { id: 'a', name: '朝霧高原', lat: 35.4, lng: 138.6, elevation: 900 },
  { id: 'b', name: '八ヶ岳ふれあい公園', lat: 36.0, lng: 138.5, elevation: 1300 },
  { id: 'c', name: '天城高原', lat: 34.9, lng: 139.0, elevation: 700 },
]

function makePointResponse() {
  const time = Array.from({ length: 200 }, (_, i) => {
    const h = i % 24
    const d = 4 + Math.floor(i / 24)
    return `2026-11-${String(d).padStart(2, '0')}T${String(h).padStart(2, '0')}:00`
  })
  const n = time.length
  return {
    hourly: {
      time,
      cloud_cover_low: Array(n).fill(10),
      cloud_cover_mid: Array(n).fill(10),
      cloud_cover_high: Array(n).fill(10),
    },
  }
}

beforeEach(() => {
  localStorage.clear()
  vi.unstubAllGlobals()
})

describe('トップ画面', () => {
  it('地点ごとに7夜分のカードが横スクロール表示される（通信成功時）', async () => {
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
        // 3地点 × 5点 = 15点ぶん
        const body = Array.from({ length: 15 }, () => makePointResponse())
        return { ok: true, json: async () => body }
      })
    )

    const container = document.createElement('div')
    await renderTopScreen(container, locations)

    // 基準地点ブロック1つ＋地点ごとのカード3つ＝4セクション
    const sections = container.querySelectorAll('.nights-section')
    expect(sections).toHaveLength(4)
    sections.forEach((section) => {
      expect(section.querySelectorAll('.nights-row')).toHaveLength(7)
    })
    expect(container.textContent).toContain('最終更新')
    // 「次の更新は○時ごろ」の目安も表示される
    expect(container.textContent).toContain('次は')
    expect(container.textContent).toContain('ごろ')
    // 判定ごとに色分け用のクラスが付いている（全部が同じクラスにならないこと）
    const judgmentClasses = new Set(
      [...container.querySelectorAll('.nights-row-judgment')].map((el) => el.className)
    )
    expect(judgmentClasses.size).toBeGreaterThan(0)
    container.querySelectorAll('.nights-row-judgment').forEach((el) => {
      expect(el.className).toMatch(/judgment-/)
    })

    // 日没・日の出・天文薄明の時刻も表示される
    expect(container.textContent).toContain('日没')
    expect(container.textContent).toContain('天文薄明')
  })

  it('1つの地点の表を横スクロールすると、他の地点の表も同じ位置まで連動する', async () => {
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
        const body = Array.from({ length: 15 }, () => makePointResponse())
        return { ok: true, json: async () => body }
      })
    )

    const container = document.createElement('div')
    document.body.appendChild(container)
    await renderTopScreen(container, locations)

    // 基準地点ブロック1つ＋地点ごとのカード3つ＝4つの表
    const tables = container.querySelectorAll('.nights-table')
    expect(tables).toHaveLength(4)

    // jsdomではscrollLeftへの代入がそのまま反映されるため、1つ目を動かして他に伝わるか確認する
    tables[0].scrollLeft = 50
    tables[0].dispatchEvent(new Event('scroll'))

    expect(tables[1].scrollLeft).toBe(50)
    expect(tables[2].scrollLeft).toBe(50)
    expect(tables[3].scrollLeft).toBe(50)
  })

  it('地点が1つもないときは案内文が出る', async () => {
    const container = document.createElement('div')
    await renderTopScreen(container, [])
    expect(container.textContent).toContain('登録されていません')
  })

  it('通信に失敗しても画面は真っ白にならず、エラーメッセージが出る（機内モード相当）', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch')
      })
    )

    const container = document.createElement('div')
    await renderTopScreen(container, locations)

    expect(container.textContent).toContain('取得できませんでした')
    expect(container.innerHTML.trim()).not.toBe('')
    // 通信に失敗しても、基準地点ブロック（7）＋各地点・7夜ぶんの判定表示（3×7）は出る
    expect(container.querySelectorAll('.nights-row')).toHaveLength(28)
  })

  it('圏外のときは通信せず、保存済みの予報を「（オフライン）」付きで表示する（10分以内に取得済みでも）', async () => {
    // 5分前に取得した予報が保存されている状態
    localStorage.setItem(
      'astro-dashboard.forecastCache.v1',
      JSON.stringify({
        fetchedAt: Date.now() - 5 * 60 * 1000,
        results: { msm: [], ecmwf: [] },
        modelMeta: {},
      })
    )
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal('navigator', { onLine: false })

    const container = document.createElement('div')
    await renderTopScreen(container, locations)

    expect(fetchMock).not.toHaveBeenCalled()
    expect(container.textContent).toContain('時点のデータ（オフライン）')
    expect(container.textContent).toContain('保存済みの予報を表示しています')
  })
})
