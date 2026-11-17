import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderTopScreen } from '../src/screens/topScreen.js'
import { renderModelCompareScreen } from '../src/screens/modelCompareScreen.js'
import { elapsedText, fetchErrorMessage, fallbackBadgeText } from '../src/screens/loadingIndicator.js'
import { FetchTimeoutError } from '../src/api/forecast.js'
import { config } from '../src/config.js'

const locations = [
  { id: 'a', name: '朝霧高原', lat: 35.4, lng: 138.6, elevation: 900 },
  { id: 'b', name: '八ヶ岳ふれあい公園', lat: 36.0, lng: 138.5, elevation: 1300 },
]

// 前日から10日ぶんの、1時間ごとの「快晴」データ（日本時間）
function makeHourly() {
  const start = new Date()
  start.setUTCHours(0, 0, 0, 0)
  const time = Array.from({ length: 264 }, (_, i) => {
    const d = new Date(start.getTime() + (i - 24) * 3600 * 1000 + 9 * 3600 * 1000)
    return d.toISOString().slice(0, 13) + ':00'
  })
  const n = time.length
  return {
    time,
    cloud_cover_low: Array(n).fill(0),
    cloud_cover_mid: Array(n).fill(0),
    cloud_cover_high: Array(n).fill(0),
    wind_speed_10m: Array(n).fill(0),
  }
}

const META = {
  last_run_initialisation_time: 1793782800,
  last_run_availability_time: 1793795499,
  update_interval_seconds: 10800,
}

function deferred() {
  let resolve
  const promise = new Promise((r) => {
    resolve = r
  })
  return { promise, resolve }
}

// 参考モデル（GSM・AIFS・瞬間風速用のECMWF 9km版）への通信か
function isReferenceRequest(url) {
  return /jma_gsm|ecmwf_aifs025_single|models=ecmwf_ifs&/.test(url)
}

/** 判定に使うモデルと参考モデルの返事を、それぞれ合図するまで止めておく通信の代わり */
function stubGatedFetch() {
  const gates = { main: deferred(), reference: deferred() }
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url) => {
      const u = String(url)
      await (isReferenceRequest(u) ? gates.reference.promise : gates.main.promise)
      const body = u.includes('meta.json') ? META : Array.from({ length: 10 }, () => ({ hourly: makeHourly() }))
      return { ok: true, json: async () => body }
    })
  )
  return gates
}

/** 返事がいつまでも来ない通信の代わり（打ち切りの合図が来たら失敗する） */
function stubHangingFetch() {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      (url, { signal }) =>
        new Promise((_, reject) => {
          signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
        })
    )
  )
}

// 1時間前に取得した予報（10分より古いので、開くと取り直しに行く）を保存しておく
function saveOldCache() {
  const group = (id) => {
    const point = { hourly: makeHourly() }
    return { locationId: id, center: point, north: point, east: point, south: point, west: point }
  }
  localStorage.setItem(
    'astro-dashboard.forecastCache.v1',
    JSON.stringify({
      fetchedAt: Date.now() - 60 * 60 * 1000,
      results: { msm: locations.map((l) => group(l.id)), ecmwf: locations.map((l) => group(l.id)) },
      modelMeta: {},
    })
  )
}

const refreshButton = (container) => container.querySelector('.refresh-button')
const statusText = (container) => container.querySelector('.top-status-line').textContent

beforeEach(() => {
  localStorage.clear()
  vi.unstubAllGlobals()
  // 基準地点は登録地点から選ぶ（現在地を取りに行かないようにする）
  localStorage.setItem('astro-dashboard.selectedLocationId.v1', 'b')
})

afterEach(() => {
  vi.useRealTimers()
})

describe('取得中の表示の文言', () => {
  it('待っている秒数を、切り捨てた整数の秒で出す', () => {
    expect(elapsedText(1000, 1000)).toBe('0秒')
    expect(elapsedText(1000, 13_900)).toBe('12秒')
  })

  it('時間切れのときは何秒待ったかを出し、札は「時間切れ」にする', () => {
    const error = new FetchTimeoutError(30)
    expect(fetchErrorMessage(error)).toBe('30秒待っても届かず、取得できませんでした')
    expect(fallbackBadgeText(error)).toBe('時間切れ')
  })

  it('ふつうの通信失敗は、今までどおり「取得できませんでした」「オフライン」', () => {
    const error = new TypeError('Failed to fetch')
    expect(fetchErrorMessage(error)).toBe('取得できませんでした')
    expect(fallbackBadgeText(error)).toBe('オフライン')
  })
})

