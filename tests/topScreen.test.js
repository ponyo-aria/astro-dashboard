import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderTopScreen } from '../src/screens/topScreen.js'

const locations = [
  { id: 'a', name: '朝霧高原', lat: 35.4, lng: 138.6, elevation: 900 },
  { id: 'b', name: '八ヶ岳ふれあい公園', lat: 36.0, lng: 138.5, elevation: 1300 },
  { id: 'c', name: '天城高原', lat: 34.9, lng: 139.0, elevation: 700 },
]

// 今日から10日ぶんの、1時間ごとの「快晴」データ（日本時間）
function makePointResponse() {
  const start = new Date()
  start.setUTCHours(0, 0, 0, 0)
  const time = Array.from({ length: 240 }, (_, i) => {
    const d = new Date(start.getTime() + (i - 24) * 3600 * 1000 + 9 * 3600 * 1000)
    return d.toISOString().slice(0, 13) + ':00'
  })
  const n = time.length
  return {
    hourly: {
      time,
      cloud_cover_low: Array(n).fill(0),
      cloud_cover_mid: Array(n).fill(0),
      cloud_cover_high: Array(n).fill(0),
      wind_speed_10m: Array(n).fill(21.6), // 6m/s（注意しきい値5m/s以上）
    },
  }
}

function stubSuccessfulFetch() {
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
}

beforeEach(() => {
  localStorage.clear()
  vi.unstubAllGlobals()
})

describe('トップ画面', () => {
  it('7夜のタブと、地点ごとの行が並ぶ表が出る（通信成功時）', async () => {
    stubSuccessfulFetch()
    const container = document.createElement('div')
    await renderTopScreen(container, locations)

    const tabs = container.querySelectorAll('.night-tab')
    expect(tabs).toHaveLength(7)
    // 最初は1夜目が選ばれている
    expect(tabs[0].getAttribute('aria-selected')).toBe('true')
    // 各タブに月の形の絵と判定記号がある
    tabs.forEach((tab) => {
      expect(tab.querySelector('svg.moon-icon')).not.toBeNull()
      expect(tab.querySelector('.night-tab-status').className).toMatch(/judgment-/)
    })

    // 表：地点ごとに1行
    const rows = container.querySelectorAll('.matrix-row')
    expect(rows).toHaveLength(3)
    expect(rows[0].textContent).toContain('朝霧高原')
    // 空の状態の帯と、雲のマスがある
    expect(container.querySelectorAll('.matrix-sky').length).toBeGreaterThan(0)
    const cellsPerRow = rows[0].querySelectorAll('.matrix-cell').length
    expect(cellsPerRow).toBe(container.querySelectorAll('.matrix-sky').length)
    // マスの中に風速（m/s）が小さく出て、注意しきい値以上は強調される
    const wind = rows[0].querySelector('.cell-wind')
    expect(wind.textContent).toBe('6')
    expect(wind.classList.contains('text-caution')).toBe(true) // 6m/s＝注意（黄）
    // 快晴データなので、晴れの印が付いたマスがある
    expect(container.querySelectorAll('.matrix-cell.is-clear').length).toBeGreaterThan(0)

    // 凡例に「行を押すと詳細」は書かない（2026-11-05 オーナー指示で削除）
    expect(container.querySelector('.matrix-section').textContent).not.toContain('行を押すと詳細')

    // 選んだ夜の要点と取得時刻
    expect(container.textContent).toContain('暗い時間')
    expect(container.textContent).toContain('取得')
  })

  it('タブを押すと、選んだ夜の表示に切り替わる', async () => {
    stubSuccessfulFetch()
    const container = document.createElement('div')
    await renderTopScreen(container, locations)

    const before = container.querySelector('.night-summary-date').textContent
    container.querySelectorAll('.night-tab')[3].click()

    const tabs = container.querySelectorAll('.night-tab')
    expect(tabs[3].getAttribute('aria-selected')).toBe('true')
    expect(tabs[0].getAttribute('aria-selected')).toBe('false')
    expect(container.querySelector('.night-summary-date').textContent).not.toBe(before)
    // 表は選んだ夜のものに描き直される（行の数は変わらない）
    expect(container.querySelectorAll('.matrix-row')).toHaveLength(3)

    // 次のテストのために1夜目に戻しておく
    tabs[0].click()
  })

  it('行を押すと、その地点・その夜の詳細を開く', async () => {
    stubSuccessfulFetch()
    const onCardClick = vi.fn()
    const container = document.createElement('div')
    await renderTopScreen(container, locations, { onCardClick })

    container.querySelectorAll('.matrix-row')[1].click()
    expect(onCardClick).toHaveBeenCalledTimes(1)
    expect(onCardClick.mock.calls[0][0].name).toBe('八ヶ岳ふれあい公園')
    expect(onCardClick.mock.calls[0][1]).toBeInstanceOf(Date)
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
    // 予報が無くても、7夜のタブと地点ごとの行（判定は「データなし」）は出る
    expect(container.querySelectorAll('.night-tab')).toHaveLength(7)
    expect(container.querySelectorAll('.matrix-row')).toHaveLength(3)
    expect(container.textContent).toContain('データなし')
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
    expect(container.querySelector('.badge-offline')).not.toBeNull()
  })

  it('上の欄にMSMの次の予報の目安が出る（まだ先／新しい予報あり／公開待ち）', async () => {
    const now = Date.now()
    // 1分前に取得済み（10分以内なので通信はしない）。availableAgoSec：その予報が公開されてからの秒数
    const saveMeta = (availableAgoSec) =>
      localStorage.setItem(
        'astro-dashboard.forecastCache.v1',
        JSON.stringify({
          fetchedAt: now - 60 * 1000,
          results: { msm: [], ecmwf: [] },
          modelMeta: {
            msm: {
              initTime: new Date(now - availableAgoSec * 1000 - 3.5 * 3600e3).toISOString(),
              availableTime: new Date(now - availableAgoSec * 1000).toISOString(),
              updateIntervalSeconds: 10800,
            },
          },
        })
      )
    const statusText = async () => {
      const container = document.createElement('div')
      await renderTopScreen(container, locations)
      return container.querySelector('.top-status').textContent
    }

    // 1時間前に公開 → 次回は2時間後
    saveMeta(3600)
    expect(await statusText()).toMatch(/MSM次回 \d+:\d\dごろ/)

    // 次回の目安（30秒前）は、取得した時刻（1分前）より後 → 更新すれば新しい予報が取れるはず
    saveMeta(3 * 3600 + 30)
    expect(await statusText()).toContain('MSM 新しい予報あり')

    // 次回の目安（1時間前）を過ぎてから取得したのに、まだ同じ予報 → 公開が遅れている
    saveMeta(4 * 3600)
    expect(await statusText()).toContain('MSM次回 まもなく')
  })

  describe('基準地点＝現在地', () => {
    const selectedText = (container) => {
      const select = container.querySelector('.night-summary-ref select')
      return select.options[select.selectedIndex].textContent
    }

    it('位置情報が取れたら、何も選んでいなくても現在地が基準地点になり、端末に覚えておく', async () => {
      stubSuccessfulFetch()
      vi.stubGlobal('navigator', {
        onLine: true,
        geolocation: {
          getCurrentPosition: (ok) => ok({ coords: { latitude: 35.7, longitude: 139.7, altitude: 40 } }),
        },
      })
      const container = document.createElement('div')
      await renderTopScreen(container, locations)

      expect(selectedText(container)).toBe('現在地')
      const saved = JSON.parse(localStorage.getItem('astro-dashboard.currentPosition.v1'))
      expect(saved).toMatchObject({ lat: 35.7, lng: 139.7, elevation: 40 })
    })

    it('位置情報が許可されなかったら、野辺山（八ヶ岳ふれあい公園）で表示し、その旨を出す', async () => {
      stubSuccessfulFetch()
      vi.stubGlobal('navigator', {
        onLine: true,
        geolocation: { getCurrentPosition: (_ok, ng) => ng({ code: 1 }) },
      })
      const container = document.createElement('div')
      await renderTopScreen(container, locations)

      expect(selectedText(container)).toBe('現在地（取得できず：八ヶ岳ふれあい公園で表示中）')
    })

    it('前に取れた現在地は、位置情報がすぐ取れなくても（圏外など）使える', async () => {
      localStorage.setItem(
        'astro-dashboard.currentPosition.v1',
        JSON.stringify({ lat: 35.7, lng: 139.7, elevation: 0, obtainedAt: Date.now() })
      )
      stubSuccessfulFetch() // navigator.geolocation が無い環境
      const container = document.createElement('div')
      await renderTopScreen(container, locations)
      expect(selectedText(container)).toBe('現在地')
    })

    it('登録地点を選べば、その地点が基準地点になる', async () => {
      localStorage.setItem('astro-dashboard.selectedLocationId.v1', 'a')
      stubSuccessfulFetch()
      const container = document.createElement('div')
      await renderTopScreen(container, locations)
      expect(selectedText(container)).toBe('朝霧高原')
    })
  })

  it('表の上のボタンでMSM・ECMWFを切り替えると、雲のマスがそのモデルの予報になる', async () => {
    // MSMは快晴・3日先まで、ECMWFは一晩中曇り・10日先まで（1分前に取得済みなので通信しない）
    const clear = makePointResponse().hourly
    const msmHourly = Object.fromEntries(Object.entries(clear).map(([k, v]) => [k, v.slice(0, 24 * 4)]))
    const ecmwfHourly = { ...clear, cloud_cover_low: clear.cloud_cover_low.map(() => 100) }
    const group = (id, hourly) => ({ locationId: id, center: { hourly }, north: { hourly }, east: { hourly }, south: { hourly }, west: { hourly } })
    localStorage.setItem(
      'astro-dashboard.forecastCache.v1',
      JSON.stringify({
        fetchedAt: Date.now() - 60 * 1000,
        results: {
          msm: locations.map((l) => group(l.id, msmHourly)),
          ecmwf: locations.map((l) => group(l.id, ecmwfHourly)),
        },
        modelMeta: {},
      })
    )
    const container = document.createElement('div')
    await renderTopScreen(container, locations)
    const buttons = () => [...container.querySelectorAll('.matrix-model-switch .segmented-button')]
    const pressed = () => buttons().find((b) => b.getAttribute('aria-pressed') === 'true').textContent

    // 最初はMSM（快晴なので晴れの印のマスがある）
    expect(pressed()).toBe('MSM')
    expect(container.querySelectorAll('.matrix-cell.is-clear').length).toBeGreaterThan(0)

    // ECMWFに切り替え → 一晩中曇りなので晴れの印は無い。左端の判定は変わらない
    const judgmentBefore = container.querySelector('.matrix-judgment').textContent
    buttons()[1].click()
    expect(pressed()).toBe('ECMWF')
    expect(container.querySelectorAll('.matrix-cell.is-clear')).toHaveLength(0)
    expect(container.querySelector('.matrix-judgment').textContent).toBe(judgmentBefore)

    // MSMに戻して、MSMが届かない夜（7夜目）に移ると、MSMは押せずECMWFで表示される
    buttons()[0].click()
    container.querySelectorAll('.night-tab')[6].click()
    expect(buttons()[0].disabled).toBe(true)
    expect(pressed()).toBe('ECMWF')
    // 1夜目に戻ると、選んでいたMSMの表示に戻る
    container.querySelectorAll('.night-tab')[0].click()
    expect(pressed()).toBe('MSM')
  })
})