describe('ホーム画面の取得中の表示', () => {
  it('取得中は秒数が1秒ずつ増え、更新ボタンが回る。MSM・ECMWFが届いたら参考モデルを待たずに表が出る', async () => {
    // 1秒ごとの書き換えと時計だけを早送りできるようにする
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] })
    vi.setSystemTime(new Date())
    const gates = stubGatedFetch()
    const container = document.createElement('div')
    const done = renderTopScreen(container, locations)

    // 取得を始めた直後：「取得中… 0秒」、更新ボタンは押せず回っている
    expect(statusText(container)).toBe('取得中… 0秒')
    expect(refreshButton(container).classList.contains('is-loading')).toBe(true)
    expect(refreshButton(container).disabled).toBe(true)

    // 3秒たつと「3秒」になる（止まっていないことが分かる）
    vi.advanceTimersByTime(3000)
    expect(statusText(container)).toBe('取得中… 3秒')

    // MSM・ECMWFが届いた：参考モデルはまだでも、表と取得時刻が出る。更新ボタンはまだ回っている
    gates.main.resolve()
    await vi.waitFor(() => expect(statusText(container)).not.toContain('取得中'))
    expect(statusText(container)).toMatch(/\d+:\d+ 取得$/)
    expect(container.querySelectorAll('.matrix-row')).toHaveLength(2)
    expect(refreshButton(container).classList.contains('is-loading')).toBe(true)

    // 参考モデルも届いた：更新ボタンが止まり、また押せるようになる
    gates.reference.resolve()
    await done
    expect(refreshButton(container).classList.contains('is-loading')).toBe(false)
    expect(refreshButton(container).disabled).toBe(false)
    expect(container.querySelectorAll('.matrix-row')).toHaveLength(2)
  })

  it(`上限（${config.fetchTimeoutSeconds}秒）を過ぎたら待つのをやめ、時間切れと出して保存済みの予報を表示する`, async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] })
    vi.setSystemTime(new Date())
    saveOldCache()
    stubHangingFetch()
    const container = document.createElement('div')
    const done = renderTopScreen(container, locations)

    await vi.advanceTimersByTimeAsync((config.fetchTimeoutSeconds - 1) * 1000)
    expect(statusText(container)).toBe(`取得中… ${config.fetchTimeoutSeconds - 1}秒`)

    await vi.advanceTimersByTimeAsync(1000)
    await done
    expect(container.textContent).toContain(
      `${config.fetchTimeoutSeconds}秒待っても届かず、取得できませんでした。保存済みの予報を表示しています`
    )
    expect(container.querySelector('.badge-offline').textContent).toBe('時間切れ')
    expect(container.querySelectorAll('.matrix-row')).toHaveLength(2)
    expect(refreshButton(container).classList.contains('is-loading')).toBe(false)
    expect(refreshButton(container).disabled).toBe(false)
  })
})

describe('比較画面の取得中の表示', () => {
  it('MSM・ECMWFが届いたら表が出て、参考モデルのマスは届くまで「…」になる', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] })
    vi.setSystemTime(new Date())
    const gates = stubGatedFetch()
    const onUpdated = vi.fn()
    const container = document.createElement('div')
    renderModelCompareScreen(container, locations, { onUpdated })

    refreshButton(container).click()
    expect(statusText(container)).toBe('取得中… 0秒')
    vi.advanceTimersByTime(2000)
    expect(statusText(container)).toBe('取得中… 2秒')

    const waitingCells = () =>
      [...container.querySelectorAll('.compare-cell.is-reference .compare-out')].filter(
        (node) => node.textContent === '…'
      )

    gates.main.resolve()
    await vi.waitFor(() => expect(container.querySelectorAll('.compare-table')).toHaveLength(2))
    expect(waitingCells().length).toBeGreaterThan(0)
    expect(refreshButton(container).classList.contains('is-loading')).toBe(true)
    expect(onUpdated).toHaveBeenCalledTimes(1) // ホームにも先に知らせる

    gates.reference.resolve()
    await vi.waitFor(() => expect(refreshButton(container).classList.contains('is-loading')).toBe(false))
    expect(waitingCells()).toHaveLength(0)
    expect(onUpdated).toHaveBeenCalledTimes(2)
  })
})
